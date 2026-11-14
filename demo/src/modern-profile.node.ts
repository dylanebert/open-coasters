import { expect, test, setDefaultTimeout } from "bun:test";
import { TIMEOUT } from "@dylanebert/shallot/testing";
setDefaultTimeout(TIMEOUT.node);
import { loadProfile, type Profile } from "./profile";
import { parseGltf, type GltfJson } from "@dylanebert/shallot/gltf";
import { requireStaticInstance } from "./instance";
import { sweepProfile } from "./profile-sweep";

const names = ["ModernRail", "ModernSpine_1", "ModernSpine_2"];
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
