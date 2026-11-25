import { beforeAll, afterAll, expect, test } from 'bun:test';
import { Materials, Meshes, MeshInstance, MeshMaterial } from '@dylanebert/shallot';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { globalTransformTable, attachTexture } from '@dylanebert/shallot/rendering';
import { octDecodeNormal } from '@dylanebert/shallot/utils';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { initialConfiguration, effective } from './configuration';
import { assemblyDefaults, packRails } from './assembly';
import { constructDemo, diagnosticPost } from './construction-demo';
import { readNative, contentValue } from '../../construction/native';
import { loadSampledSection } from './sampled-section';
import { liveScene } from './live';
import { Scene } from './scene';
import { RailGpu } from './rail-gpu';
import { readMesh } from './gpu-probe';

const url=(name:string)=>new URL(`../public/assets/${name}.gltf`,import.meta.url);
const initial={...effective(initialConfiguration),example:'assembly' as const,assembly:{...assemblyDefaults}};
const live=liveScene(initial,url);
let app:Awaited<ReturnType<typeof openGpuApp>>;
const references=new Map<string,Float32Array>();
const kinds=['straight','curve','loop'] as const, separations=[.6,1.1,1.6];
beforeAll(async()=>{
  const section=await loadSampledSection(url('assembly-section'));
  const tie=contentValue({snapshot:await readNative(url('assembly-tie-bar'))}),post=contentValue({snapshot:diagnosticPost});
  for(const path of kinds)for(const separation of separations) {
    const result=constructDemo({...assemblyDefaults,path,separation},section,tie,post);
    references.set(`${path}:${separation}`,packRails(result.rails,result.stations,section.length).vertices);
  }
  app=await openGpuApp({plugins:[live.plugin]});
  attachTexture(app.world,app.world.resource(Scene).camera,{width:128,height:96});
  app.world.step(0);await app.world.frameFence;
},TIMEOUT.startup);
afterAll(()=>app?.dispose());

for(const path of kinds)test(`retained ${path}: complete low/interior/high GPU positions, normals, caps and bounds`,async()=>{
  const w=app.world,s=w.resource(RailGpu),mesh=s.mesh;
  for(const separation of separations) {
    await live.update({...initial,assembly:{...assemblyDefaults,path,separation}});
    w.step(0);await w.frameFence;
    const actual=await readMesh(w,mesh),words=new Uint32Array(actual.main),ids=new Uint32Array(actual.indices),expected=references.get(`${path}:${separation}`)!;
    if(process.env.RAIL_GPU_EVIDENCE) {
      const prefix=`${process.env.RAIL_GPU_EVIDENCE}/${path}-${separation}`;
      await Promise.all([Bun.write(`${prefix}-main.bin`,actual.main),Bun.write(`${prefix}-position.bin`,actual.position),Bun.write(`${prefix}-indices.bin`,actual.indices),Bun.write(`${prefix}-quant.bin`,actual.quant),Bun.write(`${prefix}-cpu-f32.bin`,expected)]);
    }
    const quants=await mesh.quant!.read(),quant=quants[kinds.indexOf(path)];
    // Eight f32 epsilon envelopes cover source/parameter conversion, two
    // multiplies/two adds and the reference's final f32 conversion. Unit bases,
    // the <=.86m local envelope and the symmetric rail pair bound intermediate
    // magnitudes by this path's coordinate envelope (at least one metre).
    const coordinateBound=8*2**-23*Math.max(1,...expected.filter((_,i)=>i%8<3).map(Math.abs));
    const quantBound=Math.max(quant.posScale.x,quant.posScale.y,quant.posScale.z)/65535;
    expect(actual.points.length).toBe(expected.length/8);
    let maxPosition=0,maxNormal=0;
    for(let i=0;i<actual.points.length;i++) {
      expect(ids[i]).toBe(i);expect(words[i*4+1]>>>16).toBe(kinds.indexOf(path));
      const p=actual.points[i];
      for(let a=0;a<3;a++)maxPosition=Math.max(maxPosition,Math.abs(p[a]-expected[i*8+a]));
      expect(Math.hypot(...p.map((v,a)=>v-mesh.bounds![a]))).toBeLessThanOrEqual(mesh.bounds![3]+quantBound*2);
    }
    for(let i=0;i<actual.points.length;i+=3) {
      const a=Array.from(expected.subarray(i*8,i*8+3)),b=Array.from(expected.subarray((i+1)*8,(i+1)*8+3)),c=Array.from(expected.subarray((i+2)*8,(i+2)*8+3));
      const u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);
      const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
      const edge=2*Math.sqrt(3)*coordinateBound;
      const bound=2*(edge*(Math.hypot(...u)+Math.hypot(...v))+edge*edge)/area+.0001;
      const normal=octDecodeNormal(words[i*4+2]),n=[normal.x,normal.y,normal.z];
      const error=Math.hypot(...n.map((x,k)=>x-expected[i*8+4+k]));maxNormal=Math.max(maxNormal,error);
      expect(error).toBeLessThan(bound);
      expect(words[i*4+2]).toBe(words[(i+1)*4+2]);expect(words[i*4+2]).toBe(words[(i+2)*4+2]);
    }
    expect(maxPosition).toBeLessThan(coordinateBound+quantBound);
    console.log('retained geometry',{path,separation,maxPosition,maxNormal,coordinateBound,quantBound});
  }
},TIMEOUT.gpu);

async function gpuPose(entity:number) {
  const w=app.world,table=globalTransformTable(w),source=table.buffer;
  const target=w.gpu.device.createBuffer({size:source.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
    const encoder=w.gpu.device.createCommandEncoder();encoder.copyBufferToBuffer(source,0,target,0,source.size);w.gpu.device.queue.submit([encoder.finish()]);
    await target.mapAsync(GPUMapMode.READ);
    return Array.from(new Float32Array(target.getMappedRange()).slice(table.rowIndex(entity)*12,table.rowIndex(entity)*12+12));
  } finally {target.unmap();target.destroy();}
}
test('spacing/gaps and support edits affect only owned rows; zero-tick and ordinary draw placements snap',async()=>{
  const w=app.world,s=w.resource(RailGpu),refs=w.resource(Scene);
  const update=async(a:typeof initial.assembly & {post1?:number;post2?:number;gapStart?:number;gapEnd?:number},dt=0)=>{await live.update({...initial,assembly:a});w.step(dt);await w.frameFence;};
  await update({...assemblyDefaults,path:'straight',witness:'station'});
  const before=await readMesh(w,s.mesh),count=s.dispatches,registry=[...w.resource(Meshes).entries()];
  await update({...assemblyDefaults,path:'straight',witness:'station',spacing:.8,gapStart:3.3,gapEnd:8.7});
  expect(s.dispatches).toBe(count);expect((await readMesh(w,s.mesh)).main).toEqual(before.main);
  // Shared binary64 phase: 0,.8,1.6,2.4,3.2 then 8.8,9.6,10.4,11.2; 12 is excluded by repeatDistances.
  const stations=[0,.8,1.6,2.4,3.2,8.8,9.6,10.4,11.2];
  expect(refs.instances.length).toBe(stations.length+1);
  for(let i=0;i<stations.length;i++)expect((await gpuPose(refs.instances[i+1][0]))[2]).toBeCloseTo(6-stations[i],5);
  await update({...assemblyDefaults,path:'straight',witness:'supports'});
  const ties=refs.instances.slice(1,-2).map(g=>[...g]),posts=refs.instances.slice(-2).map(g=>[...g]);
  const material=posts.map(g=>w.storage(MeshMaterial).material.get(g[0]));
  const tieMeshes=ties.map(g=>w.storage(MeshInstance).mesh.get(g[0]));
  const postMeshes=posts.map(g=>w.storage(MeshInstance).mesh.get(g[0]));
  const trackMaterials=refs.instances.slice(0,-2).map(g=>w.storage(MeshMaterial).material.get(g[0]));
  const meshFor=(handle:typeof postMeshes[number])=>w.resource(Meshes).get(handle as MeshHandle)!;
  const tieBefore=await readMesh(w,meshFor(tieMeshes[0]));
  const railBefore=await readMesh(w,s.mesh);
  const support=await readMesh(w,meshFor(postMeshes[0]));
  const yBounds=(points:number[][])=>[Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1]))];
  const contact=yBounds(tieBefore.points)[0]+(await gpuPose(ties[0][0]))[1],actual=yBounds(support.points);
  const bounds=(points:number[][])=>[0,1,2].map(a=>[Math.min(...points.map(p=>p[a])),Math.max(...points.map(p=>p[a]))]);
  console.log('support contact',{support:bounds(support.points),tieLocal:bounds(tieBefore.points),tiePose:await gpuPose(ties[0][0]),rail:bounds(railBefore.points),contact});
  expect(actual[1]).toBeLessThanOrEqual(contact);
  // Tight contact, not an arbitrary terrain/height policy; one float envelope.
  expect(contact-actual[1]).toBeLessThan(4e-6);
  for(const dt of [0,1/60]) {
    await update({...assemblyDefaults,path:'straight',witness:'supports',post1:3.125,post2:9.125},dt);
    expect(s.dispatches).toBe(count);
    expect(posts.map(g=>w.storage(MeshInstance).mesh.get(g[0]))).toEqual(postMeshes);
    expect(refs.instances.slice(0,-2).map(g=>w.storage(MeshMaterial).material.get(g[0]))).toEqual(trackMaterials);
    expect((await readMesh(w,meshFor(postMeshes[0]))).main).toEqual(support.main);
    expect((await readMesh(w,meshFor(tieMeshes[0]))).main).toEqual(tieBefore.main);
    expect((await readMesh(w,s.mesh)).main).toEqual(railBefore.main);
    expect(refs.instances.slice(1,-2)).toEqual(ties);expect(refs.instances.slice(-2)).toEqual(posts);
    expect(posts.map(g=>w.storage(MeshMaterial).material.get(g[0]))).toEqual(material);
    expect(ties.map(g=>w.storage(MeshInstance).mesh.get(g[0]))).toEqual(tieMeshes);
    expect((await gpuPose(posts[0][0])).slice(0,3)).toEqual([0,0,2.875]);
    expect((await gpuPose(posts[1][0])).slice(0,3)).toEqual([0,0,-3.125]);
  }
  const submitted=s.dispatches;w.step(0);await w.frameFence;expect(s.dispatches).toBe(submitted);
  expect([...w.resource(Meshes).entries()]).toEqual(registry);
},TIMEOUT.gpu);

test('dirty rail work is one parameter upload and submit; no-op frames allocate and dispatch nothing',async()=>{
  const w=app.world,s=w.resource(RailGpu),device=w.gpu.device;
  await live.update(initial);w.step(0);await w.frameFence;
  const refs=w.resource(Scene),entities=refs.instances.map(g=>[...g]),registry=[...w.resource(Meshes).entries()];
  const create=device.createBuffer.bind(device),write=device.queue.writeBuffer.bind(device.queue),createEntity=w.create.bind(w),destroyEntity=w.destroy.bind(w);
  const materials=w.resource(Materials),add=materials.add.bind(materials);
  let allocations=0,creates=0,destroys=0,registrations=0,parameterBytes=0;
  device.createBuffer=(...args)=>{allocations++;return create(...args);};
  device.queue.writeBuffer=(...args)=>{if(args[0]===s.parameter)parameterBytes+=(args[2] as ArrayBufferView).byteLength;write(...args);return undefined;};
  w.create=(...args)=>{creates++;return createEntity(...args);};w.destroy=(...args)=>{destroys++;return destroyEntity(...args);};
  materials.add=(...args)=>{registrations++;return add(...args);};
  const count=s.dispatches;
  try {
    await live.update({...initial,assembly:{...initial.assembly,separation:1.45}});
    expect(s.dispatches).toBe(count);expect(parameterBytes).toBe(0);
    w.step(0);await w.frameFence;expect(s.dispatches).toBe(count+1);expect(parameterBytes).toBe(16);
    await live.update({...initial,assembly:{...initial.assembly,separation:1.45}});
    w.step(0);await w.frameFence;expect(s.dispatches).toBe(count+1);expect(parameterBytes).toBe(16);
    expect({allocations,creates,destroys,registrations}).toEqual({allocations:0,creates:0,destroys:0,registrations:0});
    expect(refs.instances).toEqual(entities);expect([...w.resource(Meshes).entries()]).toEqual(registry);
    console.log('retained dirty/no-op work',{allocations,creates,destroys,registrations,parameterBytes,dispatches:s.dispatches-count});
  } finally {device.createBuffer=create;device.queue.writeBuffer=write;w.create=createEntity;w.destroy=destroyEntity;materials.add=add;}
},TIMEOUT.gpu);

test('native single/double spine selection keeps shared rail/tie/material identities',async()=>{
  const w=app.world,model=structuredClone(initialConfiguration);model.selected='track';
  model.values.track.path='curve';model.values.track.secondSpine=false;
  await live.update(effective(model));w.step(0);await w.frameFence;
  const refs=w.resource(Scene),entities=refs.instances.map(g=>[...g]),instance=w.storage(MeshInstance),material=w.storage(MeshMaterial);
  const rail=instance.mesh.get(entities[0][0]),railMaterial=material.material.get(entities[0][0]);
  const spine=instance.mesh.get(entities[1][0]),ties=entities.slice(2);
  model.values.track.secondSpine=true;await live.update(effective(model));w.step(0);await w.frameFence;
  expect(refs.instances.slice(0,2)).toEqual(entities.slice(0,2));
  expect(instance.mesh.get(entities[0][0])).toBe(rail);expect(material.material.get(entities[0][0])).toBe(railMaterial);
  expect(instance.mesh.get(entities[1][0])).not.toBe(spine);
  expect(refs.instances.slice(2,2+ties.length)).toEqual(ties);
},TIMEOUT.gpu);
