// SvelteKit source uses extensionless imports; teach Node's ESM resolver to add .ts
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.[a-z]+$/.test(spec)) {
    const url = new URL(spec + '.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
  }
  return next(spec, ctx);
}
