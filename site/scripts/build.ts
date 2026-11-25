import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { render, draftOwners, type RenderOptions } from '../src/page';
import { boundedPath } from '../src/paths';
export const root=resolve(import.meta.dir,'../..');
export const out=resolve(root,'site/out/open-coasters');
export function buildPage(destination=out, options: RenderOptions = {}) {
  const page=render(root, options);
  mkdirSync(destination,{recursive:true});
  writeFileSync(boundedPath(destination,'index.html'),page.html);
  writeFileSync(boundedPath(destination,'llms.txt'),page.llms);
  rmSync(boundedPath(destination,'sources'),{recursive:true,force:true});
  rmSync(boundedPath(destination,'draft'),{recursive:true,force:true});
  if(options.draft) for(const owner of draftOwners) {
    const target=boundedPath(destination,'draft/'+owner+'.txt');
    mkdirSync(dirname(target),{recursive:true});
    cpSync(boundedPath(root,owner),target);
  }
  const fonts = [...page.html.matchAll(/url\('\/open-coasters\/(fonts\/[^']+)'\)/g)].map(m=>m[1]!);
  const notices = new Set(fonts.map(font=>dirname(font)+'/OFL.txt'));
  for(const asset of [...page.assets,...fonts,...notices]) {
    const target=boundedPath(destination,asset);
    mkdirSync(dirname(target),{recursive:true});
    cpSync(boundedPath(root,asset.startsWith('fonts/')?'demo/public/'+asset:asset),target);
  }
}
if(import.meta.main) {
  const repeated = process.argv[2] === '--private-repeated-ties';
  const preview = repeated || process.argv[2] === '--private-one-tie';
  const parent = process.argv[preview ? 3 : 2];
  if (preview && (!parent || process.argv.length !== 4)) throw Error('Pass a fresh preview parent directory');
  const destination = parent ? resolve(parent, 'open-coasters') : out;
  if (parent) mkdirSync(destination);
  else rmSync(resolve(root,'site/out'),{recursive:true,force:true});
  buildPage(destination, { draft: repeated });
  if (preview) {
    const result = Bun.spawnSync(['bun', 'run', 'build'], {
      cwd: resolve(root, 'visualizer'), env: { ...process.env, VISUALIZER_OUT: resolve(destination, 'visualizer') },
      stdout: 'inherit', stderr: 'inherit',
    });
    if (result.exitCode !== 0) throw Error('Visualizer build failed');
    cpSync(resolve(root, 'site/src/one-tie-preview.js'), resolve(destination, 'one-tie-preview.js'));
    const index = resolve(destination, 'index.html');
    const html = readFileSync(index, 'utf8');
    writeFileSync(index, html.replace('</body>', `<script type="module" src="./one-tie-preview.js${repeated ? '?repeated' : ''}"></script></body>`));
  }
  const result=Bun.spawnSync(['bun','run','build','--base=./','--outDir',resolve(destination,'demo')],{cwd:resolve(root,'demo'),stdout:'inherit',stderr:'inherit'});
  if(result.exitCode) throw Error('Demo build failed');
  console.log(destination);
}
