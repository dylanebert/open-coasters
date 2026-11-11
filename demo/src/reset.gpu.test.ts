import { expect, test } from "bun:test";
import { Meshes, MeshInstance } from "@dylanebert/shallot";
import { MeshPlugin, type MeshHandle } from "@dylanebert/shallot/mesh";
import { Orbit } from "@dylanebert/shallot/extras";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { attachTexture, captureTexture } from "@dylanebert/shallot/rendering";
import { createScene, Scene } from "./scene";
import { defaults, generate } from "./track";

test(
  "public MeshPlugin reset releases packed GPU storage on the same world between frames",
  async () => {
    const app = await openGpuApp({
      plugins: [
        createScene(
          new URL("../public/assets/blitz-tie.gltf", import.meta.url),
          defaults,
        ),
      ],
    });
    try {
      const world = app.world;
      const refs = world.resource(Scene);
      const camera = refs.camera;
      const orbit = world.storage(Orbit);
      orbit.yaw.set(camera, 1.2);
      orbit.distance.set(camera, 16);
      const eid = refs.instances[0][0];
      attachTexture(world, camera, { width: 96, height: 96 });
      const frame = async () => {
        world.step(0);
        const image = await captureTexture(world, camera);
        await world.frameFence;
        await world.gpu.device.queue.onSubmittedWorkDone();
        return image.rgba;
      };
      const first = await frame();
      const families = [];
      const live = () => {
        const mesh = world
          .resource(Meshes)
          .get(world.storage(MeshInstance).mesh.get(eid) as MeshHandle)!;
        return [mesh.vertices, mesh.position!, mesh.quant!, mesh.indices];
      };
      world.gpu.device.pushErrorScope("validation");
      for (let i = 0; i < 12; i++) {
        families.push(live());
        await MeshPlugin.initialize!(world);
        const mesh = world
          .resource(Meshes)
          .add({ name: "Provisional track", ...generate(defaults) });
        world.storage(MeshInstance).mesh.set(eid, mesh);
        expect(await frame()).toEqual(first);
        expect(app.world).toBe(world);
        expect(world.resource(Scene).camera).toBe(camera);
        expect(orbit.yaw.get(camera)).toBeCloseTo(1.2);
        expect(orbit.distance.get(camera)).toBe(16);
        expect(families.flat().every((buffer) => buffer.destroyed)).toBe(true);
        const current = live();
        expect(current.every((buffer) => !buffer.destroyed)).toBe(true);
        // Public packed buffers, not merely registry cardinality. Count unique buffers:
        // a single family may be shared by several registry slices.
        const owned = new Set([...families.flat(), ...current]);
        const alive = [...owned].filter((buffer) => !buffer.destroyed);
        expect(alive.length).toBe(4);
        expect(alive.reduce((n, buffer) => n + buffer.buffer.size, 0)).toBe(
          current.reduce((n, buffer) => n + buffer.buffer.size, 0),
        );
      }
      expect(await world.gpu.device.popErrorScope()).toBeNull();
      // Keep app/root alive while dropping the test's strong historical references.
      // A root or renderer retaining every dead family would defeat bounded CPU lifetime.
      const weak = families.flat().map((buffer) => new WeakRef(buffer));
      families.length = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
      Bun.gc(true);
      const retained = weak.filter((ref) => ref.deref() !== undefined).length;
      console.log(
        "historical packed buffer wrappers retained with live app/root:",
        retained,
      );
      expect(retained).toBeLessThanOrEqual(4);
    } finally {
      app.dispose();
    }
  },
  TIMEOUT.gpu,
);
