import test from 'node:test';
import assert from 'node:assert/strict';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { catalog, buckets, keywordSuggestions } from '../server/catalog.js';
import { suggestWithJev } from '../server/suggest.js';
import { createApp } from '../server/app.js';
import { saveApiKey } from '../server/config.js';
import { verifyConnection, ConnectionError } from '../server/connection.js';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the complete catalog is reachable, including flags, ZWJ sequences and skin tones', () => {
  assert.ok(catalog.length > 3900);
  assert.equal(new Set(catalog.map(e => e.id)).size, catalog.length);
  assert.ok(catalog.some(e => e.emoji === '🇮🇳'));
  assert.ok(catalog.some(e => e.emoji === '👩🏽‍💻'));
  assert.ok(catalog.some(e => e.emoji === '🍣'));
  assert.ok(buckets.length <= 255);
  assert.ok(buckets.every(bucket => bucket.emojis.length <= 255));
  const reachable = buckets.flatMap(bucket => bucket.emojis.map(e => e.id));
  assert.equal(reachable.length, catalog.length);
  assert.deepEqual(new Set(reachable), new Set(catalog.map(e => e.id)));
});

test('keyword preview searches the catalog and leaves unrelated messages empty', () => {
  assert.ok(keywordSuggestions('pizza for dinner').some(e => e.emoji === '🍕'));
  assert.deepEqual(keywordSuggestions('zzzzqwertyzzzz'), []);
  assert.deepEqual(keywordSuggestions('the and I'), []);
});

test('real TypeSafe SDK uses the OpenRouter endpoint and routes typed decisions to valid emoji', async () => {
  const coffee = catalog.find(e => e.emoji === '☕')!;
  const pizza = catalog.find(e => e.emoji === '🍕')!;
  const coffeeBucket = buckets.find(b => b.emojis.some(e => e.id === coffee.id))!;
  const pizzaBucket = buckets.find(b => b.emojis.some(e => e.id === pizza.id))!;
  let requests = 0;
  const client = new TypeSafeClient({
    apiKey: 'test-key-never-real', baseURL: 'https://openrouter.ai/api', compression: false, retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      requests++;
      assert.equal(String(url), 'https://openrouter.ai/api/v1/systemone');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key-never-real');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'jev-1.13');
      assert.equal(body.state.message, 'Coffee and pizza');
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions) as [string, { criteria: Record<string, unknown> }][]) {
        assert.ok(Object.keys(question.criteria).length <= 255);
        const selected = id === 'categories' ? coffeeBucket.id : id === coffeeBucket.id ? coffee.id : pizza.id;
        const probabilities = Object.fromEntries(Object.keys(question.criteria).map(key => [key, 0]));
        probabilities[selected] = id === 'categories' ? 0.7 : 1;
        if (id === 'categories') probabilities[pizzaBucket.id] = 0.3;
        answers[id] = { type: 'choice', choice: selected, confidence: 0.9, probabilities };
      }
      return Response.json({ model: 'typesafe/jev-1.13', answers, usage: { input_tokens: 100, output_tokens: 10 } });
    },
  });
  const result = await suggestWithJev(client, 'Coffee and pizza', 'jev-1.13', new AbortController().signal);
  assert.equal(requests, 2);
  assert.deepEqual(result.emojis.map(e => e.emoji), ['☕', '🍕']);
  assert.equal(result.source, 'typesafe');
  assert.equal(result.model, 'typesafe/jev-1.13');
});

test('malformed decisions fail explicitly instead of becoming fabricated AI suggestions', async () => {
  const client = new TypeSafeClient({ apiKey: 'test', compression: false, retry: { maxRetries: 0 }, fetch: async () => Response.json({ answers: { categories: { type: 'choice', probabilities: { fake: -2 } } } }) });
  await assert.rejects(suggestWithJev(client, 'hello', 'jev-1.13', new AbortController().signal));
});

test('cancelled input never starts an upstream request', async () => {
  let calls = 0;
  const client = new TypeSafeClient({ apiKey: 'test', retry: { maxRetries: 0 }, fetch: async () => { calls++; throw new Error('Should not be called'); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(suggestWithJev(client, 'hello', 'jev-1.13', controller.signal));
  assert.equal(calls, 0);
});

test('local API validates input, labels previews, refuses foreign origins and never discloses keys', async t => {
  let key = '';
  const app = createApp(() => ({ apiKey: key, model: 'jev-1.13', port: 5173 }));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown, origin = 'http://127.0.0.1:5173') => fetch(`${base}/api/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await post({ text: ' ' })).status, 400);
  assert.equal((await post({ text: 'a'.repeat(2001) })).status, 400);
  assert.equal((await post({ text: 123 })).status, 400);
  assert.equal((await post({ text: 'hi' }, 'https://example.com')).status, 403);
  const preview = await (await post({ text: 'pizza time' })).json();
  assert.equal(preview.source, 'local');
  assert.ok(preview.emojis.some((e: { emoji: string }) => e.emoji === '🍕'));
  key = 'private-test-value';
  const status = await (await fetch(`${base}/api/status`)).text();
  assert.ok(!status.includes(key));
  assert.equal(JSON.parse(status).configured, true);
});

test('saving a key preserves configuration, restricts permissions, and rejects injected lines', t => {
  const directory = mkdtempSync(join(tmpdir(), 'emote-key-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, '.env');
  writeFileSync(file, '# My configuration\nOPENROUTER_API_KEY=old\nTYPESAFE_MODEL=jev-1.13\nPORT=5555\n', { mode: 0o644 });
  const key = 'sk-or-v1-test-only-key-never-real';
  saveApiKey(key, file);
  const contents = readFileSync(file, 'utf8');
  assert.ok(contents.includes(`# My configuration\nOPENROUTER_API_KEY=${key}\n`));
  assert.ok(contents.includes('TYPESAFE_MODEL=jev-1.13\nPORT=5555'));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.throws(() => saveApiKey(`${key}\nPORT=9999`, file));
  assert.equal(readFileSync(file, 'utf8'), contents);
});

test('connection checks use OpenRouter authentication and a real SDK Jev test', async () => {
  let jevCalls = 0;
  const key = 'sk-or-v1-test-only-key-never-real';
  const client = new TypeSafeClient({ apiKey: key, baseURL: 'https://openrouter.ai/api', compression: false, retry: { maxRetries: 0 }, fetch: async (url, init) => {
    jevCalls++;
    assert.equal(String(url), 'https://openrouter.ai/api/v1/systemone');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.questions.connection.type, 'noul');
    return Response.json({ model: 'typesafe/jev-1.13', answers: { connection: { type: 'noul', noul: 1 } }, usage: { input_tokens: 12, output_tokens: 4 } });
  } });
  const auth: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://openrouter.ai/api/v1/key');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${key}`);
    return Response.json({ data: {} });
  };
  assert.equal(await verifyConnection(key, 'jev-1.13', new AbortController().signal, auth, client), 'typesafe/jev-1.13');
  assert.equal(jevCalls, 1);
  await assert.rejects(verifyConnection(key, 'jev-1.13', new AbortController().signal, async () => new Response(null, { status: 401 }), client), /rejected this key/);
  assert.equal(jevCalls, 1);
});

test('key setup requires the local app, never overwrites on a failed check, and never echoes credentials', async t => {
  let saved = ''; let reject = false; let verified = 0;
  const key = 'sk-or-v1-test-only-key-never-real';
  const app = createApp(() => ({ apiKey: saved, model: 'jev-1.13', port: 5173 }), {
    verify: async () => { verified++; if (reject) throw new ConnectionError(401, 'Invalid key.'); return 'typesafe/jev-1.13'; },
    save: value => { saved = value; },
  });
  const server = createServer(app).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown, extra: Record<string, string> = {}) => fetch(`${base}/api/settings/openrouter`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
  const headers = { Origin: 'http://127.0.0.1:5173', 'X-Emote-Setup': '1' };
  assert.equal((await post({ apiKey: key })).status, 403);
  assert.equal((await post({ apiKey: key }, { ...headers, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ apiKey: key }, { Origin: headers.Origin })).status, 403);
  assert.equal((await post({ apiKey: 'OPENROUTER_API_KEY=wrong' }, headers)).status, 400);
  assert.equal(verified, 0);
  const response = await post({ apiKey: key }, headers);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal(saved, key); assert.ok(!body.includes(key));
  assert.equal(JSON.parse(body).connectionVerified, true);
  reject = true;
  assert.equal((await post({ apiKey: 'sk-or-v1-another-test-key-not-real' }, headers)).status, 401);
  assert.equal(saved, key);
  reject = false;
  assert.equal((await post({}, headers)).status, 200);
  assert.equal(saved, key);
});
