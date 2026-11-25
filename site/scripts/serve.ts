import { resolve } from 'node:path';
import { boundedPath } from '../src/paths';

export function staticHandler(root: string) {
  return async (request: Request) => {
    try {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.includes('\0') || path.includes('\\')) return new Response('Bad path', { status: 400 });
      if (path.endsWith('/')) path += 'index.html';
      const file = Bun.file(boundedPath(root, '.' + path));
      return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
    } catch {
      return new Response('Bad path', { status: 400 });
    }
  };
}
if (import.meta.main) {
  Bun.serve({ hostname: '127.0.0.1', port: 4190, fetch: staticHandler(resolve(import.meta.dir, '../out')) });
  console.log('http://127.0.0.1:4190/open-coasters/');
}
