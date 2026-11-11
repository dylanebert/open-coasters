import { Camera, DirectionalLight, GlobalAmbientLight, lookAtRotation, Materials, MeshInstance, MeshMaterial, StandardMaterial, StandardRenderer, Transform, type Plugin } from '@dylanebert/shallot';
import { Orbit, OrbitPlugin } from '@dylanebert/shallot/extras';
import { Grid, GridPlugin } from '@dylanebert/shallot-grid';

export const Scene = { create: () => ({ camera: -1, grid: -1, object: -1 }) };
export const scene: Plugin = {
    name: 'ReferenceScene', dependencies: [OrbitPlugin, GridPlugin],
    initialize(world) {
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
        refs.object = world.create();
        world.add(refs.object, MeshInstance);
        world.add(refs.object, MeshMaterial, world.resource(Materials).add(StandardMaterial({
            baseColor: [0.72, 0.4, 0.05, 1], perceptualRoughness: 0.38,
        })));
        world.add(refs.object, Transform, { translation: [1.5, 1, 0.5], scale: [3, 2, 1] });
    },
};
