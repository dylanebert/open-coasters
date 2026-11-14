import { immutable, registry, type Primitive } from './kernel';
import { frame, ids, nominal, list, rotate, standardTypes, standardOperations, type Frame } from './geometry';
import { contentValue, nativeSnapshot, type ImmutableNativeSnapshot, type Construction } from './native';
import { sectionValue, type SampledSection } from './section';
export const sectionId = 'cc.convex-section@1';
export const materialId = 'cc.native-material@1';
export type Material = { readonly snapshot: ImmutableNativeSnapshot; readonly material: number };
/** Explicit core untextured opaque material selection; not arbitrary native appearance. */
export function materialValue(v: any): Material {
    if (!v || Object.keys(v).length !== 2 || !Object.hasOwn(v, 'material')) throw Error('invalid Material');
    const { snapshot } = contentValue({ snapshot: v.snapshot });
    if (!Number.isInteger(v.material) || v.material < 0 || v.material >= (snapshot.document.materials?.length ?? 0)) throw Error('invalid selected material');
    const m = snapshot.document.materials[v.material];
    const fields = (o: any, allowed: string[]) => { if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !allowed.includes(k))) throw Error('unsupported material appearance'); };
    fields(m, ['name', 'extras', 'pbrMetallicRoughness', 'emissiveFactor', 'alphaMode', 'doubleSided']);
    if (m.alphaMode !== undefined && m.alphaMode !== 'OPAQUE') throw Error('opaque material required');
    if (m.doubleSided !== undefined && typeof m.doubleSided !== 'boolean') throw Error('invalid doubleSided');
    const factor = (a: any, n: number) => { if (!Array.isArray(a) || a.length !== n || a.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1)) throw Error('invalid material factor'); };
    if (m.emissiveFactor !== undefined) factor(m.emissiveFactor, 3);
    if (m.pbrMetallicRoughness !== undefined) {
        const p = m.pbrMetallicRoughness;
        fields(p, ['baseColorFactor', 'metallicFactor', 'roughnessFactor']);
        if (p.baseColorFactor !== undefined) factor(p.baseColorFactor, 4);
        for (const k of ['metallicFactor', 'roughnessFactor']) if (p[k] !== undefined) factor([p[k]], 1);
    }
    return Object.freeze({ snapshot, material: v.material });
}
/** Diagnostic OPEN sweep. No implicit topology, UVs, smoothing or solver. */
export function sweepConvex(section: SampledSection, source: readonly Frame[], wall: Material, cap: Material): Construction {
    sectionValue(section); wall = materialValue(wall); cap = materialValue(cap);
    if (!Array.isArray(source) || source.length < 2) throw Error('at least two frames required');
    const frames = source.map(frame);
    const rings = frames.map(f => section.map(([x, y]) => rotate(f.rotation, [x, y, 0]).map((v, i) => v + f.translation[i])));
    const positions: number[][] = [[], []], normals: number[][] = [[], []];
    function triangle(kind: number, a: number[], b: number[], c: number[]) {
        const u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]);
        const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]], length = Math.hypot(...cross);
        if (![...a, ...b, ...c, ...cross, length].every(Number.isFinite) || length <= 1e-12) throw Error('nonfinite or degenerate sweep triangle');
        const n = cross.map(x => x / length);
        positions[kind].push(...a, ...b, ...c); normals[kind].push(...n, ...n, ...n);
    }
    const n = section.length;
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
        const k = (j + 1) % n, a = rings[i][j], b = rings[i][k], c = rings[i+1][k], d = rings[i+1][j];
        triangle(0, a, b, c); triangle(0, a, c, d);
    }
    const start = rings[0], end = rings.at(-1)!;
    for (let j = 1; j < n-1; j++) { triangle(1, start[0], start[j+1], start[j]); triangle(1, end[0], end[j], end[j+1]); }
    // Separate faceted vertices in ordinary glTF accessors. Identity uses the selected snapshot/index pair, never value equality.
    const same = wall.snapshot === cap.snapshot && wall.material === cap.material;
    const materials = [wall.snapshot.document.materials[wall.material], ...same ? [] : [cap.snapshot.document.materials[cap.material]]];
    const arrays = [positions[0], normals[0], positions[1], normals[1]].map(v => new Float32Array(v));
    if (arrays.some(a => Array.from(a).some(x => !Number.isFinite(x)))) throw Error('geometry outside native float32 range');
    const bytes = new Uint8Array(arrays.reduce((sum, a) => sum + a.byteLength, 0));
    let offset = 0;
    const bufferViews = arrays.map(a => { const view = { buffer: 0, byteOffset: offset, byteLength: a.byteLength }; bytes.set(new Uint8Array(a.buffer), offset); offset += a.byteLength; return view; });
    const accessors = arrays.map((a, i) => ({ bufferView: i, componentType: 5126, count: a.length / 3, type: 'VEC3', ...(i % 2 === 0 ? { min: [0,1,2].map(c => Math.min(...Array.from(a).filter((_, j) => j % 3 === c))), max: [0,1,2].map(c => Math.max(...Array.from(a).filter((_, j) => j % 3 === c))) } : {}) }));
    const snapshot = nativeSnapshot({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }, { attributes: { POSITION: 2, NORMAL: 3 }, material: same ? 0 : 1 }] }], materials, accessors, bufferViews, buffers: [{ byteLength: bytes.length }] }, [bytes]);
    return Object.freeze({ placements: Object.freeze([{ content: contentValue({ snapshot }), frame: frame({ translation: [0,0,0], rotation: [0,0,0,1] }) }]) });
}
export const sweepOperation: Primitive = immutable({ operation: 'cc.sweepConvex@1', inputs: [
    { name: 'section', type: nominal(sectionId) }, { name: 'frames', type: list(nominal(ids.frame)) }, { name: 'wall', type: nominal(materialId) }, { name: 'cap', type: nominal(materialId) },
], outputs: [{ name: 'construction', type: nominal(ids.construction) }], evaluate: (v: any) => ({ construction: sweepConvex(v.section, v.frames, v.wall, v.cap) }) });
/** Optional geometry registration, separate from the kernel and standard placement registry. */
export const sweepRegistry = () => registry([...standardTypes, { id: sectionId, validate: sectionValue }, { id: materialId, validate: materialValue }], [...standardOperations, sweepOperation]);
