import { expect, test } from "bun:test";
import { Materials, Meshes } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { liveScene, type Selection } from "./live";
import { Scene, createScene } from "./scene";
import { defaults } from "./track";
const url = (name: string) =>
  new URL(`../public/assets/${name}.gltf`, import.meta.url);
const selection: Selection = {
  parameters: defaults,
  isolated: false,
  asset: "wheel-carrier",
};

test(
  "live scene bounds GPU bytes, entities and registrations through repeated parameter/component/example changes",
  async () => {
    const scene = liveScene(selection, url);
    const app = await openGpuApp({ plugins: [scene.plugin] });
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
      w.storage(Orbit).yaw.set(camera, 1.1);
      const orbit = w.storage(Orbit);
      w.gpu.device.pushErrorScope("validation");
      for (let cycle = 0; cycle < 4; cycle++)
        for (let mode = 0; mode < 8; mode++) {
          const previous = currentBuffers();
          for (const buffer of previous) families.add(buffer);
          const next: Selection = {
            parameters: {
              ...defaults,
              configuration:
                mode === 0 ? "straight" : mode === 1 ? "curve" : "loop",
              spacing: mode % 2 ? 0.3 : 1.5,
              separation: mode === 7 ? 1.6 : 1,
              width: mode % 2 ? 0.6 : 0.15,
              depth: mode === 7 ? 0.8 : 0.35,
              fixed: mode === 3,
            },
            isolated: mode === 4 || mode === 5,
            asset: mode === 4 ? "blitz-tie" : "wheel-carrier",
          };
          await scene.update(next);
          await frame();
          expect([...previous].every((b) => b.destroyed)).toBe(true);
          const current = currentBuffers();
          for (const buffer of current) families.add(buffer);
          const live = [...families].filter((b) => !b.destroyed);
          const bytes = live.reduce((n, b) => n + b.buffer.size, 0);
          expect(live.length).toBe(current.size);
          expect(bytes).toBe(
            [...current].reduce((n, b) => n + b.buffer.size, 0),
          );
          const snapshot = {
            bytes,
            count: live.length,
            entities: w.entities().length,
            meshes: w.resource(Meshes).size,
          };
          if (cycle === 0) bounds.set(String(mode), snapshot);
          else expect(snapshot).toEqual(bounds.get(String(mode))!);
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
  // Thirty-two completed replacements, including 116 fixed loop ties per update.
  2 * TIMEOUT.gpu,
);

for (const asset of ["wheel-carrier", "blitz-tie"] as const)
  test(
    `live isolated ${asset} matches the independent static witness pixels`,
    async () => {
      const live = liveScene({ ...selection, isolated: true, asset }, url);
      const apps = [
        await openGpuApp({ plugins: [createScene(url(asset))] }),
        await openGpuApp({ plugins: [live.plugin] }),
      ];
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
