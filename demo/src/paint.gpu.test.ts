import { beforeAll, afterAll, expect, test } from 'bun:test';
import { Materials, Meshes, MeshMaterial } from '@dylanebert/shallot';
import { Orbit } from '@dylanebert/shallot/extras';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { paintScene as liveScene } from '../fixtures/paint-scene';
import { initialConfiguration as initialState, effective } from './configuration';
const initialConfiguration = effective({...initialState, selected:'track'});
import { Scene } from './scene';

const scene = liveScene(initialConfiguration, name => new URL(`../public/assets/${name}.gltf`, import.meta.url));
let app:Awaited<ReturnType<typeof openGpuApp>>;
beforeAll(async()=>{app=await openGpuApp({plugins:[scene.plugin]});},TIMEOUT.startup);
afterAll(()=>app?.dispose());
test('paint uses stable material updates without mesh allocation, registration or camera changes', async () => {
  try {
    const w = app.world, refs = w.resource(Scene), camera = refs.camera;
    attachTexture(w, camera, { width: 128, height: 96 });
    const capture = async () => { w.step(0); const frame = await captureTexture(w, camera); await w.frameFence; return frame.rgba; };
    const before = await capture();
    const meshes = [...w.resource(Meshes)];
    const materials = w.resource(Materials), add = materials.add.bind(materials), update = materials.update.bind(materials);
    let registrations = 0;
    const updates: any[] = [];
    materials.add = (...args) => { registrations++; return add(...args); };
    materials.update = (...args) => { updates.push(args); return update(...args); };
    const orbit = w.storage(Orbit); orbit.yaw.set(camera, .7);
    for (const [fixed, secondSpine] of [[false, false], [true, false], [true, true]]) {
      await scene.update({ ...initialConfiguration, parameters: { ...initialConfiguration.parameters, fixed, secondSpine } });
      const unpainted = await capture();
      const priorMeshes = [...w.resource(Meshes)];
      const entities = refs.instances.map(g => [...g]);
      updates.length = 0;
      const buffers = priorMeshes.flatMap(m => [m.vertices, m.indices, m.position, m.quant]);
      let allocations = 0;
      const createBuffer = w.gpu.device.createBuffer.bind(w.gpu.device);
      w.gpu.device.createBuffer = (...args) => { allocations++; return createBuffer(...args); };
      await scene.update({ ...initialConfiguration, parameters: { ...initialConfiguration.parameters, fixed, secondSpine }, paint: { rails: '#ff0000', ties: '#00ff00', spine: '#0000ff' } });
      const after = await capture();
      expect([...w.resource(Meshes)]).toEqual(priorMeshes);
      expect([...w.resource(Meshes)].flatMap(m => [m.vertices, m.indices, m.position, m.quant])).toEqual(buffers);
      expect(allocations).toBe(0);
      w.gpu.device.createBuffer = createBuffer;
      expect(refs.instances).toEqual(entities);
      expect(updates.map(u => u[1].baseColor)).toEqual([[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1]]);
      expect(new Set(updates.map(u => u[0])).size).toBe(3);
      expect(registrations).toBe(0);
      expect(refs.camera).toBe(camera);
      expect(orbit.yaw.get(camera)).toBeCloseTo(.7);
      expect(after).not.toEqual(before);
      await scene.update({ ...initialConfiguration, parameters: { ...initialConfiguration.parameters, fixed, secondSpine } });
      expect(await capture()).toEqual(unpainted);
    }
    expect(meshes.length).toBeGreaterThan(1);
    // The standalone source has no authored red (indeed no materials at all).
    const source = await Bun.file(new URL('../public/assets/blitz-tie.gltf', import.meta.url)).json();
    expect(source.materials).toBeUndefined();
    await scene.update({ ...initialConfiguration, isolated: true, asset: 'blitz-tie' });
    await capture();
    const row = w.storage(MeshMaterial).material.get(refs.instances[0][0]);
    const fallback = materials.get(row)!;
    expect([...fallback.baseColor]).toEqual([1, 1, 1, 1]);
    expect(fallback.metallic).toBe(1);
    expect(fallback.perceptualRoughness).toBe(1);
  } finally { app.dispose(); }
}, TIMEOUT.gpu);
