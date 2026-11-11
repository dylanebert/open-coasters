import { expect, test } from 'bun:test';
import { MeshInstance, Transform } from '@dylanebert/shallot';
import { Orbit } from '@dylanebert/shallot/extras';
import { Grid } from '@dylanebert/shallot-grid';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { Scene, scene } from './scene';
test('static metric block, public grid and orbit camera', async () => {
    const app = await openGpuApp({ plugins: [scene] });
    try {
        const w = app.world, s = w.resource(Scene);
        expect(w.has(s.object, MeshInstance)).toBe(true);
        expect(w.has(s.grid, Grid)).toBe(true);
        expect(w.storage(Grid).floor.get(s.grid)).toBe(1);
        expect(w.has(s.camera, Orbit)).toBe(true);
        const t = w.storage(Transform);
        for (const dt of [0, 1]) {
            w.step(dt);
            expect([t.scale.x.get(s.object), t.scale.y.get(s.object), t.scale.z.get(s.object)]).toEqual([3,2,1]);
            expect([t.translation.x.get(s.object), t.translation.y.get(s.object), t.translation.z.get(s.object)]).toEqual([1.5,1,0.5]);
        }
    } finally { app.dispose(); }
}, TIMEOUT.gpu);
