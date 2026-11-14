import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

export const rootPath = fileURLToPath(new URL('../', import.meta.url));
export const envPath = fileURLToPath(new URL('../.env', import.meta.url));
export const apiKeyPattern = /^sk-or-[A-Za-z0-9_-]{16,500}$/;

export function saveApiKey(apiKey: string, destination = envPath) {
  if (!apiKeyPattern.test(apiKey)) throw new Error('Invalid OpenRouter key format.');
  let contents = '';
  try { contents = readFileSync(destination, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let replaced = false;
  contents = contents.replace(/^[\t ]*(?:export[\t ]+)?OPENROUTER_API_KEY[\t ]*=[^\r\n]*/gm, () => {
    if (replaced) return '';
    replaced = true;
    return `OPENROUTER_API_KEY=${apiKey}`;
  });
  if (!replaced) contents = `${contents}${contents && !contents.endsWith('\n') ? '\n' : ''}OPENROUTER_API_KEY=${apiKey}\n`;
  // Keep every intermediate file under Vite's .env.* deny rule. Rename is atomic.
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, destination);
  } finally {
    try { unlinkSync(temporary); } catch { /* Renamed or never created. */ }
  }
}
export function readConfig() {
  let env: Record<string, string> = {};
  try { env = parse(readFileSync(envPath)); } catch { /* Environment variables also work. */ }
  const apiKey = (env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
  return {
    apiKey: /^(your[-_ ]|paste|sk-or-\.\.\.)/i.test(apiKey) ? '' : apiKey,
    model: env.TYPESAFE_MODEL || process.env.TYPESAFE_MODEL || 'jev-1.13',
    port: Number(process.env.PORT || env.PORT || 5173),
  };
}
