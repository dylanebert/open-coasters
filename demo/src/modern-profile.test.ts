import { expect, test } from "bun:test";
import { loadProfile, type Profile } from "./profile";
import { parseGltf, type GltfJson } from "@dylanebert/shallot/gltf";
import { requireStaticInstance } from "./instance";
import { sweepProfile } from "./profile-sweep";

const names = ["ModernRail", "ModernSpine_1", "ModernSpine_2"];
const archive = new URL("../../assets/blitz-profile/", import.meta.url);
test("archive matches pinned KexEdit Git blobs, including source style evidence", async () => {
  const blobs = {
    "Modern.json": "922921d47d7b976f2edbd7df01a101172042c777",
    "ModernRail.obj": "1ef725405a27b8d9dc3be3da66707b3e9c76a1bd",
    "ModernSpine_1.obj": "8e091c620f1f3ca5de4765a00b821b3e0b2d915a",
    "ModernSpine_2.obj": "cb39998445278902d5a25dced6a4c53196d38765",
    "ModernTie_Med.obj": "6d43c0455ab0f6e84ff2b975201d7660a7654c2d",
    "ModernTie_Dense.obj": "73e3fc0531b95c1ce035216860143ee355bafcf2",
  };
  for (const [name, hash] of Object.entries(blobs)) {
    const bytes = await Bun.file(new URL(name, archive)).bytes();
    expect(new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(hash);
  }
  const style = await Bun.file(new URL("Modern.json", archive)).json();
  expect(style.DefaultStyle).toBe(1);
  expect(style.Styles[1].DuplicationMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernTie_Med.obj"]);
  expect(style.Styles[1].ExtrusionMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernRail.obj", "ModernSpine_1.obj"]);
  expect(style.Styles[2].ExtrusionMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernRail.obj", "ModernSpine_1.obj", "ModernSpine_2.obj"]);
  expect(style.Styles[2].DuplicationMeshes.map((m: { MeshPath: string }) => m.MeshPath)).toEqual(["ModernTie_Med.obj", "ModernTie_Dense.obj"]);
});
// Oracle reads original OBJ face-corner records, never the production extractor.
async function source(name: string) {
  const vertices: number[][] = [], normals: number[][] = [], faces: number[][][] = [];
  for (const line of (await Bun.file(new URL(`../../assets/blitz-profile/${name}.obj`, import.meta.url)).text()).split("\n")) {
    const a = line.trim().split(/\s+/);
    if (a[0] === "v") vertices.push(a.slice(1).map(Number));
    if (a[0] === "vn") { const n = a.slice(1).map(Number); const l = Math.hypot(...n); normals.push(n.map(x => x / l)); }
    if (a[0] === "f") faces.push(a.slice(1).map(c => c.split("/").map(x => Number(x) - 1)));
  }
  const z = Math.min(...vertices.map(p => p[2]));
  const edges = faces.flatMap(face => face.flatMap((c, i) => {
    const d = face[(i + 1) % face.length];
    return vertices[c[0]][2] === z && vertices[d[0]][2] === z ? [{ a: vertices[c[0]], b: vertices[d[0]], na: normals[c[2]], nb: normals[d[2]] }] : [];
  }));
  return { vertices, normals, faces, edges };
}
function close(a: number[], b: number[], tolerance = 1e-6) {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}
function qualify(p: Profile, s: Awaited<ReturnType<typeof source>>, edgeCount: number) {
  const edges = p.contours.flat();
  expect(edges.length).toBe(edgeCount);
  expect(p.points.length).toBe(edgeCount);
  expect(p.materials).toHaveLength(1);
  expect(p.materials[0].color).toEqual([1, 1, 1, 1]);
  expect(p.materials[0].metallic).toBe(1);
  expect(p.materials[0].roughness).toBe(1);
  for (const expected of s.edges) {
    const actual = edges.find(e => close(p.points[e.from], expected.a.slice(0, 2)) && close(p.points[e.to], expected.b.slice(0, 2)));
    expect(actual).toBeDefined();
    expect(close(actual!.normals[0], expected.na.slice(0, 2), 5e-5)).toBe(true);
    expect(close(actual!.normals[1], expected.nb.slice(0, 2), 5e-5)).toBe(true);
    expect(actual!.material).toBe(0);
  }
}
test("representative spine-bearing rigid parts are not the existing light tie", async () => {
  const med = (await source("ModernTie_Med")).vertices;
  const dense = (await source("ModernTie_Dense")).vertices;
  const bounds = (v: number[][]) => [0, 1, 2].flatMap(a => [Math.min(...v.map(p => p[a])), Math.max(...v.map(p => p[a]))]);
  expect(bounds(med)).toEqual([-0.6, 0.6, -0.550534, 0.05, -0.199237, 0.199237]);
  expect(bounds(dense)).toEqual([-0.2, 0.2, -1.125, -0.625, -0.2, 0.2]);
  // Medium source includes vertices near spine1's round perimeter, unlike the
  // light tie (whose Y extent is only +/-0.05). No assembly/load rating implied.
  expect(med.some(([x, y]) => Math.abs(Math.hypot(x, y + 0.5133335) - 0.266667) < 0.002)).toBe(true);
});
for (const [i, name] of names.entries()) {
  test(`${name}: archived metric frame, topology, winding, shading and default material`, async () => {
    const p = await loadProfile(new URL(`../public/assets/${name}.gltf`, import.meta.url));
    const s = await source(name);
    qualify(p, s, i === 0 ? 32 : 24);
    expect(p.contours.map(c => c.length).sort()).toEqual(i === 0 ? [16, 16] : [24]);
    // Independent source extrema, not bounds inferred from exported mesh.
    const expected = i === 0 ? [-0.670029, 0.670029, -0.070030, 0.070026] : i === 1 ? [-0.266667, 0.266666, -0.780000, -0.246667] : [-0.266667, 0.266666, -1.513334, -0.980000];
    const bounds = [Math.min(...p.points.map(p => p[0])), Math.max(...p.points.map(p => p[0])), Math.min(...p.points.map(p => p[1])), Math.max(...p.points.map(p => p[1]))];
    expect(close(bounds, expected)).toBe(true);
    for (const corruption of ["unit", "origin", "topology"]) {
      const changed = structuredClone(p);
      if (corruption === "unit") changed.points = changed.points.map(p => p.map(x => x * 100) as [number, number]);
      if (corruption === "origin") changed.points = changed.points.map(([x, y]) => [x, y + 0.1]);
      if (corruption === "topology") changed.contours[0].pop();
      expect(() => qualify(changed, s, i === 0 ? 32 : 24)).toThrow();
    }
    for (const kind of ["straight", "curve", "loop"] as const) {
      const mesh = sweepProfile(p, kind, 0);
      // Qualification examines the unchanged authored wall prefix; closure
      // layout is independently challenged by endcaps.test.ts.
      expect(mesh.positions.length).toBeGreaterThanOrEqual((i === 0 ? 32 : 24) * 386);
      expect(mesh.indices.length).toBeGreaterThanOrEqual((i === 0 ? 32 : 24) * 192 * 6);
      expect(mesh.normals.every(n => Math.abs(Math.hypot(...n) - 1) < 1e-5)).toBe(true);
    }
  });
}
for (const name of [...names, "ModernTie_Med", "ModernTie_Dense"]) {
  test(`${name}: rigid instance preserves original face corners and authored normals`, async () => {
    const json = await Bun.file(new URL(`../public/assets/${name}.gltf`, import.meta.url)).json() as GltfJson;
    requireStaticInstance(json);
    const bin = await Bun.file(new URL(`../public/assets/${name}.bin`, import.meta.url)).arrayBuffer();
    const scene = parseGltf(json, [bin]);
    const s = await source(name);
    expect(scene.unsupported).toEqual([]);
    const mesh = scene.meshes[0];
    expect(mesh.indices.length).toBe(s.faces.reduce((n, f) => n + (f.length - 2) * 3, 0));
    expect(json.materials ?? []).toEqual([]);
    // Match every directed triangle including associated corner normals. Counts
    // alone would miss a rewired diagonal or lost hard seam.
    const triangles = Array.from({ length: mesh.indices.length / 3 }, (_, t) => Array.from(mesh.indices.slice(3 * t, 3 * t + 3)));
    for (const face of s.faces) {
      expect(triangles.some(tri => [0, 1, 2].some(offset => face.every((c, k) => {
        const i = tri[(k + offset) % 3];
        return close(Array.from(mesh.vertices.slice(i * 8, i * 8 + 3)), s.vertices[c[0]]) && close(Array.from(mesh.vertices.slice(i * 8 + 4, i * 8 + 7)), s.normals[c[2]], 2.5e-4);
      })))).toBe(true);
    }
  });
}
