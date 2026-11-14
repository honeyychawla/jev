import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'local-config.json'), 'utf8').catch(() => '{}'));
const url = `http://127.0.0.1:${config.port || 4318}`;
async function running() {
  try { const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1200) }); const data = await r.json(); if (data.app !== 'slice-jev-demo') throw new Error('Port belongs to a different app.'); return true; }
  catch (e) { if (e.message === 'Port belongs to a different app.') throw e; return false; }
}
if (!(await running())) {
  const log = openSync(path.join(root, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: root, detached: true, stdio: ['ignore', log, log], env: { ...process.env } });
  child.unref();
  await writeFile(path.join(root, '.server.pid'), String(child.pid));
  let ready = false;
  for (let i = 0; i < 30; i++) { if (await running()) { ready = true; break; } await new Promise(r => setTimeout(r, 150)); }
  if (!ready) throw new Error('The local server could not start. See server.log.');
}
console.log(`Domino’s demo is ready at ${url}`);
if (!process.argv.includes('--no-open')) spawn('/usr/bin/open', [url], { stdio: 'ignore', detached: true }).unref();
