import { expect, test } from "bun:test";
import { DirectionalLight, Meshes, MeshInstance, type MeshHandle } from "@dylanebert/shallot";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { Scene, createScene } from "./scene";
import { defaults, generate, type Configuration } from "./track";
for (const configuration of ["straight", "curve", "loop"] as Configuration[])
  test(
    `Dawn: generated ${configuration} mesh is actually drawn`,
    async () => {
      const p = { ...defaults, configuration };
      const app = await openGpuApp({
        plugins: [
          createScene(
            new URL("../public/assets/blitz-tie.gltf", import.meta.url),
            p,
          ),
        ],
      });
      try {
        const w = app.world,
          s = w.resource(Scene),
          eid = s.instances[0][0];
        attachTexture(w, s.camera, { width: 384, height: 288 });
        const frame = async () => {
          w.step(0);
          const result = await captureTexture(w, s.camera);
          await w.frameFence;
          return result.rgba;
        };
        const a = await frame();
        const handle = w.storage(MeshInstance).mesh.get(eid);
        expect(w.resource(Meshes).get(handle as MeshHandle)!.indexCount).toBe(
          generate(p).indices.length,
        );
        w.remove(eid, MeshInstance);
        const b = await frame();
        let pixels = 0;
        for (let i = 0; i < a.length; i += 4)
          if (
            Math.max(...[0, 1, 2].map((c) => Math.abs(a[i + c] - b[i + c]))) > 8
          )
            pixels++;
        expect(pixels).toBeGreaterThan(100);
      } finally {
        app.dispose();
      }
    },
    TIMEOUT.gpu,
  );

test("Dawn: standard directional light shapes the generated track", async () => {
  const app = await openGpuApp({plugins: [createScene(
    new URL("../public/assets/blitz-tie.gltf", import.meta.url), defaults,
  )]});
  try {
    const w = app.world, s = w.resource(Scene);
    attachTexture(w, s.camera, {width: 384, height: 288});
    const frame = async () => {
      w.step(0);
      const image = await captureTexture(w, s.camera);
      await w.frameFence;
      return image.rgba;
    };
    const lit = await frame();
    // Remove only the standard sun, leaving ambient, geometry, material and camera alone.
    for (const eid of w.query([DirectionalLight])) w.storage(DirectionalLight).illuminance.set(eid, 0);
    const ambient = await frame();
    let shaped = 0;
    for (let i = 0; i < lit.length; i += 4) {
      // Cyan subject mask excludes the neutral grid and background.
      if (lit[i+1] > lit[i] * 1.4 && lit[i+2] > lit[i] * 1.4 &&
          Math.max(lit[i+1]-ambient[i+1], lit[i+2]-ambient[i+2]) > 12) shaped++;
    }
    expect(shaped).toBeGreaterThan(100);
  } finally { app.dispose(); }
}, TIMEOUT.gpu);
