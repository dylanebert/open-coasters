import { mapList } from './list';
import { frame, rotate, type Frame } from './geometry';
import { contentValue, nativeSnapshot, type ImmutableNativeSnapshot, type Construction } from './native';
import { sectionValue, type ConvexSection } from './section';
/** Select an opaque, untextured core material by snapshot identity and index. */
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
/** Sweep CCW local XY rings through at least two frames in caller order.
 * Each chord must project strictly positively onto both adjacent frames' local
 * −Z axes. First and last frame origins must differ, regardless of rotation.
 * Return one identity placement of a standalone open-path sweep with a–c wall
 * diagonals and fan caps that fill the flat local XY section at each endpoint
 * frame. Neither the travel rule nor tessellation rules out folds or intersections.
 * The wall and caps are separate glTF primitives sharing one selected opaque,
 * untextured material and have no UVs. Float32 rounding may disrupt cap
 * coplanarity. Emitted POSITION determines winding normals and degeneracy:
 * nonfinite triangles or cross lengths ≤ 1e-12 refuse the whole sweep. */
export function sweep(section: ConvexSection, source: readonly Frame[], material: Material): Construction {
    sectionValue(section); material = materialValue(material);
    const frames = mapList(source, 'sweep frames', frame);
    if (frames.length < 2) throw Error('at least two frames required');
    const first = frames[0].translation, last = frames.at(-1)!.translation;
    if (first.every((x, i) => x === last[i])) throw Error('sweep endpoint origins coincide');
    let forward = rotate(frames[0].rotation, [0, 0, -1]);
    for (let i = 0; i < frames.length - 1; i++) {
        const next = frames[i + 1], nextForward = rotate(next.rotation, [0, 0, -1]);
        const chord = next.translation.map((x, j) => x - frames[i].translation[j]);
        const projection = (axis: readonly number[]) => chord.reduce((sum, x, j) => sum + x * axis[j], 0);
        if (!(projection(forward) > 0 && projection(nextForward) > 0)) {
            throw Error(`sweep chord ${i} must advance along both endpoint forward axes`);
        }
        forward = nextForward;
    }
    // POSITION is native float32: validate and derive normals from those exact
    // emitted coordinates, not from a binary64 surrogate that rounding can collapse.
    const rings = frames.map(f => section.map(([x, y]) => rotate(f.rotation, [x, y, 0]).map((v, i) => Math.fround(v + f.translation[i]))));
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
        triangle(0, a, c, b); triangle(0, a, d, c);
    }
    const start = rings[0], end = rings.at(-1)!;
    for (let j = 1; j < n-1; j++) { triangle(1, start[0], start[j], start[j+1]); triangle(1, end[0], end[j+1], end[j]); }
    const materials = [material.snapshot.document.materials[material.material]];
    const arrays = [positions[0], normals[0], positions[1], normals[1]].map(v => new Float32Array(v));
    if (arrays.some(a => Array.from(a).some(x => !Number.isFinite(x)))) throw Error('geometry outside native float32 range');
    const bytes = new Uint8Array(arrays.reduce((sum, a) => sum + a.byteLength, 0));
    let offset = 0;
    const bufferViews = arrays.map(a => { const view = { buffer: 0, byteOffset: offset, byteLength: a.byteLength }; bytes.set(new Uint8Array(a.buffer), offset); offset += a.byteLength; return view; });
    const accessors = arrays.map((a, i) => {
        const accessor = { bufferView: i, componentType: 5126, count: a.length / 3, type: 'VEC3' };
        if (i % 2 !== 0) return accessor;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let j = 0; j < a.length; j += 3) for (let c = 0; c < 3; c++) {
            min[c] = Math.min(min[c], a[j + c]);
            max[c] = Math.max(max[c], a[j + c]);
        }
        return { ...accessor, min, max };
    });
    const snapshot = nativeSnapshot({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }, { attributes: { POSITION: 2, NORMAL: 3 }, material: 0 }] }], materials, accessors, bufferViews, buffers: [{ byteLength: bytes.length }] }, [bytes]);
    return Object.freeze({ placements: Object.freeze([Object.freeze({ content: contentValue({ snapshot }), frame: frame({ translation: [0,0,0], rotation: [0,0,0,1] }) })]) });
}
