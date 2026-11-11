import { loadGltf, type GltfJson, type GltfMaterial } from "@dylanebert/shallot/gltf";
import { requireStaticInstance } from "./instance";

export type Point = [number, number];
export interface ProfileEdge {
  from: number;
  to: number;
  normals: [Point, Point];
  material: number;
}
export interface Profile {
  /** Authored XY coordinates; origin is (0,0), never a centroid. */
  points: Point[];
  contours: ProfileEdge[][];
  materials: GltfMaterial[];
}
// Absolute meters and dimensionless normal components, respectively. No snapping output.
export const profileTolerance = { position: 1e-6, normal: 1e-5 } as const;
const fail = (reason: string): never => { throw new Error(`Profile: ${reason}`); };
const near = (a: number, b: number, t: number = profileTolerance.position) => Math.abs(a - b) <= t;

/** Contribution gate, not a glTF validator. Decode exactly the document checked. */
export async function loadProfile(url: URL): Promise<Profile> {
  const response = await fetch(url);
  if (!response.ok) fail(`fetch ${response.status}`);
  const json = await response.json() as GltfJson;
  requireStaticInstance(json);
  for (const node of json.nodes ?? []) {
    if (node.matrix || node.translation || node.rotation || node.scale)
      fail("authored transforms unsupported; export section in the root frame");
  }
  let defaultMaterial: number | undefined;
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    // An empty core material expresses glTF's default, in a distinct table slot.
    if (primitive.material === undefined) {
      if (defaultMaterial === undefined) {
        json.materials ??= [];
        defaultMaterial = json.materials.push({}) - 1;
      }
      primitive.material = defaultMaterial;
    }
    if (Object.keys(primitive.attributes).some(key => key !== "POSITION" && key !== "NORMAL"))
      fail("only POSITION and NORMAL attributes supported");
    if (primitive.attributes.NORMAL === undefined) fail("authored NORMAL required");
  }
  for (const buffer of json.buffers ?? []) if (buffer.uri)
    buffer.uri = new URL(buffer.uri, response.url || url.href).href;
  const scene = await loadGltf(new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`));
  if (scene.unsupported.length) fail(scene.unsupported.join(", "));
  const meshes = scene.instances.map(instance => scene.meshes[instance.mesh]);
  const points: Point[] = [];
  const position = profileTolerance.position;
  const levels = meshes.flatMap(mesh => Array.from({ length: mesh.vertices.length / 8 }, (_, i) => mesh.vertices[i * 8 + 2]));
  if (!levels.length || levels.some(z => !Number.isFinite(z))) fail("invalid positions");
  const low = levels.reduce((a, b) => Math.min(a, b), Infinity);
  const high = levels.reduce((a, b) => Math.max(a, b), -Infinity);
  if (high - low <= 2 * position) fail("distinct ends required");
  const edges = new Map<string, { edge: ProfileEdge; triangles: number[][] }>();
  for (const mesh of meshes) {
    const vertices = Array.from({ length: mesh.vertices.length / 8 }, (_, i) => {
      const v = mesh.vertices.slice(i * 8, i * 8 + 8);
      if (![v[0], v[1], v[2], v[4], v[5], v[6]].every(Number.isFinite)) fail("nonfinite vertex");
      if (!near(v[2], low) && !near(v[2], high)) fail("longitudinal detail");
      if (!near(v[6], 0, profileTolerance.normal) || !near(Math.hypot(v[4], v[5]), 1, profileTolerance.normal))
        fail("normal must be unit and transverse");
      const matches = points.flatMap((p, j) => near(p[0], v[0]) && near(p[1], v[1]) ? [j] : []);
      if (matches.length > 1) fail("ambiguous position tolerance");
      const id = matches[0] ?? points.push([v[0], v[1]]) - 1;
      return { id, end: near(v[2], high) ? 1 : 0, n: [v[4], v[5]] as Point };
    });
    if (mesh.indices.length % 3) fail("incomplete triangles");
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const tri = Array.from(mesh.indices.slice(i, i + 3), index => vertices[index]);
      if (tri.some(v => !v)) fail("invalid index");
      const ids = [...new Set(tri.map(v => v.id))];
      if (ids.length !== 2 || new Set(tri.map(v => v.end)).size !== 2) fail("not a side-wall triangle");
      // For outward CCW walls: low A, low B, high B (or cyclic equivalent).
      let from = -1, to = -1;
      for (let j = 0; j < 3; j++) {
        const a = tri[j], b = tri[(j + 1) % 3];
        if (a.end === b.end) {
          from = a.end === 0 ? a.id : b.id;
          to = a.end === 0 ? b.id : a.id;
        }
      }
      if (from < 0) fail("invalid connectivity");
      const key = ids.sort((a, b) => a - b).join(":");
      let group = edges.get(key);
      const normal = (id: number) => tri.find(v => v.id === id)!.n;
      if (!group) {
        group = { edge: { from, to, normals: [normal(from), normal(to)], material: mesh.material }, triangles: [] };
        edges.set(key, group);
      }
      const e = group.edge;
      if (e.from !== from || e.to !== to || e.material !== mesh.material) fail("inconsistent winding/material");
      for (const v of tri) {
        const n = e.normals[v.id === from ? 0 : 1];
        if (!near(n[0], v.n[0], profileTolerance.normal) || !near(n[1], v.n[1], profileTolerance.normal)) fail("longitudinal normal detail");
      }
      group.triangles.push(tri.map(v => v.id * 2 + v.end));
    }
  }
  for (const { edge, triangles } of edges.values()) {
    if (triangles.length !== 2 || new Set(triangles.flat()).size !== 4 ||
      new Set(triangles[0].filter(v => triangles[1].includes(v))).size !== 2)
      fail("each edge requires exactly one triangulated quad");
    const shared = triangles[0].filter(v => triangles[1].includes(v));
    if (Math.floor(shared[0] / 2) === Math.floor(shared[1] / 2) || shared[0] % 2 === shared[1] % 2)
      fail("quad diagonal required");
    const a = points[edge.from], b = points[edge.to];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= 2 * position) fail("short edge");
    for (const n of edge.normals) if ((n[0] * (b[1] - a[1]) - n[1] * (b[0] - a[0])) / length <= profileTolerance.normal)
      fail("inward or tangent normal");
  }
  const remaining = new Set([...edges.values()].map(g => g.edge));
  const contours: ProfileEdge[][] = [];
  for (const id of points.keys()) {
    if ([...remaining].filter(e => e.from === id).length !== 1 || [...remaining].filter(e => e.to === id).length !== 1)
      fail("open or branching contour");
  }
  while (remaining.size) {
    const first = remaining.values().next().value!;
    const contour: ProfileEdge[] = [];
    let edge = first;
    do {
      if (!remaining.delete(edge)) fail("inconsistent contour");
      contour.push(edge);
      if (edge.to === first.from) break;
      edge = [...remaining].find(e => e.from === edge.to) ?? fail("open contour");
    } while (true);
    const area = contour.reduce((sum, e) => sum + points[e.from][0] * points[e.to][1] - points[e.to][0] * points[e.from][1], 0);
    if (contour.length < 3 || area <= position * position) fail("contour must wind CCW");
    contours.push(contour);
  }
  // Distance-based contact test includes collinear overlap and near-touching edges.
  const distance = (p: Point, a: Point, b: Point) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const all = contours.flat();
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const e = all[i], f = all[j];
    const a = points[e.from], b = points[e.to], c = points[f.from], d = points[f.to];
    const adjacent = e.to === f.from || f.to === e.from;
    if (adjacent) {
      const p = e.to === f.from ? a : b, q = e.to === f.from ? d : c, joint = e.to === f.from ? b : a;
      if (cross(joint, p, q) === 0 &&
        (p[0] - joint[0]) * (q[0] - joint[0]) + (p[1] - joint[1]) * (q[1] - joint[1]) > 0)
        fail("overlapping adjacent edges");
    } else if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
      Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b)) <= position) fail("intersecting contours");
  }
  const inside = (p: Point, contour: ProfileEdge[]) => {
    let result = false;
    for (const e of contour) {
      const a = points[e.from], b = points[e.to];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  };
  for (const a of contours) for (const b of contours) if (a !== b && inside(points[a[0].from], b)) fail("nested contours");
  return { points, contours, materials: scene.materials };
}
