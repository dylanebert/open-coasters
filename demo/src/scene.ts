import {
    Camera,
    DirectionalLight,
    GlobalAmbientLight,
    lookAtRotation,
    StandardRenderer,
    Transform,
    type Plugin,
} from "@dylanebert/shallot";
import { Orbit, OrbitPlugin } from "@dylanebert/shallot/extras";
import { Grid, GridPlugin } from "@dylanebert/shallot-grid";

import { loadGltfScene, spawnGltfScene } from "@dylanebert/shallot/gltf";
import { placements, requireStaticInstance } from "./instance";

export const Scene = { create: () => ({ camera: -1, grid: -1, instances: [] as number[][] }) };
export const createScene = (url: URL): Plugin => ({
    name: "ReferenceScene",
    dependencies: [OrbitPlugin, GridPlugin],
    async initialize(world) {
        const refs = world.resource(Scene);
        Object.assign(world.resource(GlobalAmbientLight), { color: 0xd8e4ff, brightness: 380 });
        const sun = world.create();
        world.add(sun, Transform, { rotation: lookAtRotation(0, 0, 0, 1, -2, -0.35) });
        world.add(sun, DirectionalLight, { color: 0xffe8cc, illuminance: 6000 });
        world.storage(DirectionalLight).shadowMapsEnabled.set(sun, 1);
        refs.camera = world.create();
        world.add(refs.camera, Camera, { clearColor: 0x191816 });
        world.add(refs.camera, StandardRenderer);
        world.add(refs.camera, Transform);
        world.add(refs.camera, Orbit, { distance: 8, yaw: 0.7, pitch: 0.5 });
        refs.grid = world.create();
        world.add(refs.grid, Grid);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Instance load failed: ${response.status}`);
        requireStaticInstance(await response.json());
        const asset = await loadGltfScene(world, url);
        if (asset.unsupported.length)
            throw new Error(`Unsupported glTF: ${asset.unsupported.join(", ")}`);
        refs.instances = placements.map((p) => spawnGltfScene(world, asset, p).entities);
    },
});
