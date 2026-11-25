import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { overlay, assertEvidence } from '../src/profile-extrusion';
import { sha256 } from '../src/profile-evidence';
export async function recomposeProfile(theme:'light'|'dark'){
 const root=new URL('../../assets/figures/',import.meta.url),manifest=new URL('profile-extrusion-capture.json',root);
 const evidence=JSON.parse(await readFile(manifest,'utf8'));
 const name=`profile-extrusion-${theme}-raw.png`,raw=await readFile(new URL(name,root));
 assertEvidence(evidence,raw,name);
 const final=await sharp(raw).composite([{input:Buffer.from(overlay(theme))}]).png().toBuffer(),finalName=`profile-extrusion-${theme}.png`;
 await writeFile(new URL(finalName,root),final);
 evidence.sha256[finalName]=sha256(final);
 await writeFile(manifest,JSON.stringify(evidence,null,2)+'\n');
}
if(import.meta.main)for(const theme of ['light','dark'] as const)await recomposeProfile(theme);
