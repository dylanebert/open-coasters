import { expect, test } from "bun:test";
import { parseGltf, type GltfJson } from "@dylanebert/shallot/gltf";
import { placements, requireStaticInstance } from "./instance";
import { MeshPlugin, Transform } from "@dylanebert/shallot";
import { loadGltf, loadGltfScene, spawnGltfScene } from "@dylanebert/shallot/gltf";
import { openGpuApp } from "@dylanebert/shallot/testing/gpu";
import { TIMEOUT } from "@dylanebert/shallot/testing";
import { createScene, Scene } from "./scene";

const tieJson = await Bun.file(new URL("../public/assets/blitz-tie.gltf", import.meta.url)).json() as GltfJson;
const bin = await Bun.file(new URL("../public/assets/blitz-tie.bin", import.meta.url)).arrayBuffer();
// Raw archived OBJ, independent of Blender export and Shallot decoding.
const sourcePoints = (await Bun.file(new URL("../../assets/blitz-tie/ModernTie_Light.obj", import.meta.url)).text())
    .split("\n").filter((s) => s.startsWith("v ")).map((s) => s.split(/\s+/).slice(1).map(Number));

function assertPoints(actual: number[][], expected: number[][]) {
    expect(actual.length).toBeGreaterThan(0);
    for (const [points, candidates] of [[actual, expected], [expected, actual]])
        for (const p of points)
            expect(candidates.some((q) => p.every((v, a) => Math.abs(v - q[a]) < 2e-7))).toBe(true);
}

function decodedPoints(json: GltfJson) {
    const scene = parseGltf(json, [bin]);
    return scene.instances.flatMap((i) => {
        const v = scene.meshes[i.mesh].vertices, m = i.matrix;
        return Array.from({ length: v.length / 8 }, (_, k) => [0, 1, 2].map((a) =>
            m[a] * v[k * 8] + m[a + 4] * v[k * 8 + 1] + m[a + 8] * v[k * 8 + 2] + m[a + 12]));
    });
}

test("Blitz tie retains every archived metric landmark and authored frame", () => {
    requireStaticInstance(tieJson);
    assertPoints(decodedPoints(tieJson), sourcePoints);
});

for (const corruption of ["origin", "unit", "orientation"])
    test(`source witness rejects ${corruption} corruption`, () => {
        const changed = structuredClone(tieJson);
        const node = changed.nodes![changed.scenes![changed.scene!].nodes![0]];
        if (corruption === "origin") node.translation = [0.1, 0, 0];
        if (corruption === "unit") node.scale = [100, 100, 100];
        if (corruption === "orientation") node.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
        expect(() => assertPoints(decodedPoints(changed), sourcePoints)).toThrow();
    });

test("Shallot loads selectable tie and both rigid placements match raw source", async () => {
    const url = new URL("../public/assets/blitz-tie.gltf", import.meta.url);
    const decoded = await loadGltf(url);
    const app = await openGpuApp({ plugins: [createScene(url), {
        name: "TieLandmarks", dependencies: [MeshPlugin],
        async initialize(w) {
            const asset = await loadGltfScene(w, url);
            expect(asset.unsupported).toEqual([]);
            const t = w.storage(Transform);
            for (let index = 0; index < 2; index++) {
                const spawned = spawnGltfScene(w, asset, placements[index]);
                const actual = spawned.entities.flatMap((eid, i) => {
                    const v = decoded.meshes[decoded.instances[i].mesh].vertices;
                    const q = [t.rotation.x.get(eid), t.rotation.y.get(eid), t.rotation.z.get(eid)];
                    const qw = t.rotation.w.get(eid);
                    const scale = [t.scale.x.get(eid), t.scale.y.get(eid), t.scale.z.get(eid)];
                    const translation = [t.translation.x.get(eid), t.translation.y.get(eid), t.translation.z.get(eid)];
                    return Array.from({ length: v.length / 8 }, (_, k) => {
                        const p = scale.map((s, a) => s * v[k * 8 + a]);
                        const cross = (a: number[], b: number[]) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
                        const c = cross(q, p), d = cross(q, c);
                        return p.map((value, a) => value + 2 * (qw * c[a] + d[a]) + translation[a]);
                    });
                });
                // Explicit world measurements, not the placements array under test.
                assertPoints(actual, sourcePoints.map(([x, y, z]) => index === 0
                    ? [x - 1.5, y, z] : [1.5 + z, y, -x]));
            }
        },
    }] });
    try { expect(app.world.resource(Scene).instances.map((i) => i.length)).toEqual([1, 1]); }
    finally { app.dispose(); }
}, TIMEOUT.gpu);

for (const asset of ["wheel-carrier", "blitz-tie"])
    test(`${asset}: subset still rejects nonstatic contributions`, async () => {
        const json = await Bun.file(new URL(`../public/assets/${asset}.gltf`, import.meta.url)).json();
        requireStaticInstance(json);
        for (const addition of [{ animations: [{ channels: [], samplers: [] }] }, { skins: [{}] }, { textures: [{}] }])
            expect(() => requireStaticInstance({ ...json, ...addition })).toThrow();
    });
