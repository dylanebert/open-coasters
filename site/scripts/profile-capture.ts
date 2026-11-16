import { Camera, StandardRenderer, Transform, StandardRenderingPlugin, Meshes, Materials, MeshInstance, MeshMaterial, StandardMaterial } from '@dylanebert/shallot';
import { Tonemapping, TonemappingMethod, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { profileView, palettes, strokes, cameraConfiguration, cameraTransform, nativeInputs } from '../src/profile-plate';
import { recomposeProfile } from './profile-annotations';
import { nativeIdentity, sha256 } from '../src/profile-evidence';
const p=profileView(),evidence:unknown[]=[];
const linear=(c:number)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
for(const theme of ['light','dark'] as const) {
  const colors=palettes[theme]; let camera=0;
  const app=await openGpuApp({plugins:[{name:'ProfilePlate',dependencies:[StandardRenderingPlugin],initialize(w){
    const mesh=w.resource(Meshes).add(strokes());
    const rgb=[1,3,5].map(i=>linear(parseInt(colors.ink.slice(i,i+2),16)/255));
    const material=w.resource(Materials).add(StandardMaterial({baseColor:[...rgb,1],unlit:true}));
    const entity=w.create();w.add(entity,Transform);w.add(entity,MeshInstance,{mesh});w.add(entity,MeshMaterial,material);
    camera=w.create();w.add(camera,Camera,{...cameraConfiguration(p),clearColor:parseInt(colors.bg.slice(1),16)});
    w.add(camera,Tonemapping,{method:TonemappingMethod.None});w.add(camera,StandardRenderer);w.add(camera,Transform,cameraTransform(p));
    attachTexture(w,camera,{width:p.width,height:p.height});
  }}]});
  try {
    app.world.step(0);await app.world.frameFence;
    const capture=await captureTexture(app.world,camera);
    await sharp(capture.rgba,{raw:{width:p.width,height:p.height,channels:4}}).png().toFile(new URL(`../../assets/figures/profile-${theme}-raw.png`,import.meta.url).pathname);
    evidence.push({theme,adapter:app.world.gpu.adapter,camera:cameraConfiguration(p),transform:cameraTransform(p),width:capture.width,height:capture.height});
  } finally {app.dispose();}
}
const rawHashes=Object.fromEntries(['light','dark'].map(theme=>{const name=`profile-${theme}-raw.png`;return [name,sha256(readFileSync(new URL(`../../assets/figures/${name}`,import.meta.url)))];}));
await Bun.write(new URL('../../assets/figures/profile-capture.json',import.meta.url),JSON.stringify({tool:`Bun ${Bun.version} / Shallot 0.10.5 / Dawn (webgpu 0.6.2) / sharp 0.34.5`,command:'cd site && bun --preload ./scripts/preload.ts scripts/profile-capture.ts',recomposition:'cd site && bun scripts/profile-annotations.ts',source:'site/src/profile-polygon.json',representation:'Illustrative authored 12-sided polygon, radius 0.3m about O; 24 thin stroke triangles, no interior',inputs:nativeInputs(),nativeIdentity:nativeIdentity(),captures:evidence,sha256:rawHashes},null,2)+'\n');
for(const theme of ['light','dark'] as const) await recomposeProfile(theme);
