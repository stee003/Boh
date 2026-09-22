// Node loader that maps @shared/* to the repo's shared/ directory (mirrors vite.config.js).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@shared/')) {
    const p = path.join(root, 'shared', specifier.slice('@shared/'.length));
    if (existsSync(p)) return nextResolve(pathToFileURL(p).href, context);
  }
  return nextResolve(specifier, context);
}
