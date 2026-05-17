import { access, readFile } from 'node:fs/promises';
import { dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));

const showcaseRoots = [
  resolve(moduleDir, '../../showcase/dist'),
  resolve(moduleDir, '../../showcase'),
  resolve(moduleDir, '../../../showcase/dist'),
  resolve(moduleDir, '../../../showcase'),
];

const directFileMap = new Map([
  ['/', 'index.html'],
  ['/offline.html', 'offline.html'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/sw.js', 'sw.js'],
]);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
} as const;

const resolveAssetPath = (pathname: string) => {
  const mapped = directFileMap.get(pathname);

  if (mapped) {
    return mapped;
  }

  if (pathname.startsWith('/assets/') || pathname.startsWith('/icons/')) {
    const normalized = normalize(pathname.slice(1)).replaceAll('\\', '/');

    if (
      normalized.startsWith('../') ||
      normalized === '..' ||
      normalized.includes('/../')
    ) {
      return null;
    }

    return normalized;
  }

  return null;
};

const getContentType = (pathname: string) =>
  contentTypes[extname(pathname) as keyof typeof contentTypes] ??
  'application/octet-stream';

const getCacheControl = (pathname: string) =>
  pathname.endsWith('.html') ||
  pathname.endsWith('.webmanifest') ||
  pathname === 'sw.js'
    ? 'no-cache'
    : 'public, max-age=3600';

export const readShowcaseAsset = async (pathname: string) => {
  const relativePath = resolveAssetPath(pathname);

  if (!relativePath) {
    return null;
  }

  for (const root of showcaseRoots) {
    const absolutePath = resolve(root, relativePath);

    if (!absolutePath.startsWith(root)) {
      continue;
    }

    try {
      await access(absolutePath);
      return {
        body: await readFile(absolutePath),
        cacheControl: getCacheControl(relativePath),
        contentType: getContentType(relativePath),
      };
    } catch {}
  }

  return null;
};
