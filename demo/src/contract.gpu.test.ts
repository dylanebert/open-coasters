import { expect, test } from "bun:test";
import { MeshInstance } from "@dylanebert/shallot";
import { Orbit } from "@dylanebert/shallot/extras";
import { Grid } from "@dylanebert/shallot-grid";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { Scene, createScene } from "./scene";
const scene = createScene(new URL("../public/assets/wheel-carrier.gltf", import.meta.url));
test(
    "repeated static fixture, public grid and orbit camera",
    async () => {
        const app = await openGpuApp({ plugins: [scene] });
        try {
            const w = app.world,
                s = w.resource(Scene);
            expect(s.instances.map((i) => i.length)).toEqual([4, 4]);
            expect(new Set(s.instances.flat()).size).toBe(8);
            for (const eid of s.instances.flat()) expect(w.has(eid, MeshInstance)).toBe(true);
            expect(w.has(s.grid, Grid)).toBe(true);
            expect(w.storage(Grid).floor.get(s.grid)).toBe(1);
            expect(w.has(s.camera, Orbit)).toBe(true);
        } finally {
            app.dispose();
        }
    },
    TIMEOUT.gpu,
);
