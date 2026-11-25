import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export function boundedPath(root: string, path: string): string {
  const target = resolve(root, path);
  const inside = (parent: string, child: string) => {
    const rel = relative(parent, child);
    return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
  };
  if (!inside(resolve(root), target)) throw Error('Path escapes root');
  let existing = target;
  while (!existsSync(existing)) existing = dirname(existing);
  let rootAncestor = resolve(root);
  while (!existsSync(rootAncestor)) rootAncestor = dirname(rootAncestor);
  const realRoot = resolve(realpathSync(rootAncestor), relative(rootAncestor, resolve(root)));
  if (!inside(realRoot, realpathSync(existing)) && existing !== rootAncestor) throw Error('Symlink escapes root');
  return target;
}
