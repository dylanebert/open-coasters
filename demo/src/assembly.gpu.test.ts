import { beforeAll, afterAll, expect, test } from 'bun:test';
import { Transform, Meshes, Materials, MeshMaterial } from '@dylanebert/shallot';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { liveScene } from './live';
import { Scene } from './scene';
import { initialConfiguration as initialState, effective } from './configuration';
const initialConfiguration = effective({...initialState, selected:'track'});
import { assemblyDefaults } from './assembly';
import { readMesh } from './gpu-probe';

const aspects=[920/800,390/338];
const fixtures=new Map<number,{live:ReturnType<typeof liveScene>;app:Awaited<ReturnType<typeof openGpuApp>>}>();
let retained:{live:ReturnType<typeof liveScene>;app:Awaited<ReturnType<typeof openGpuApp>>};
beforeAll(async()=>{
  for(const aspect of aspects) {
    const initial={...initialConfiguration,example:'assembly' as const,assembly:{...assemblyDefaults,path:'straight' as const,spacing:1.5,separation:1.4}};
    const live=liveScene(initial,name=>new URL(`../public/assets/${name}.gltf`,import.meta.url),()=>aspect);
    fixtures.set(aspect,{live,app:await openGpuApp({plugins:[live.plugin]})});
  }
  const live=liveScene({...initialConfiguration,example:'assembly',assembly:{...assemblyDefaults}},name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
  retained={live,app:await openGpuApp({plugins:[live.plugin]})};
},TIMEOUT.startup);
afterAll(()=>{for(const {app} of fixtures.values())app.dispose();retained?.app.dispose();});
for (const aspect of aspects) test(`assembly reuses native assets/materials, frames every component and retains camera at ${aspect}`, async () => {
  const initial = {...initialConfiguration, example:'assembly' as const, assembly:{...assemblyDefaults,path:'straight' as const,spacing:1.5,separation:1.4}};
  const {live,app}=fixtures.get(aspect)!;
  try {
    const w = app.world, refs = w.resource(Scene), camera = refs.camera, t = w.storage(Transform), orbit = w.storage(Orbit);
    const position = (e: number) => [t.translation.x.get(e),t.translation.y.get(e),t.translation.z.get(e)];
    expect(refs.instances.length).toBe(9); // rails + 8 native ties; no synthetic fitting
    expect(position(refs.instances.at(-1)![0])).toEqual([0,1.5,4.5]);
    const mat = (group: number) => w.resource(Materials).get(w.storage(MeshMaterial).material.get(refs.instances[group][0]))!;
    [...mat(1).baseColor].forEach((v,i) => expect(v).toBeCloseTo([.035,.32,.48,1][i],6));
    expect(mat(1).metallic).toBeCloseTo(.65,6); expect(mat(1).perceptualRoughness).toBeCloseTo(.3,6);
    [...mat(0).baseColor].forEach((v,i) => expect(v).toBeCloseTo([.06,.7,.78,1][i],6));
    // Independent full envelope includes static ties and the unchanged rail endpoints:
    // Bar top is 1.44; the circular rail top is 1.56.
    // [-.95,1.32,-6.09] .. [.95,1.56,6].
    const pan = () => Array.from(orbit.pan.read(camera,new Float32Array(4)));
    pan().slice(0,3).forEach((v,i) => expect(v).toBeCloseTo([0,1.44,-.045][i],5));
    const distance = orbit.distance.get(camera), center = pan();
    expect(distance).toBeCloseTo(Math.hypot(.95,.12,6.045)*1.1/Math.sin(Math.PI/6),5);
    const materialResource = w.resource(Materials), add = materialResource.add.bind(materialResource);
    let added = 0; materialResource.add = (...args) => { added++; return add(...args); };
    orbit.yaw.set(camera,1.1); orbit.pitch.set(camera,-.4);
    w.gpu.device.pushErrorScope('validation');
    const counts = new Map<number, number>();
    for (let i=0;i<6;i++) {
      await w.gpu.device.queue.onSubmittedWorkDone();
      await live.update({...initial,assembly:{...initial.assembly, separation:i%2 ? 1 : 1.6, spacing:i%2 ? .3 : 1.5, tie:i%2 ? 'assembly-tie-fork' : 'assembly-tie-bar'}});
      expect(refs.camera).toBe(camera); expect(orbit.distance.get(camera)).toBe(distance); expect(pan()).toEqual(center);
      for (const group of refs.instances) for (const e of group) for (const axis of ['x','y','z'] as const) expect(t.scale[axis].get(e)).toBeCloseTo(1,6);
      expect(added).toBe(0);
      w.step(0); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone();
      if (i < 2) counts.set(i % 2, w.resource(Meshes).size);
      else expect(w.resource(Meshes).size).toBeLessThanOrEqual(Math.max(...counts.values()));
      const rails = [...w.resource(Meshes)].find(m => m.name === 'Circular rails')!;
      const {points} = await readMesh(w, rails);
      const separation = i % 2 ? 1 : 1.6;
      expect(Math.min(...points.map(p => p[0]))).toBeCloseTo(-separation / 2 - .06, 3);
      expect(Math.max(...points.map(p => p[0]))).toBeCloseTo(separation / 2 + .06, 3);
      expect(Math.min(...points.map(p => p[2]))).toBeCloseTo(-6, 3);
      expect(Math.max(...points.map(p => p[2]))).toBeCloseTo(6, 3);
    }
    await live.update({...initial,assembly:{...assemblyDefaults,spacing:Math.PI/3,separation:1.6}});
    expect(refs.instances.length).toBe(13);
    position(refs.instances[7][0]).forEach((v,i) => expect(v).toBeCloseTo([2,1.5,0][i],5));
    expect(orbit.yaw.get(camera)).toBeCloseTo(1.1); expect(orbit.pitch.get(camera)).toBeCloseTo(-.4);
    expect(orbit.distance.get(camera)).not.toBe(distance);
    await live.update({...initial,isolated:true});
    await live.update(initial);
    expect(refs.camera).toBe(camera); expect(orbit.distance.get(camera)).toBe(distance);
    w.step(0); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone();
    expect(await w.gpu.device.popErrorScope()).toBeNull();
  } finally { app.dispose(); }
},TIMEOUT.gpu);

test('separation updates retain rail and unchanged native placement work', async () => {
  const initial={...initialConfiguration,example:'assembly' as const,assembly:{...assemblyDefaults}};
  const {live,app}=retained;
  try {
    const w=app.world, registry=w.resource(Meshes), refs=w.resource(Scene);
    w.step(0);await w.frameFence;await w.gpu.sync();
    const entries=[...registry.entries()], entities=refs.instances.map(g=>[...g]);
    const create=w.gpu.device.createBuffer.bind(w.gpu.device), clear=registry.clear.bind(registry);
    let allocations=0, clears=0;
    w.gpu.device.createBuffer=(...args)=>{allocations++;return create(...args);};
    registry.clear=()=>{clears++;return clear();};
    await live.update({...initial,assembly:{...initial.assembly,separation:1.6}});
    expect(clears).toBe(0); // Old path fails here: a whole registry reset for one scalar.
    w.step(0);await w.frameFence;await w.gpu.sync();
    expect(allocations).toBe(0);
    expect([...registry.entries()]).toEqual(entries);
    expect(refs.instances).toEqual(entities);
    const {points}=await readMesh(w,[...registry].find(m=>m.name==='Circular rails')!);
    expect(points.length).toBeGreaterThan(18000);
  } finally {app.dispose();}
},TIMEOUT.gpu);
