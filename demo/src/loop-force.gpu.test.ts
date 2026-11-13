import { expect, test } from 'bun:test';
import { Materials, Meshes, MeshMaterial, Transform } from '@dylanebert/shallot';
import type { Mesh, MeshData } from '@dylanebert/shallot/mesh';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { liveScene } from './live';
import { Scene } from './scene';
import { initialConfiguration } from './configuration';
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
    const registry=w.resource(Meshes), add=registry.add.bind(registry);
    let raw:MeshData|undefined, control:'none'|'flat'|'transverse'|'baked'='none';
    registry.add=(mesh:MeshData|Mesh)=>{
      if(mesh.vertices instanceof Float32Array && mesh.name==='Circular rails') {
        const data=mesh as MeshData;
        raw={...data,vertices:data.vertices.slice(),indices:data.indices.slice(),color:data.color?.slice()};
        if(data.color && control!=='none') {
          const color=data.color.slice();
          if(control==='flat') color.fill(1);
          if(control==='transverse') for(let i=0;i<color.length/4;i++) color.set(i%6<3?[.1,.3,1,1]:[1,.1,.1,1],i*4);
          if(control==='baked') for(let i=0;i<color.length;i++) if(i%4!==3) color[i]*=.8;
          return add({...data,color});
        }
        return add(data);
      }
      return mesh.vertices instanceof Float32Array?add(mesh as MeshData):add(mesh as Mesh);
    };
    const update=async(appearance:'material'|'normal-force')=>{await w.gpu.device.queue.onSubmittedWorkDone();await live.update({...initial,appearance});};
    await update('material'); await capture();
    // Force a registration after installing the independent capture hook.
    await update('normal-force');
    const colored=raw!;
    expect(colored.color).toBeDefined();
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
      await update('material'); control=negative; await update('normal-force');
      expect(raw!.vertices).toEqual(colored.vertices);
      expect(raw!.indices).toEqual(colored.indices);
      expect(await capture()).not.toEqual(image);
    }
    // Evaluate the documented linear multiplication independently at the input:
    // white native base × (0.8 × field color) must render like 0.8 base × field.
    if(proof==='native material multiplication') {
    await update('material');control='baked';await update('normal-force');
    materials.update(handle,{baseColor:[1,1,1,1]});
    const baked=await capture();
    let maxError=0;
    for(let i=0;i<image.length;i++)maxError=Math.max(maxError,Math.abs(image[i]-baked[i]));
    expect(maxError).toBeLessThanOrEqual(1); // unorm16 packing / 8-bit capture
    materials.update(handle,{baseColor:[.8,.8,.8,1]});
    }
    control='none';await update('material');await update('normal-force');
    expect(await capture()).toEqual(image);
    expect(registrations).toBe(0);
  } finally {app.dispose();}
},TIMEOUT.gpu);

test('appearance replacement releases old meshes, retains camera and bounds registry/material registrations', async () => {
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
    for(let i=0;i<6;i++) {
      const old=[...registry].flatMap(m=>[m.vertices,m.indices]);
      await w.gpu.device.queue.onSubmittedWorkDone();
      await live.update({...initial,appearance:i%2?'material':'normal-force'});
      expect(old.every(b=>b.destroyed)).toBe(true);
      expect(registry.size).toBe(baselineCount);
      expect(refs.camera).toBe(camera);
      expect([orbit.yaw.get(camera),orbit.pitch.get(camera),orbit.distance.get(camera),...orbit.pan.read(camera,new Float32Array(4))]).toEqual(view);
      const t=w.storage(Transform);
      for(const group of refs.instances)for(const e of group)for(const scale of [t.scale.x.get(e),t.scale.y.get(e),t.scale.z.get(e)])expect(scale).toBeCloseTo(1,6);
      w.step(0);await w.frameFence;
    }
    expect(registrations).toBe(0);
    await w.gpu.device.queue.onSubmittedWorkDone();
    expect(await w.gpu.device.popErrorScope()).toBeNull();
  }finally{app.dispose();}
},TIMEOUT.gpu);
