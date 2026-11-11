import { describe, expect, test } from "bun:test";
import { loadProfile, type Point } from "./profile";

// Independently authored off-origin, metric sections; each wall has its own corners.
const rectangle: Point[] = [[2, -1], [4, -1], [4, 2], [2, 2]];
function fixture(loops: Point[][] = [rectangle], smooth = false) {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal = [(b[1] - a[1]) / length, (a[0] - b[0]) / length, 0];
    const start = positions.length / 3;
    for (const [p, z] of [[a, -3], [b, -3], [b, 5], [a, 5]] as [Point, number][]) {
      positions.push(...p, z);
      if (smooth) {
        const center = [3, 0.5];
        const n = [p[0] - center[0], p[1] - center[1]];
        const l = Math.hypot(...n);
        normals.push(n[0] / l, n[1] / l, 0);
      } else normals.push(...normal);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return { positions, normals, indices };
}
type Fixture = ReturnType<typeof fixture>;
function url(f: Fixture, mutate: (json: any) => void = () => {}) {
  const arrays = [new Float32Array(f.positions), new Float32Array(f.normals), new Uint32Array(f.indices)];
  const bytes = Buffer.concat(arrays.map(a => Buffer.from(a.buffer)));
  let offset = 0;
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: arrays.map(a => { const view = { buffer: 0, byteOffset: offset, byteLength: a.byteLength }; offset += a.byteLength; return view; }),
    accessors: arrays.map((a, i) => ({ bufferView: i, componentType: i === 2 ? 5125 : 5126, count: a.length / (i === 2 ? 1 : 3), type: i === 2 ? "SCALAR" : "VEC3", ...(i === 0 ? { min: [2, -1, -3], max: [4, 2, 5] } : {}) })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: "authored", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1], metallicFactor: 0.3, roughnessFactor: 0.7 } }],
  };
  mutate(json);
  return new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`);
}
const reject = async (f: Fixture, message: string) => expect(loadProfile(url(f))).rejects.toThrow(message);

describe("restricted matching-end profile", () => {
  test("authored meters/origin, exact topology, hard normals and material", async () => {
    const p = await loadProfile(url(fixture()));
    expect(p.points).toEqual(rectangle);
    expect(p.contours.map(c => c.map(e => [e.from, e.to]))).toEqual([[[0, 1], [1, 2], [2, 3], [3, 0]]]);
    expect(p.contours[0].map(e => e.normals)).toEqual([[[0, -1], [0, -1]], [[1, 0], [1, 0]], [[0, 1], [0, 1]], [[-1, 0], [-1, 0]]]);
    expect(p.contours[0].map(e => e.material)).toEqual([0, 0, 0, 0]);
    expect(p.materials[0].color).toEqual([0.2, 0.4, 0.6, 1]);
    expect(p.materials[0].metallic).toBe(0.3);
    expect(p.materials[0].roughness).toBe(0.7);
  });
  test("smooth endpoint normals retained without averaging hard corners", async () => {
    const p = await loadProfile(url(fixture(undefined, true)));
    expect(p.contours[0][0].normals[1]).toEqual(p.contours[0][1].normals[0]);
    expect(p.contours[0][0].normals[0][0]).toBeCloseTo(-1 / Math.hypot(1, 1.5));
  });
  test("disjoint contours remain separate", async () => {
    const second = rectangle.map(([x, y]) => [x + 8, y] as Point);
    const p = await loadProfile(url(fixture([rectangle, second])));
    expect(p.points).toEqual([...rectangle, ...second]);
    expect(p.contours.map(c => c.map(e => e.from))).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  });
  test("material identity survives equal-valued material slots and primitive boundaries", async () => {
    const p = await loadProfile(url(fixture(), j => {
      j.materials.push(structuredClone(j.materials[0]));
      j.accessors[2].count = 6;
      j.accessors.push({ ...j.accessors[2], byteOffset: 24, count: 18 });
      j.meshes[0].primitives.push({ ...j.meshes[0].primitives[0], indices: 3, material: 1 });
    }));
    expect(p.contours[0].map(e => e.material)).toEqual([0, 1, 1, 1]);
    expect(p.materials).toHaveLength(2);
  });
  test("concavity, collinear forward edges, either quad diagonal", async () => {
    const polygon: Point[] = [[0, 0], [1, 0], [2, 0], [2, 2], [1, 1], [0, 2]];
    const f = fixture([polygon]);
    f.indices.splice(0, 6, 0, 1, 3, 1, 2, 3);
    const p = await loadProfile(url(f));
    expect(p.points).toEqual(polygon);
    expect(p.contours[0].map(e => e.from)).toEqual([0, 1, 2, 3, 4, 5]);
    await reject(fixture([[...rectangle].reverse()]), "CCW");
  });
  test("altered end and intermediate longitudinal detail", async () => {
    const end = fixture(); end.positions[6] += 0.01;
    await reject(end, "side-wall triangle");
    const middle = fixture(); middle.positions[8] = 1;
    await reject(middle, "longitudinal detail");
  });
  test("open, duplicate and reversed triangles", async () => {
    const open = fixture(); open.indices.splice(0, 6); await reject(open, "open or branching");
    const duplicate = fixture(); duplicate.indices.push(...duplicate.indices.slice(0, 3)); await reject(duplicate, "exactly one");
    const reverse = fixture(); [reverse.indices[0], reverse.indices[1]] = [reverse.indices[1], reverse.indices[0]];
    await reject(reverse, "inconsistent winding");
  });
  test("a material seam along a quad cannot become a section material", async () => {
    await expect(loadProfile(url(fixture(), j => {
      j.materials.push(structuredClone(j.materials[0]));
      j.accessors[2].count = 3;
      j.accessors.push({ ...j.accessors[2], byteOffset: 12, count: 21 });
      j.meshes[0].primitives.push({ ...j.meshes[0].primitives[0], indices: 3, material: 1 });
    }))).rejects.toThrow("inconsistent winding/material");
  });
  test("caps and longitudinal shading rejected", async () => {
    const cap = fixture(); cap.indices.push(0, 1, 4); await reject(cap, "side-wall");
    const shading = fixture(); shading.normals[8] = 0.1; await reject(shading, "transverse");
    const changed = fixture(); changed.normals[6] = 0.01; changed.normals[7] = -Math.sqrt(1 - 0.0001);
    await reject(changed, "longitudinal normal");
  });
  test("crossing, touching, nesting and self intersection", async () => {
    await reject(fixture([rectangle, rectangle.map(([x, y]) => [x + 1, y + 1])]), "intersecting");
    await reject(fixture([rectangle, rectangle.map(([x, y]) => [x + 2, y])]), "winding/material");
    await reject(fixture([rectangle, [[2.5, 0], [3.5, 0], [3.5, 1], [2.5, 1]]]), "nested");
    await reject(fixture([[[0, 0], [3, 2], [0, 2], [2, 0]]]), "intersecting");
  });
  test("explicit positional and normal tolerances", async () => {
    const close = fixture(); close.positions[6] += 0.5e-6;
    await loadProfile(url(close));
    const far = fixture(); far.positions[6] += 2e-6; await reject(far, "side-wall triangle");
    const closeNormal = fixture(); closeNormal.normals[6] = 0.5e-5;
    await loadProfile(url(closeNormal));
    const farNormal = fixture(); farNormal.normals[6] = 2e-5;
    await reject(farNormal, "longitudinal normal");
  });
  test.each([
    ["morph targets", (j: any) => { j.meshes[0].primitives[0].targets = []; }],
    ["morph weights", (j: any) => { j.nodes[0].weights = [0]; }],
    ["transforms", (j: any) => { j.nodes[0].translation = [0, 0, 0]; }],
    ["attributes", (j: any) => { j.meshes[0].primitives[0].attributes.TEXCOORD_0 = 0; }],
    ["authored NORMAL", (j: any) => { delete j.meshes[0].primitives[0].attributes.NORMAL; }],
    ["extensions", (j: any) => { j.extensionsUsed = ["unsupported"]; }],
  ])("unsupported %s", async (_name, mutate) => {
    await expect(loadProfile(url(fixture(), mutate))).rejects.toThrow();
  });
});
