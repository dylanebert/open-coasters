import type { GltfJson } from '@dylanebert/shallot/gltf';

export type SampledSection = readonly (readonly [number, number])[];
/** Bounded geometry-only binding: one directed closed convex XY line cycle in
 * its identity local frame. This is not glTF sweep semantics or a format validator. */
export function sampledSection(json: GltfJson, buffers: readonly ArrayBuffer[]): SampledSection {
  const fail = (): never => { throw new Error('Sampled section: unsupported or invalid geometry'); };
  // Explicit subset: refuse semantic fields rather than silently losing them.
  const fields = (o: unknown, allowed: string[]) => {
    if (!o || typeof o !== 'object' || Object.keys(o).some(k => ![...allowed, 'name', 'extras'].includes(k))) fail();
  };
  fields(json, ['asset', 'scene', 'scenes', 'nodes', 'meshes', 'accessors', 'bufferViews', 'buffers']);
  fields(json.asset, ['version', 'generator', 'copyright']);
  if (json.asset?.version !== '2.0' || json.scene !== 0 || json.scenes?.length !== 1 || json.nodes?.length !== 1 || json.meshes?.length !== 1) fail();
  fields(json.scenes![0], ['nodes']); fields(json.nodes![0], ['mesh']); fields(json.meshes![0], ['primitives']);
  if (JSON.stringify(json.scenes![0].nodes) !== '[0]' || json.nodes![0].mesh !== 0 || json.meshes![0].primitives.length !== 1) fail();
  const p = json.meshes![0].primitives[0];
  fields(p, ['attributes', 'indices', 'mode']); fields(p.attributes, ['POSITION']);
  if (p.mode !== 1 || p.indices === undefined || p.attributes.POSITION === undefined) fail();
  for (const a of json.accessors ?? []) fields(a, ['bufferView', 'byteOffset', 'componentType', 'count', 'type', 'min', 'max']);
  for (const v of json.bufferViews ?? []) fields(v, ['buffer', 'byteOffset', 'byteLength', 'byteStride', 'target']);
  for (const b of json.buffers ?? []) fields(b, ['uri', 'byteLength']);
  if (json.buffers?.length !== buffers.length || buffers.some((b, i) => b.byteLength !== json.buffers![i].byteLength)) fail();
  function values(index: number, positions: boolean) {
    const a = json.accessors?.[index], v = a && json.bufferViews?.[a.bufferView!];
    if (!Number.isInteger(index) || !a || !v || !Number.isInteger(a.count) || a.count < 1 || a.count > 4096 || (positions ? a.type !== 'VEC3' || a.componentType !== 5126 : a.type !== 'SCALAR' || ![5121,5123,5125].includes(a.componentType))) return fail();
    const size = a.componentType === 5121 ? 1 : a.componentType === 5123 ? 2 : 4;
    const width = positions ? 3 : 1, stride = v.byteStride ?? width * size;
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), data = buffers[v.buffer];
    if (!data || !Number.isInteger(v.buffer) || !Number.isInteger(v.byteOffset ?? 0) || !Number.isInteger(a.byteOffset ?? 0) || !Number.isInteger(v.byteLength) || v.byteLength < 0 || !Number.isInteger(stride) || stride < width * size || stride % size || start % size || start < 0 || (a.byteOffset ?? 0) < 0 || start + (a.count - 1) * stride + width * size > (v.byteOffset ?? 0) + v.byteLength || (v.byteOffset ?? 0) + v.byteLength > data.byteLength) return fail();
    const view = new DataView(data);
    return Array.from({length: a.count * width}, (_, i) => {
      const offset = start + Math.floor(i / width) * stride + (i % width) * size;
      return positions ? view.getFloat32(offset, true) : size === 1 ? view.getUint8(offset) : size === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true);
    });
  }
  const xyz = values(p.attributes.POSITION, true), edges = values(p.indices!, false), n = xyz.length / 3;
  if (n < 3 || edges.length !== 2 * n || xyz.some(v => !Number.isFinite(v))) fail();
  // Directed connectivity carries authored winding. Never sort, reverse or merge points.
  const order = edges.filter((_, i) => i % 2 === 0);
  if (new Set(order).size !== n || edges.some(i => !Number.isInteger(i) || i < 0 || i >= n) || order.some((_, i) => edges[2*i+1] !== order[(i+1)%n])) fail();
  const points = order.map(i => {
    if (Math.abs(xyz[3*i+2]) > 1e-6) fail();
    return [xyz[3*i], xyz[3*i+1]] as const;
  });
  // Strict convexity + positive winding rejects crossings, duplicates and degenerate edges.
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i+1)%n];
    if (Math.hypot(b[0]-a[0], b[1]-a[1]) <= 2e-6) fail();
    for (let j = 0; j < n; j++) if (j !== i && j !== (i+1)%n) {
      const c = points[j];
      if ((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]) <= 1e-12) fail();
    }
  }
  return points;
}
export async function loadSampledSection(url: URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Section fetch failed');
  const json: GltfJson = await response.json();
  const buffers = await Promise.all((json.buffers ?? []).map(async b => {
    if (!b.uri) throw new Error('Section buffer URI required');
    const r = await fetch(new URL(b.uri, response.url || url));
    if (!r.ok) throw new Error('Section buffer fetch failed');
    return r.arrayBuffer();
  }));
  return sampledSection(json, buffers);
}
