import { expect, test } from 'bun:test';
import { Materials, Meshes, MeshMaterial, Transform } from '@dylanebert/shallot';
import { decodeColor } from '@dylanebert/shallot/mesh';
import { packUnorm2 } from '@dylanebert/shallot/utils';
import * as d from 'typegpu/data';
import { readMesh } from './gpu-probe';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { liveScene } from './live';
import { Scene } from './scene';
import { initialConfiguration as initialState, effective } from './configuration';
const initialConfiguration = effective({...initialState, selected:'track'});
import { assemblyDefaults } from './assembly';

for(const proof of ['field controls','native material multiplication'] as const) test(`recorded support renders along unchanged rails: ${proof}`, async () => {
  const initial={...initialConfiguration,example:'assembly' as const,assembly:{...assemblyDefaults,path:'loop' as const}};
  const live=liveScene(initial,name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
  const app=await openGpuApp({plugins:[live.plugin]});
  try {
    const w=app.world, refs=w.resource(Scene), camera=refs.camera, orbit=w.storage(Orbit);
    attachTexture(w,camera,{width:512,height:512});
    orbit.yaw.set(camera,Math.PI/2); orbit.pitch.set(camera,0);
    const capture=async()=>{w.step(0); const frame=await captureTexture(w,camera); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone(); return frame.rgba;};
    // Let the existing time-based camera projection settle before comparisons.
    for(let i=0;i<10;i++){w.step(1/15);await w.frameFence;}
    const materials=w.resource(Materials), addMaterial=materials.add.bind(materials);
    let registrations=0;
    materials.add=(...args)=>{registrations++;return addMaterial(...args);};
    const registry=w.resource(Meshes);
    const update=async(appearance:'material'|'normal-force')=>{await w.gpu.device.queue.onSubmittedWorkDone();await live.update({...initial,appearance});};
    await update('material'); await capture();
    await update('normal-force');
    await capture();
    const mesh=[...registry].find(m=>m.name==='Circular rails')!;
    expect(mesh.streams?.color).toBe(true);
    const colored=await readMesh(w,mesh);
    const words=new Uint32Array(colored.main), quant=new DataView(colored.quant), ids=new Uint32Array(colored.indices);
    // The public appended-stream layout uses absolute vertex indices. Mutate the
    // actual renderer buffer for negative controls, not Meshes.add staging data.
    const controls=async(control:'flat'|'transverse'|'baked'|'none')=>{
      const changed=words.slice(), stride=(mesh.streams?.uv1?2:0)+(mesh.streams?.tangent?1:0)+2;
      const prefix=stride-2;
      for(const index of new Set(ids.slice(mesh.indexBase,mesh.indexBase+mesh.indexCount))) {
        const row=words[index*4+1]>>>16, base=quant.getUint32(row*48+40,true)*4+index*stride+prefix;
        const original=decodeColor(d.vec2u(words[base],words[base+1]));
        const color=control==='flat'?[1,1,1,1]:control==='transverse'?(index%6<3?[.1,.3,1,1]:[1,.1,.1,1]):control==='baked'?[original.x*.8,original.y*.8,original.z*.8,original.w]:[original.x,original.y,original.z,original.w];
        changed[base]=packUnorm2(color[0],color[1]);changed[base+1]=packUnorm2(color[2],color[3]);
      }
      w.gpu.device.queue.writeBuffer(w.gpu.root.unwrap(mesh.vertices),0,changed);
    };
    const handle=w.storage(MeshMaterial).material.get(refs.instances[0][0]);
    const material=materials.get(handle)!;
    [...material.baseColor].forEach((v,i)=>expect(v).toBeCloseTo(i===3?1:.8,6));
    expect(material.metallic).toBeCloseTo(.7,6);
    expect(material.perceptualRoughness).toBeCloseTo(.25,6);
    const image=await capture();
    let red=0,blue=0;
    for(let i=0;i<image.length;i+=4){if(image[i]>image[i+2]*1.3 && image[i]>image[i+1]*1.3)red++;if(image[i+2]>image[i]*1.3 && image[i+2]>image[i+1]*1.1)blue++;}
    expect(red).toBeGreaterThan(20); expect(blue).toBeGreaterThan(20);
    if(proof==='field controls') for(const negative of ['flat','transverse'] as const) {
      await controls(negative);
      const actual=await readMesh(w,mesh);
      expect(actual.position).toEqual(colored.position);
      expect(actual.indices).toEqual(colored.indices);
      expect(await capture()).not.toEqual(image);
    }
    // Evaluate the documented linear multiplication independently at the input:
    // white native base × (0.8 × field color) must render like 0.8 base × field.
    if(proof==='native material multiplication') {
    await controls('baked');
    materials.update(handle,{baseColor:[1,1,1,1]});
    const baked=await capture();
    let maxError=0;
    for(let i=0;i<image.length;i++)maxError=Math.max(maxError,Math.abs(image[i]-baked[i]));
    expect(maxError).toBeLessThanOrEqual(1); // unorm16 packing / 8-bit capture
    materials.update(handle,{baseColor:[.8,.8,.8,1]});
    }
    await controls('none');
    expect(await capture()).toEqual(image);
    expect(registrations).toBe(0);
  } finally {app.dispose();}
},TIMEOUT.gpu);

test('appearance changes retain camera and bound resident meshes/material registrations', async () => {
  const initial={...initialConfiguration,example:'assembly' as const,assembly:{...assemblyDefaults,path:'loop' as const}};
  const live=liveScene(initial,name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
  const app=await openGpuApp({plugins:[live.plugin]});
  try {
    const w=app.world, refs=w.resource(Scene), camera=refs.camera, orbit=w.storage(Orbit);
    orbit.yaw.set(camera,1.1);orbit.pitch.set(camera,-.4);
    const view=[orbit.yaw.get(camera),orbit.pitch.get(camera),orbit.distance.get(camera),...orbit.pan.read(camera,new Float32Array(4))];
    const registry=w.resource(Meshes), baselineCount=registry.size;
    const materials=w.resource(Materials), add=materials.add.bind(materials);
    let registrations=0; materials.add=(...args)=>{registrations++;return add(...args);};
    w.gpu.device.pushErrorScope('validation');
    let warmCount=baselineCount;
    for(let i=0;i<6;i++) {
      await w.gpu.device.queue.onSubmittedWorkDone();
      await live.update({...initial,appearance:i%2?'material':'normal-force'});

      expect(refs.camera).toBe(camera);
      expect([orbit.yaw.get(camera),orbit.pitch.get(camera),orbit.distance.get(camera),...orbit.pan.read(camera,new Float32Array(4))]).toEqual(view);
      const t=w.storage(Transform);
      for(const group of refs.instances)for(const e of group)for(const scale of [t.scale.x.get(e),t.scale.y.get(e),t.scale.z.get(e)])expect(scale).toBeCloseTo(1,6);
      w.step(0);await w.frameFence;
      if(i<2) warmCount=Math.max(warmCount,registry.size);
      else expect(registry.size).toBeLessThanOrEqual(warmCount);
      const {points}=await readMesh(w,[...registry].find(m=>m.name==='Circular rails')!);
      expect(points.flat().every(Number.isFinite)).toBe(true);
    }
    expect(registrations).toBe(0);
    await w.gpu.device.queue.onSubmittedWorkDone();
    expect(await w.gpu.device.popErrorScope()).toBeNull();
  }finally{app.dispose();}
},TIMEOUT.gpu);
