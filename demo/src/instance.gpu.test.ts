import { expect, test } from "bun:test";
import { MeshPlugin, Transform, type Plugin } from "@dylanebert/shallot";
import { loadGltfScene, spawnGltfScene } from "@dylanebert/shallot/gltf";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { placements } from "./instance";

test(
    "repeated placements retain origin, rotation, units and independent entity state",
    async () => {
        const proof: Plugin = {
            name: "RepeatedInstanceProof",
            dependencies: [MeshPlugin],
            async initialize(w) {
                const asset = await loadGltfScene(
                    w,
                    new URL("../public/assets/wheel-carrier.gltf", import.meta.url),
                );
                const a = spawnGltfScene(w, asset, placements[0]);
                const b = spawnGltfScene(w, asset, placements[1]);
                const t = w.storage(Transform);
                const nose = asset.primitives.findIndex((p) => p.node === "Positive Z nose");
                const position = (eid: number) => [
                    t.translation.x.get(eid),
                    t.translation.y.get(eid),
                    t.translation.z.get(eid),
                ];
                position(a.entities[nose]).forEach((v, k) =>
                    expect(v).toBeCloseTo([-1.25, 0.6, 0.45][k]),
                );
                position(b.entities[nose]).forEach((v, k) =>
                    expect(v).toBeCloseTo([1.95, 0.6, -0.25][k]),
                );
                expect(t.rotation.y.get(b.entities[nose])).toBeCloseTo(Math.SQRT1_2);
                expect(t.rotation.w.get(b.entities[nose])).toBeCloseTo(Math.SQRT1_2);
                for (const eid of [...a.entities, ...b.entities]) {
                    expect(t.scale.x.get(eid)).toBeCloseTo(1);
                    expect(t.scale.y.get(eid)).toBeCloseTo(1);
                    expect(t.scale.z.get(eid)).toBeCloseTo(1);
                }
                expect(new Set([...a.entities, ...b.entities]).size).toBe(8);
                t.translation.x.set(a.entities[nose], 99);
                expect(position(b.entities[nose])[0]).toBeCloseTo(1.95);
                expect(asset.primitives[nose].matrix[12]).toBeCloseTo(0.25);
                const c = spawnGltfScene(w, asset);
                expect(position(c.entities[nose])[0]).toBeCloseTo(0.25);
                expect(a.poses).not.toBe(b.poses);
                expect(a.globals[0]).not.toBe(b.globals[0]);
            },
        };
        const app = await openGpuApp({ plugins: [proof] });
        app.dispose();
    },
    TIMEOUT.gpu,
);
