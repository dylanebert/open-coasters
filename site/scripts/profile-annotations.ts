import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { overlay, palettes } from '../src/profile-plate';
import { assertNativeIdentity, sha256, withFinalHashes, type ProfileEvidence } from '../src/profile-evidence';
export async function recomposeProfile(theme:keyof typeof palettes, root=new URL('../../assets/figures/',import.meta.url)) {
  const manifest=new URL('profile-capture.json',root);
  let evidence:ProfileEvidence|undefined;
  try { evidence=JSON.parse(await readFile(manifest,'utf8')); }
  catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
  const rawName=`profile-${theme}-raw.png`,finalName=`profile-${theme}.png`,raw=await readFile(new URL(rawName,root));
  if(evidence) {
    assertNativeIdentity(evidence);
    if(evidence.sha256[rawName]!==sha256(raw)) throw Error('Raw profile capture hash mismatch');
  }
  const final=await sharp(raw).composite([{input:Buffer.from(overlay(theme))}]).png().toBuffer();
  await writeFile(new URL(finalName,root),final);
  const updated=withFinalHashes(evidence,{[finalName]:sha256(final)});
  if(updated) await writeFile(manifest,JSON.stringify(updated,null,2)+'\n');
}
if(import.meta.main) for(const theme of ['light','dark'] as const) await recomposeProfile(theme);
