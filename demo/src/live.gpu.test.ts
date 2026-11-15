import { beforeAll, afterAll, expect, test } from "bun:test";
import { Materials, Meshes, MeshInstance } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { liveScene, type Selection } from "./live";
import { Scene, createScene } from "./scene";
import { assemblyDefaults } from './assembly';
import { defaults } from "./track";
import { readMesh } from './gpu-probe';
import { effective, initialConfiguration, selectExample } from './configuration';
const url = (name: string) =>
  new URL(`../public/assets/${name}.gltf`, import.meta.url);
const selection: Selection = effective(initialConfiguration);
const resourceScene=liveScene(selection,url);
let resourceApp:Awaited<ReturnType<typeof openGpuApp>>;
const sourceApps=new Map<string,Awaited<ReturnType<typeof openGpuApp>>[]>();
const opened:Awaited<ReturnType<typeof openGpuApp>>[]=[];
beforeAll(async()=>{
  resourceApp=await openGpuApp({plugins:[resourceScene.plugin]});opened.push(resourceApp);
  for(const asset of ['wheel-carrier','blitz-tie'] as const) {
    const live=liveScene({...selection,example:undefined,isolated:true,asset},url),apps=[];
    for(const plugin of [createScene(url(asset)),live.plugin]){const app=await openGpuApp({plugins:[plugin]});apps.push(app);opened.push(app);}
    sourceApps.set(asset,apps);
  }
},TIMEOUT.startup);
afterAll(()=>{for(const app of opened)app.dispose();});

test(
  "live scene bounds GPU bytes, entities and registrations through repeated parameter/component/example changes",
  async () => {
    const scene = resourceScene, app=resourceApp;
    try {
      const w = app.world,
        refs = w.resource(Scene),
        camera = refs.camera;
      attachTexture(w, camera, { width: 128, height: 96 });
      const frame = async () => {
        w.step(0);
        await w.frameFence;
        await w.gpu.device.queue.onSubmittedWorkDone();
      };
      await frame();
      const materials = w.resource(Materials);
      const add = materials.add.bind(materials);
      let registrations = 0;
      materials.add = (...args) => {
        registrations++;
        return add(...args);
      };
      const currentBuffers = () =>
        new Set(
          [...w.resource(Meshes)].flatMap((m) => [
            m.vertices,
            m.position!,
            m.quant!,
            m.indices,
          ]),
        );
      const families: ReturnType<typeof currentBuffers> = new Set();
      const bounds = new Map<
        string,
        { bytes: number; count: number; entities: number; meshes: number }
      >();
      let warmBytes = 0, warmCount = 0;
      w.storage(Orbit).yaw.set(camera, 1.1);
      const orbit = w.storage(Orbit);
      w.gpu.device.pushErrorScope("validation");
      for (let cycle = 0; cycle < 2; cycle++)
        for (let mode = 0; mode < 17; mode++) {
          const previous = currentBuffers();
          for (const buffer of previous) families.add(buffer);
          const model=structuredClone(initialConfiguration);
          const selected=mode<15 ? (['ties','station','supports','assembly','track'] as const)[mode%5] : 'witness';
          const configured=selectExample(model,selected);
          configured.values.ties.path=(['straight','curve','loop'] as const)[Math.floor(mode/5)%3];
          configured.values.ties.spacing=mode%2 ? .3 : 1.5;
          configured.values.assembly.path=(['straight','curve','loop'] as const)[Math.floor(mode/5)%3];
          configured.values.assembly.separation=mode%2 ? .6 : 1.6;
          configured.values.track.path=(['straight','curve','loop'] as const)[Math.floor(mode/5)%3];
          configured.values.track.secondSpine=mode%2===0;
          configured.values.witness.asset=mode%2 ? 'blitz-tie' : 'wheel-carrier';
          const next: Selection=effective(configured);
          await scene.update(next);
          await frame();
          const current = currentBuffers();
          for (const buffer of current) families.add(buffer);
          const live = [...families].filter((b) => !b.destroyed);
          const bytes = live.reduce((n, b) => n + b.buffer.size, 0);
          // Resident immutable content is allowed; leaked replacement families are not.
          if (cycle === 0) { warmBytes = Math.max(warmBytes, bytes); warmCount = Math.max(warmCount, live.length); }
          else { expect(bytes).toBeLessThanOrEqual(warmBytes); expect(live.length).toBeLessThanOrEqual(warmCount); }
          const selectedHandles=new Set(refs.instances.flat().map(e=>w.storage(MeshInstance).mesh.get(e)));
          for (const [handle,mesh] of w.resource(Meshes).entries()) {
            if(!selectedHandles.has(handle))continue;
            const {points} = await readMesh(w, mesh);
            expect(points.length).toBe(mesh.indexCount);
            expect(points.flat().every(Number.isFinite)).toBe(true);
          }
          const snapshot = {
            bytes,
            count: live.length,
            entities: w.entities().length,
            meshes: w.resource(Meshes).size,
          };
          if (cycle === 0) bounds.set(String(mode), snapshot);
          else {
            expect(snapshot.entities).toBe(bounds.get(String(mode))!.entities);
            expect(snapshot.meshes).toBeLessThanOrEqual(Math.max(...[...bounds.values()].map(b => b.meshes)));
          }
          expect(registrations).toBe(0);
          expect(app.world).toBe(w);
          expect(w.resource(Scene).camera).toBe(camera);
          expect(orbit.yaw.get(camera)).toBeCloseTo(1.1);
        }
      expect(await w.gpu.device.popErrorScope()).toBeNull();
      console.log("live resource bounds", Object.fromEntries(bounds));
    } finally {
      app.dispose();
    }
  },
  // Repeated construction witnesses establish a warm resident bound, not a required replacement policy.
  TIMEOUT.gpu * 4,
);

for (const asset of ["wheel-carrier", "blitz-tie"] as const)
  test(
    `live isolated ${asset} matches the independent static witness pixels`,
    async () => {
      const apps=sourceApps.get(asset)!;
      try {
        const images = [];
        for (const app of apps) {
          const w = app.world,
            refs = w.resource(Scene);
          // Grid intensity is intentionally quieter in the tool. Compare subject pixels without it.
          w.destroy(refs.grid);
          attachTexture(w, refs.camera, { width: 256, height: 192 });
          w.step(0);
          images.push((await captureTexture(w, refs.camera)).rgba);
          await w.frameFence;
        }
        expect(images[1]).toEqual(images[0]);
      } finally {
        for (const app of apps) app.dispose();
      }
    },
    TIMEOUT.gpu,
  );
