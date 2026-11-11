import {
  Camera,
  Meshes,
  Materials,
  MeshInstance,
  MeshMaterial,
  StandardMaterial,
  DirectionalLight,
  GlobalAmbientLight,
  lookAtRotation,
  StandardRenderer,
  Transform,
  type Plugin,
  type World,
} from "@dylanebert/shallot";
import { Orbit, OrbitPlugin } from "@dylanebert/shallot/extras";
import { Grid, GridPlugin } from "@dylanebert/shallot-grid";

import { loadGltfScene, spawnGltfScene } from "@dylanebert/shallot/gltf";
import { placements, staticInstanceSnapshot } from "./instance";
import { generate, ties, rotation, type Parameters } from "./track";

export const Scene = {
  create: () => ({ camera: -1, grid: -1, instances: [] as number[][] }),
};
export function initializeView(world: World) {
  const refs = world.resource(Scene);
  Object.assign(world.resource(GlobalAmbientLight), {
    color: 0xd8e4ff,
    brightness: 380,
  });
  const sun = world.create();
  world.add(sun, Transform, {
    rotation: lookAtRotation(0, 0, 0, 1, -2, -0.35),
  });
  world.add(sun, DirectionalLight, { color: 0xffe8cc, illuminance: 6000 });
  world.storage(DirectionalLight).shadowMapsEnabled.set(sun, 1);
  refs.camera = world.create();
  world.add(refs.camera, Camera, { clearColor: 0x191816 });
  world.add(refs.camera, StandardRenderer);
  world.add(refs.camera, Transform);
  world.add(refs.camera, Orbit, { distance: 8, yaw: 0.7, pitch: 0.5 });
  refs.grid = world.create();
  world.add(refs.grid, Grid);
}
export const createScene = (url: URL, parameters?: Parameters): Plugin => ({
  name: "ReferenceScene",
  dependencies: [OrbitPlugin, GridPlugin],
  async initialize(world) {
    initializeView(world);
    const refs = world.resource(Scene);
    if (parameters) {
      world.storage(Orbit).distance.set(refs.camera, 19);
      world.storage(Orbit).pan.set(refs.camera, 0, 3, 0);
      const eid = world.create();
      const mesh = world
        .resource(Meshes)
        .add({ name: "Provisional track", ...generate(parameters) });
      world.add(eid, Transform);
      world.add(eid, MeshInstance, { mesh });
      world.add(
        eid,
        MeshMaterial,
        world.resource(Materials).add(
          StandardMaterial({
            baseColor: [0.08, 0.65, 0.72, 1],
            metallic: 0.4,
            perceptualRoughness: 0.35,
          }),
        ),
      );
      refs.instances = [[eid]];
      if (!parameters.fixed) return;
    }
    const asset = await loadGltfScene(world, await staticInstanceSnapshot(url));
    if (asset.unsupported.length)
      throw new Error(`Unsupported glTF: ${asset.unsupported.join(", ")}`);
    if (parameters) {
      for (const f of ties(parameters))
        refs.instances.push(
          spawnGltfScene(world, asset, {
            translation: f.p,
            rotation: rotation(f),
          }).entities,
        );
    } else
      refs.instances = placements.map(
        (p) => spawnGltfScene(world, asset, p).entities,
      );
  },
});
