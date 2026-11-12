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
import { trackGeometry, modernTies } from './modern-track';

export const Scene = {
  create: () => ({ camera: -1, grid: -1, instances: [] as number[][] }),
};
// Positions occupy the first three floats of each eight-float vertex.
export function geometryCenter(vertices: Float32Array): [number, number, number] {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 8)
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], vertices[i + axis]);
      high[axis] = Math.max(high[axis], vertices[i + axis]);
    }
  return low.map((value, axis) => (value + high[axis]) / 2) as [number, number, number];
}
export function frameTrack(world: World, parameters: Parameters, vertices: Float32Array) {
  const orbit = world.storage(Orbit);
  const camera = world.resource(Scene).camera;
  orbit.pan.set(camera, ...geometryCenter(vertices));
  orbit.distance.set(camera, parameters.configuration === "loop" ? 26 : 19);
}
export function initializeView(world: World, parameters?: Parameters) {
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
  world.add(refs.camera, Orbit, {
    distance: 8,
    pan: [0, 0, 0],
    yaw: 0.7,
    pitch: 0.5,
  });
  if (parameters && !parameters.fixed) frameTrack(world, parameters, generate(parameters).vertices);
  refs.grid = world.create();
  world.add(refs.grid, Grid);
}
export const createScene = (url: URL, parameters?: Parameters): Plugin => ({
  name: "ReferenceScene",
  dependencies: [OrbitPlugin, GridPlugin],
  async initialize(world) {
    initializeView(world, parameters);
    const refs = world.resource(Scene);
    if (parameters) {
      const eid = world.create();
      const geometry = await trackGeometry(name => new URL(`${name}.gltf`, url))(parameters);
      frameTrack(world, parameters, geometry.vertices);
      const mesh = world
        .resource(Meshes)
        .add({ name: "Provisional track", ...geometry });
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
    for (const assetUrl of parameters ? modernTies(parameters).map(name => new URL(`${name}.gltf`, url)) : [url]) {
      const asset = await loadGltfScene(world, await staticInstanceSnapshot(assetUrl));
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
    }
  },
});
