import { expect, test } from 'bun:test';
import { Transform, Meshes, Materials, MeshMaterial } from '@dylanebert/shallot';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { composeMat4 } from '@dylanebert/shallot/utils';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { liveScene } from './live';
import { Scene } from './scene';
import { initialConfiguration, compositionDefaults } from './configuration';

test('authored live replacements preserve source landmarks, native scales and camera; release meshes', async () => {
  const initial = { ...initialConfiguration, example: 'placed' as const, composition: { ...compositionDefaults, x: 2, y: 3, z: 4, yaw: 90 } };
  const live = liveScene(initial, name => new URL(`../public/assets/${name}.gltf`, import.meta.url));
  const app = await openGpuApp({ plugins: [live.plugin] });
  try {
    const w = app.world, refs = w.resource(Scene), camera = refs.camera, t = w.storage(Transform), orbit = w.storage(Orbit);
    const position = (eid: number) => [t.translation.x.get(eid), t.translation.y.get(eid), t.translation.z.get(eid)];
    // Source node order: carrier, positive-Z nose, two wheels.
    // Nose source landmark (.25,.6,.45), body center (.25,.45,-.2).
    position(refs.instances[0][1]).forEach((v,k) => expect(v).toBeCloseTo([2.45,3.6,3.75][k]));
    position(refs.instances[0][0]).forEach((v,k) => expect(v).toBeCloseTo([1.8,3.45,3.75][k]));
    // Rotated source envelope center, not the untransformed source origin.
    Array.from(orbit.pan.read(camera, new Float32Array(4))).slice(0,3).forEach((v,a) => expect(v).toBeCloseTo([2.05,3.6,3.75][a], 5));
    const source = await loadGltf(new URL('../public/assets/wheel-carrier.gltf', import.meta.url));
    const pointsFor = (group: number[]) => group.flatMap((eid, index) => {
      const m = composeMat4(...position(eid) as [number,number,number], t.rotation.x.get(eid), t.rotation.y.get(eid), t.rotation.z.get(eid), t.rotation.w.get(eid), t.scale.x.get(eid), t.scale.y.get(eid), t.scale.z.get(eid));
      const v = source.meshes[source.instances[index].mesh].vertices;
      return Array.from({ length: v.length / 8 }, (_, i) => [0,1,2].map(a => m[a]*v[i*8] + m[4+a]*v[i*8+1] + m[8+a]*v[i*8+2] + m[12+a]));
    });
    const points = pointsFor(refs.instances[0]);
    // Independently measured source envelope rotated 90 degrees about Y and translated.
    for (const a of [0,1,2]) {
      expect(Math.min(...points.map(p => p[a]))).toBeCloseTo([1.4,3.3,2.8][a], 5);
      expect(Math.max(...points.map(p => p[a]))).toBeCloseTo([2.7,3.9,4.7][a], 5);
    }
    const materials = w.resource(Materials), addMaterial = materials.add.bind(materials);
    let registrations = 0;
    materials.add = (...args) => { registrations++; return addMaterial(...args); };
    orbit.yaw.set(camera, 1.2);
    w.gpu.device.pushErrorScope('validation');
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const asset of ['wheel-carrier', 'blitz-tie'] as const) {
        const old = [...w.resource(Meshes)].flatMap(m => [m.vertices,m.indices]);
        await w.gpu.device.queue.onSubmittedWorkDone();
        await live.update({ ...initial, asset, example: 'repeated', composition: { ...compositionDefaults, count: 4, spacing: 2.5, offset: -3, yaw: 90 } });
        expect(old.every(b => b.destroyed)).toBe(true);
        expect(refs.instances.length).toBe(4);
        expect(refs.camera).toBe(camera);
        expect(orbit.yaw.get(camera)).toBeCloseTo(1.2);
        expect(registrations).toBe(0);
        const material = w.resource(Materials).get(w.storage(MeshMaterial).material.get(refs.instances[0][0]))!;
        if (asset === 'wheel-carrier') {
          [...material.baseColor].forEach((v,k) => expect(v).toBeCloseTo([.08,.32,.65,1][k]));
          expect(material.metallic).toBe(0);
          expect(material.perceptualRoughness).toBeCloseTo(.6);
        } else {
          expect([...material.baseColor]).toEqual([1,1,1,1]);
          expect(material.metallic).toBe(1);
          expect(material.perceptualRoughness).toBe(1);
          refs.instances.forEach((group,i) => position(group[0]).forEach((v,k) => expect(v).toBeCloseTo([-3+i*2.5,0,0][k])));
        }
        if (asset === 'wheel-carrier') refs.instances.forEach((group,i) => {
          const points = pointsFor(group);
          for (const a of [0,1,2]) {
            expect(Math.min(...points.map(p => p[a]))).toBeCloseTo([-3.6+i*2.5,.3,-1.2][a], 5);
            expect(Math.max(...points.map(p => p[a]))).toBeCloseTo([-2.3+i*2.5,.9,.7][a], 5);
          }
          position(group[1]).forEach((v,k) => expect(v).toBeCloseTo([-2.55+i*2.5,.6,-.25][k]));
          for (const eid of group) for (const axis of ['x','y','z'] as const) expect(t.scale[axis].get(eid)).toBeCloseTo(1);
        });
        w.step(0); await w.frameFence; await w.gpu.device.queue.onSubmittedWorkDone();
      }
    }
    expect(await w.gpu.device.popErrorScope()).toBeNull();
  } finally { app.dispose(); }
}, TIMEOUT.gpu);

for (const aspect of [920 / 800, 390 / 338, .6]) test(`authored entry and switches fit retained geometry at aspect ${aspect}`, async () => {
  const placed = { ...initialConfiguration, example: 'placed' as const, composition: { ...compositionDefaults, x: 10, y: 10, z: 10 } };
  const repeated = { ...placed, example: 'repeated' as const, composition: { ...compositionDefaults, count: 12, spacing: 5, offset: -10 } };
  const live = liveScene(placed, name => new URL(`../public/assets/${name}.gltf`, import.meta.url), () => aspect);
  const app = await openGpuApp({ plugins: [live.plugin] });
  try {
    const w = app.world, camera = w.resource(Scene).camera, orbit = w.storage(Orbit);
    const pan = () => Array.from(orbit.pan.read(camera, new Float32Array(4))).slice(0, 3);
    const expectPan = (expected: number[]) => pan().forEach((v, a) => expect(v).toBeCloseTo(expected[a], 5));
    // Independent authored bounds: [-.7,.3,-.6] to [1.2,.9,.7].
    expectPan([10.25, 10.6, 10.05]);
    const initialDistance = orbit.distance.get(camera);
    orbit.yaw.set(camera, 1.1); orbit.pitch.set(camera, -.3);
    await live.update({ ...placed, composition: { ...placed.composition, x: -10 } });
    expectPan([10.25, 10.6, 10.05]);
    expect(orbit.distance.get(camera)).toBe(initialDistance);
    await live.update(initialConfiguration);
    await live.update(placed);
    expectPan([10.25, 10.6, 10.05]);
    await live.update(repeated);
    // Full repeated envelope: [-10.7,.3,-.6] to [46.2,.9,.7].
    expectPan([17.75, .6, .05]);
    // Independent numeric ranges for a 56.9 x .6 x 1.3 envelope and 60° vertical FOV.
    expect(orbit.distance.get(camera)).toBeGreaterThan(aspect < 1 ? 95 : 62);
    expect(orbit.distance.get(camera)).toBeLessThan(aspect < 1 ? 97 : 64);
    await live.update({ ...repeated, asset: 'blitz-tie' });
    await live.update(repeated);
    expectPan([17.75, .6, .05]);
    expect(w.resource(Scene).camera).toBe(camera);
    expect(orbit.yaw.get(camera)).toBeCloseTo(1.1);
    expect(orbit.pitch.get(camera)).toBeCloseTo(-.3);
    await live.update({ ...placed, isolated: true, example: undefined });
    expectPan([0, 0, 0]);
    expect(orbit.distance.get(camera)).toBe(8);
  } finally { app.dispose(); }
}, TIMEOUT.gpu);
