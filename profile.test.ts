import { describe, expect, test } from "bun:test";
import { prepareProfileDocument, recoverProfile, type Point } from "./profile";

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
async function loadProfile(f: Fixture) {
  return recoverProfile([{ ...f, material: 0 }], [{}]);
}
const reject = async (f: Fixture, message: string) => expect(loadProfile(f)).rejects.toThrow(message);
describe("matching-end recovery", () => {
  test("plain decoded input preserves metric frame, hard edges and opaque material identity", () => {
    const a = {}, b = {};
    const f = fixture();
    const p = recoverProfile([
      { positions: f.positions.slice(0, 12), normals: f.normals.slice(0, 12), indices: [0, 1, 2, 0, 2, 3], material: 0 },
      { positions: f.positions.slice(12), normals: f.normals.slice(12), indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11], material: 1 },
    ], [a, b]);
    expect(p.points).toEqual([[2, -1], [4, -1], [4, 2], [2, 2]]);
    expect(p.contours).toEqual([[
      { from: 0, to: 1, normals: [[0, -1], [0, -1]], material: 0 },
      { from: 1, to: 2, normals: [[1, 0], [1, 0]], material: 1 },
      { from: 2, to: 3, normals: [[0, 1], [0, 1]], material: 1 },
      { from: 3, to: 0, normals: [[-1, 0], [-1, 0]], material: 1 },
    ]]);
    expect(p.materials[0]).toBe(a); expect(p.materials[1]).toBe(b);
  });
  test("first coordinates are not snapped; ambiguous matching and boundary degeneracy refuse", async () => {
    const f = fixture(); f.positions[0] += 0.5e-6;
    const p = await loadProfile(f);
    expect(p.points[0]).toEqual([2.0000005, -1]);
    expect(() => recoverProfile([{ positions: [0, 0, 0, 1.5e-6, 0, 0, 0.75e-6, 0, 1],
      normals: [0, -1, 0, 0, -1, 0, 0, -1, 0], indices: [], material: 0 }], [{}])).toThrow("ambiguous position tolerance");
    const flat = fixture(); flat.positions = flat.positions.map((v, i) => i % 3 === 2 ? (v === -3 ? 0 : 2e-6) : v);
    await reject(flat, "distinct ends");
    const inward = fixture(); inward.normals = inward.normals.map(v => -v);
    await reject(inward, "inward or tangent");
  });
  test("decoded boundary rejects malformed counts, indices, materials and finite data", () => {
    const f = { ...fixture(), material: 0 };
    for (const patch of [
      { positions: [0] }, { normals: [] }, { indices: [0, 1, 1.5] },
      { indices: [-1, 0, 1] }, { indices: [0, 1, 16] }, { indices: [NaN] },
      { material: -1 }, { material: 1 }, { material: 0.5 },
      { positions: f.positions.map((v, i) => i === 0 ? Infinity : v) },
      { normals: f.normals.map((v, i) => i === 0 ? NaN : v) },
    ]) expect(() => recoverProfile([{ ...f, ...patch }], [{}])).toThrow();
    expect(() => recoverProfile([], [])).toThrow("invalid positions");
  });
  test("preflight normalizes omitted default once without merging authored slots", () => {
    const authored = {};
    const j: any = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      accessors: [{ count: 4 }], meshes: [{ primitives: [0, undefined, undefined].map(material => ({ attributes: { POSITION: 0, NORMAL: 1 }, material })) }], materials: [authored] };
    prepareProfileDocument(j);
    expect(j.meshes[0].primitives.map((p: any) => p.material)).toEqual([0, 1, 1]);
    expect(j.materials).toEqual([{}, {}]); expect(j.materials[0]).toBe(authored);
    prepareProfileDocument(j); expect(j.materials).toHaveLength(2);
    // Document-only acceptance stays independent of nativeSnapshot layout rules.
    const sparse = structuredClone(j);
    sparse.accessors[0].sparse = { count: 1, indices: { bufferView: 0, componentType: 5123 }, values: { bufferView: 1 } };
    prepareProfileDocument(sparse);
    for (const field of ["translation", "rotation", "scale", "matrix"]) {
      const bad = structuredClone(j); bad.nodes[0][field] = field === "matrix" ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : field === "rotation" ? [0, 0, 0, 1] : field === "scale" ? [1, 1, 1] : [0, 0, 0];
      expect(() => prepareProfileDocument(bad)).toThrow("transforms unsupported");
    }
    const missing = structuredClone(j); delete missing.meshes[0].primitives[0].attributes.NORMAL;
    expect(() => prepareProfileDocument(missing)).toThrow("NORMAL required");
    const uv = structuredClone(j); uv.meshes[0].primitives[0].attributes.TEXCOORD_0 = 2;
    expect(() => prepareProfileDocument(uv)).toThrow("only POSITION and NORMAL");
  });
  test("smooth endpoint normals retained without averaging hard corners", async () => {
    const p = await loadProfile(fixture(undefined, true));
    expect(p.contours[0][0].normals[1]).toEqual(p.contours[0][1].normals[0]);
    expect(p.contours[0][0].normals[0][0]).toBeCloseTo(-1 / Math.hypot(1, 1.5));
  });
  test("disjoint contours remain separate", async () => {
    const second = rectangle.map(([x, y]) => [x + 8, y] as Point);
    const p = await loadProfile(fixture([rectangle, second]));
    expect(p.points).toEqual([...rectangle, ...second]);
    expect(p.contours.map(c => c.map(e => e.from))).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
  });
  test("concavity, collinear forward edges, either quad diagonal", async () => {
    const polygon: Point[] = [[0, 0], [1, 0], [2, 0], [2, 2], [1, 1], [0, 2]];
    const f = fixture([polygon]);
    f.indices.splice(0, 6, 0, 1, 3, 1, 2, 3);
    const p = await loadProfile(f);
    expect(p.points).toEqual(polygon);
    expect(p.contours[0].map(e => e.from)).toEqual([0, 1, 2, 3, 4, 5]);
    await reject(fixture([[...rectangle].reverse()]), "CCW");
  });
  test("thin adjacent edges are not overlapping; exact backtracking is", async () => {
    const thin: Point[] = [[0, 0], [1, 0], [0.5, 0.5e-6]];
    const p = await loadProfile(fixture([thin]));
    expect(p.points).toEqual([[0, 0], [1, 0], [0.5, 0.5e-6]]);
    expect(p.contours[0].map(e => [e.from, e.to])).toEqual([[0, 1], [1, 2], [2, 0]]);
    await reject(fixture([[[0, 0], [2, 0], [1, 0], [2, 2], [0, 2]]]), "overlapping adjacent edges");
  });
  test("nonadjacent near-contact still uses position tolerance", async () => {
    const shifted = (gap: number) => rectangle.map(([x, y]) => [x + 2 + gap, y + 0.5] as Point);
    await reject(fixture([rectangle, shifted(0.5e-6)]), "intersecting contours");
    expect((await loadProfile(fixture([rectangle, shifted(2e-6)]))).contours).toHaveLength(2);
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
    await loadProfile(close);
    const far = fixture(); far.positions[6] += 2e-6; await reject(far, "side-wall triangle");
    const closeNormal = fixture(); closeNormal.normals[6] = 0.5e-5;
    await loadProfile(closeNormal);
    const farNormal = fixture(); farNormal.normals[6] = 2e-5;
    await reject(farNormal, "longitudinal normal");
  });
});
