import express from 'express';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createApp } from './app.js';
import { rootPath, readConfig } from './config.js';

const app = createApp();
const server = createServer(app);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(rootPath, 'dist'), { dotfiles: 'deny' }));
  app.get('/{*path}', (_req, res) => { res.sendFile(join(rootPath, 'dist/index.html')); });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root: rootPath, server: { middlewareMode: true, ws: { server }, fs: { strict: true, allow: [rootPath] } }, appType: 'spa' });
  app.use(vite.middlewares);
}
const { port } = readConfig();
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
server.listen(port, '127.0.0.1', () => { console.log(`Emote is running at http://127.0.0.1:${port}`); });
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Change PORT in .env.` : 'Could not start the local server.');
  process.exit(1);
});
