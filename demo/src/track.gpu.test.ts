import { expect, test } from "bun:test";
import { Meshes, MeshInstance, type MeshHandle } from "@dylanebert/shallot";
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
