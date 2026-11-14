import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/background.ts', 'src/content.ts', 'src/popup.ts', 'src/options.ts'], bundle: true, outdir: 'dist', target: 'chrome120', format: 'iife', sourcemap: false, minify: false });
console.log('Built extension in dist/');
