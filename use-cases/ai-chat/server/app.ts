import express from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { APIError, APITimeoutError } from '@typesafe-ai/sdk';
import { catalog, baseCount, keywordSuggestions } from './catalog.js';
import { apiKeyPattern, envPath, readConfig, saveApiKey } from './config.js';
import { ConnectionError, verifyConnection } from './connection.js';
import { createClient, suggestWithJev } from './suggest.js';
import type { Suggestions } from '../shared/types.js';

const requestSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
const keySchema = z.object({ apiKey: z.string().trim().regex(apiKeyPattern).optional() }).strict();
export function createApp(configProvider = readConfig, connection = { verify: verifyConnection, save: saveApiKey }) {
  const app = express();
  let verifiedFingerprint = '';
  const fingerprint = (key: string, model: string) => createHash('sha256').update(`${key}\0${model}`).digest('hex');
  const statusPayload = () => {
    const config = configProvider();
    return { configured: Boolean(config.apiKey), connectionVerified: Boolean(config.apiKey) && verifiedFingerprint === fingerprint(config.apiKey, config.model),
      model: config.model, emojiCount: catalog.length, baseCount, envPath, provider: 'OpenRouter' };
  };
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port !== String(configProvider().port)) {
          res.status(403).json({ error: 'Only this local app can make API requests.' }); return;
        }
      } catch { res.status(403).json({ error: 'Invalid origin.' }); return; }
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/status', (_req, res) => {
    res.json(statusPayload());
  });
  let saving = false;
  app.post('/api/settings/openrouter', async (req, res) => {
    // Require a same-origin JSON request with an app-specific header for this mutation.
    if (!req.headers.origin || req.headers['x-emote-setup'] !== '1' || !req.is('application/json')) {
      res.status(403).json({ error: 'Add your key from Settings in this local app.' }); return;
    }
    const parsed = keySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Paste only the OpenRouter key, starting with sk-or-. Do not include OPENROUTER_API_KEY=.' }); return; }
    const config = configProvider();
    const apiKey = parsed.data.apiKey ?? config.apiKey;
    if (!apiKey) { res.status(400).json({ error: 'Paste your OpenRouter API key first.' }); return; }
    if (saving) { res.status(429).json({ error: 'A connection test is already running. Wait a moment.' }); return; }
    saving = true;
    try {
      await connection.verify(apiKey, config.model, AbortSignal.timeout(20000));
      // Failed checks never replace a working key.
      if (parsed.data.apiKey) connection.save(apiKey);
      verifiedFingerprint = fingerprint(apiKey, config.model);
      res.json(statusPayload());
    } catch (error) {
      if (error instanceof ConnectionError) res.status(error.status).json({ error: error.message });
      else res.status(500).json({ error: 'Could not save the key to the local .env file. Check that the app folder is writable.' });
    } finally { saving = false; }
  });
  app.get('/api/emojis', (_req, res) => { res.json(catalog); });
  const cache = new Map<string, { result: Suggestions; expires: number }>();
  let period = Date.now(); let calls = 0; let active = 0;
  app.post('/api/suggest', async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Enter between 1 and 2,000 characters.' }); return; }
    const { text } = parsed.data;
    const config = configProvider();
    if (!config.apiKey) {
      res.json({ text, emojis: keywordSuggestions(text), source: 'local', model: null, elapsedMs: 0 }); return;
    }
    const cacheKey = createHash('sha256').update(`${config.apiKey}\0${config.model}\0${text}`).digest('hex');
    const existing = cache.get(cacheKey);
    if (existing && existing.expires > Date.now()) { res.json({ ...existing.result, cached: true }); return; }
    if (Date.now() - period > 60000) { calls = 0; period = Date.now(); }
    if (calls >= 90 || active >= 4) { res.status(429).json({ error: 'A few too many requests. Pause briefly, then try again.' }); return; }
    calls++; active++;
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    try {
      const result = await suggestWithJev(createClient(config.apiKey), text, config.model, signal);
      if (signal.aborted) return;
      verifiedFingerprint = fingerprint(config.apiKey, config.model);
      cache.set(cacheKey, { result, expires: Date.now() + 300000 });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      let message = 'TypeSafe could not return suggestions. Please try again.';
      let status = 502;
      if (error instanceof APIError) {
        if (error.status === 401 || error.status === 403) { message = 'OpenRouter rejected the API key. Open Settings to replace and test it.'; status = 401; }
        else if (error.status === 402) { message = 'Your OpenRouter account needs credits to use Jev.'; status = 402; }
        else if (error.status === 429) { message = 'OpenRouter is rate limiting requests. Wait a moment and retry.'; status = 429; }
        else if (error.status === 404) message = 'This Jev model is unavailable. Update TYPESAFE_MODEL in .env.';
      }
      if (error instanceof APITimeoutError || signal.aborted) { message = 'The request timed out. Try again in a moment.'; status = 504; }
      res.status(status).json({ error: message });
    } finally { active--; res.off('close', onClose); }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Unknown API route.' }); });
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!error) { next(); return; }
    const status = error.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'Message is too large.' : 'Invalid request body.' });
  });
  return app;
}
