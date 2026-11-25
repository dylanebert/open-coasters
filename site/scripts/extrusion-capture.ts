import { Camera, StandardRenderer, Transform, StandardRenderingPlugin, Meshes, Materials, MeshInstance, MeshMaterial, StandardMaterial } from '@dylanebert/shallot';
import { Tonemapping, TonemappingMethod, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import sharp from 'sharp';
import { loadGltfScene, spawnGltfScene } from '@dylanebert/shallot/gltf';
import { readFile } from 'node:fs/promises';
import { railOrigin, oppositeOrigin } from '../src/profile-extrusion';
import { tieOffsets, ghostColor } from '../src/tie-context';
import { readFileSync } from 'node:fs';
import { palettes, cameraConfiguration, cameraTransform } from '../src/profile-plate';
import { view as profileView, outline, walls, wallColors, inputs as nativeInputs, identity as nativeIdentity } from '../src/profile-extrusion';
import { recomposeProfile } from './extrusion-annotations';
import { sha256 } from '../src/profile-evidence';
const p=profileView(),evidence:unknown[]=[];
const linear=(c:number)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>String(input).startsWith('file:')?new Response(await readFile(new URL(String(input)))):nativeFetch(input,init);
try {
for(const theme of ['light','dark'] as const) {
  const colors=palettes[theme]; let camera=0;
  const app=await openGpuApp({plugins:[{name:'ProfilePlate',dependencies:[StandardRenderingPlugin],async initialize(w){
    const ghost=w.resource(Materials).add(StandardMaterial({baseColor:ghostColor(theme) as [number,number,number,number],unlit:true}));
    const model=await loadGltfScene(w,p.asset);
    for(const z of tieOffsets){const instance=spawnGltfScene(w,model);if(instance.entities.length!==1)throw Error('Expected exactly one tie primitive');for(const entity of instance.entities){w.add(entity,Transform,{translation:[0,0,z]});w.add(entity,MeshMaterial,ghost);}}
    const opposite=w.create();w.add(opposite,Transform,{translation:[...oppositeOrigin]});w.add(opposite,MeshInstance,{mesh:w.resource(Meshes).add(walls())});w.add(opposite,MeshMaterial,ghost);
    const wallMesh=w.resource(Meshes).add(walls());
    const wallRgb=[1,3,5].map(i=>linear(parseInt(wallColors[theme].slice(i,i+2),16)/255));
    const wallMaterial=w.resource(Materials).add(StandardMaterial({baseColor:[...wallRgb,1],unlit:true}));
    const wall=w.create();w.add(wall,Transform,{translation:[...railOrigin]});w.add(wall,MeshInstance,{mesh:wallMesh});w.add(wall,MeshMaterial,wallMaterial);
    const mesh=w.resource(Meshes).add(outline());
    const rgb=[1,3,5].map(i=>linear(parseInt(colors.ink.slice(i,i+2),16)/255));
    const material=w.resource(Materials).add(StandardMaterial({baseColor:[...rgb,1],unlit:true}));
    const entity=w.create();w.add(entity,Transform,{translation:[...railOrigin]});w.add(entity,MeshInstance,{mesh});w.add(entity,MeshMaterial,material);
    camera=w.create();w.add(camera,Camera,{...cameraConfiguration(p),clearColor:parseInt(colors.bg.slice(1),16)});
    w.add(camera,Tonemapping,{method:TonemappingMethod.None});w.add(camera,StandardRenderer);w.add(camera,Transform,cameraTransform(p));
    attachTexture(w,camera,{width:p.width,height:p.height});
  }}]});
  try {
    app.world.step(0);await app.world.frameFence;
    const capture=await captureTexture(app.world,camera);
    await sharp(capture.rgba,{raw:{width:p.width,height:p.height,channels:4}}).png().toFile(new URL(`../../assets/figures/profile-extrusion-${theme}-raw.png`,import.meta.url).pathname);
    evidence.push({theme,adapter:app.world.gpu.adapter,camera:cameraConfiguration(p),transform:cameraTransform(p),width:capture.width,height:capture.height});
  } finally {app.dispose();}
}
} finally {globalThis.fetch=nativeFetch;}
const rawHashes=Object.fromEntries(['light','dark'].map(theme=>{const name=`profile-extrusion-${theme}-raw.png`;return [name,sha256(readFileSync(new URL(`../../assets/figures/${name}`,import.meta.url)))];}));
await Bun.write(new URL('../../assets/figures/profile-extrusion-capture.json',import.meta.url),JSON.stringify({tool:`Bun ${Bun.version} / Shallot 0.10.5 / Dawn (webgpu 0.6.2) / sharp 0.34.5`,command:'cd site && bun --preload ./scripts/preload.ts scripts/extrusion-capture.ts',recomposition:'cd site && bun scripts/extrusion-annotations.ts',source:'site/src/profile-polygon.json',representation:'Illustrative authored 12-sided polygon, radius 0.03m about O; one long uncapped rail with annotated starting section; all rigid native ties and opposite rail ghosted with opaque illustration colors',inputs:nativeInputs(),nativeIdentity:nativeIdentity(),captures:evidence,sha256:rawHashes},null,2)+'\n');
for(const theme of ['light','dark'] as const) await recomposeProfile(theme);
