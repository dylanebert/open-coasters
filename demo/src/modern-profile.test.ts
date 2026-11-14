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
