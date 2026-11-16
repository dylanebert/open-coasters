import { Camera, StandardRenderer, Transform, GlobalAmbientLight, StandardRenderingPlugin, DirectionalLight, lookAtRotation } from '@dylanebert/shallot';
import { Tonemapping, TonemappingMethod, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { loadGltfScene, spawnGltfScene } from '@dylanebert/shallot/gltf';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { plate, palettes, cameraConfiguration, cameraTransform } from '../src/plate';
import { recompose } from './annotations';
const p = plate();
const evidence: unknown[] = [];
const nativeFetch=globalThis.fetch;
globalThis.fetch=async (input, init) => {
  const url=String(input);
  return url.startsWith('file:') ? new Response(await readFile(new URL(url))) : nativeFetch(input,init);
};
try {
for (const [theme, colors] of Object.entries(palettes)) {
  let camera = 0;
  const app = await openGpuApp({plugins:[{name:'AuthoredTiePlate', dependencies:[StandardRenderingPlugin], async initialize(w) {
    const model=await loadGltfScene(w,p.asset);
    const instance=spawnGltfScene(w,model);
    if(instance.entities.length!==1) throw Error('Expected exactly one tie primitive');
    Object.assign(w.resource(GlobalAmbientLight),{brightness:350});
    const light=w.create(); w.add(light,DirectionalLight,{illuminance:1800}); w.add(light,Transform,{rotation:lookAtRotation(-1,2,3,0,0,0,0,1,0)});
    camera=w.create(); w.add(camera,Camera,{...cameraConfiguration(p),clearColor:parseInt(colors.bg.slice(1),16)});
    w.add(camera,Tonemapping,{method:TonemappingMethod.None});
    w.add(camera,StandardRenderer); w.add(camera,Transform,cameraTransform(p));
    attachTexture(w,camera,{width:p.width,height:p.height});
  }}]});
  try {
    app.world.step(0); await app.world.frameFence;
    const capture = await captureTexture(app.world,camera);
    const raw=new URL(`../../assets/figures/tie-frame-${theme}-raw.png`,import.meta.url).pathname;
    await sharp(capture.rgba,{raw:{width:p.width,height:p.height,channels:4}}).png().toFile(raw);
    await recompose(theme as keyof typeof palettes);
    evidence.push({theme,adapter:app.world.gpu.adapter,width:capture.width,height:capture.height,
      camera:cameraConfiguration(p),transform:cameraTransform(p)});
  } finally { app.dispose(); }
}
} finally { globalThis.fetch=nativeFetch; }
await Bun.write(new URL('../../assets/figures/capture.json',import.meta.url),JSON.stringify({tool:`Bun ${Bun.version} / Shallot 0.10.5 / Dawn (webgpu 0.6.2) / sharp 0.34.5`, command:'cd site && bun --preload ./scripts/preload.ts scripts/capture.ts',captures:evidence},null,2)+'\n');
