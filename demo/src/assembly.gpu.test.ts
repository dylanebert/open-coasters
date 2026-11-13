import { expect, test } from 'bun:test';
import { Transform, Meshes, Materials, MeshMaterial } from '@dylanebert/shallot';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { liveScene } from './live';
import { Scene } from './scene';
import { initialConfiguration } from './configuration';
import { assemblyDefaults } from './assembly';

for (const aspect of [920/800,390/338]) test(`assembly reuses native assets/materials, frames every component and retains camera at ${aspect}`, async () => {
  const initial = {...initialConfiguration, example:'assembly' as const, assembly:{...assemblyDefaults,path:'straight' as const,spacing:1.5,separation:1.4}};
  const live = liveScene(initial, name => new URL(`../public/assets/${name}.gltf`,import.meta.url), () => aspect);
  const app = await openGpuApp({plugins:[live.plugin]});
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
    for (let i=0;i<6;i++) {
      const old = [...w.resource(Meshes)].flatMap(m => [m.vertices,m.indices]);
      await w.gpu.device.queue.onSubmittedWorkDone();
      await live.update({...initial,assembly:{...initial.assembly, separation:i%2 ? 1 : 1.6, spacing:i%2 ? .3 : 1.5, tie:i%2 ? 'assembly-tie-fork' : 'assembly-tie-bar'}});
      expect(old.every(b => b.destroyed)).toBe(true);
      expect(refs.camera).toBe(camera); expect(orbit.distance.get(camera)).toBe(distance); expect(pan()).toEqual(center);
      for (const group of refs.instances) for (const e of group) for (const axis of ['x','y','z'] as const) expect(t.scale[axis].get(e)).toBeCloseTo(1,6);
      expect(added).toBe(0);
      w.step(0); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone();
    }
    await live.update({...initial,assembly:{...assemblyDefaults,spacing:Math.PI/3,separation:1.6}});
    expect(refs.instances.length).toBe(13);
    position(refs.instances[7][0]).forEach((v,i) => expect(v).toBeCloseTo([2,1.5,0][i],5));
    expect(orbit.yaw.get(camera)).toBeCloseTo(1.1); expect(orbit.pitch.get(camera)).toBeCloseTo(-.4);
    expect(orbit.distance.get(camera)).not.toBe(distance);
    await live.update({...initial,example:'placed'});
    await live.update(initial);
    expect(refs.camera).toBe(camera); expect(orbit.distance.get(camera)).toBe(distance);
    w.step(0); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone();
    expect(await w.gpu.device.popErrorScope()).toBeNull();
  } finally { app.dispose(); }
},TIMEOUT.gpu);
