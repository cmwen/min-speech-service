import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const showcaseDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(showcaseDir, 'dist');

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const entry of [
  'index.html',
  'manifest.webmanifest',
  'offline.html',
  'sw.js',
  'assets',
  'icons',
]) {
  await cp(join(showcaseDir, entry), join(distDir, entry), { recursive: true });
}
