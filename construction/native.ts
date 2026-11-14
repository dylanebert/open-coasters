import { ConstructionError, immutable } from './kernel';
import { frame, type Frame } from './geometry';
/** Native glTF JSON, not a parallel geometry representation. */
export type NativeDocument = { [key: string]: any };
export type ImmutableNativeSnapshot = { readonly document: NativeDocument; readonly buffers: readonly (readonly number[])[] };
export type Content = { readonly snapshot: ImmutableNativeSnapshot };
export type Construction = { readonly placements: readonly { readonly content: Content; readonly frame: Frame }[] };
const snapshots = new WeakSet<object>();
const assert = (ok: unknown, cause: string): void => {
    if (!ok) throw new ConstructionError('resource', [], 'native', undefined, `native resource: ${cause}`);
};
function index(v: unknown, array: readonly unknown[] | undefined, label: string): number {
    assert(Number.isInteger(v) && (v as number) >= 0 && (v as number) < (array?.length ?? 0), `invalid ${label} index`); return v as number;
}
/** Checked static product subset, not a general glTF validator. All bytes are supplied explicitly. */
export function nativeSnapshot(source: NativeDocument, resources: readonly (ArrayBuffer | Uint8Array)[]): ImmutableNativeSnapshot {
    const finiteJSON = (v: unknown): void => {
        if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return;
        assert(!!v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null), 'finite plain JSON required');
        Object.values(v as object).forEach(finiteJSON);
    };
    finiteJSON(source);
    const doc = JSON.parse(JSON.stringify(source)) as NativeDocument;
    assert(doc.asset?.version === '2.0', 'requires glTF 2.0');
    for (const key of ['animations', 'skins', 'textures', 'images', 'extensionsUsed', 'extensionsRequired']) assert(!doc[key]?.length, `${key} unsupported`);
    assert(!('cameras' in doc), 'cameras unsupported');
    const extensions = (v: any) => assert(!v?.extensions || Object.keys(v.extensions).length === 0, 'extensions unsupported');
    extensions(doc); extensions(doc.asset);
    for (const key of ['scenes', 'nodes', 'buffers', 'bufferViews', 'accessors', 'materials', 'meshes', 'samplers']) {
        assert(doc[key] === undefined || Array.isArray(doc[key]), `${key} must be array`);
        for (const v of doc[key] ?? []) extensions(v);
    }
    const selected = index(doc.scene, doc.scenes, 'scene');
    assert(Array.isArray(doc.scenes[selected].nodes) && doc.scenes[selected].nodes.length, 'nonempty selected roots required');
    assert((doc.buffers?.length ?? 0) === resources.length, 'all declared buffers must be resolved');
    // Frozen ordinary byte arrays are intentionally used: freezing an ArrayBuffer does NOT own immutable bytes.
    const buffers = resources.map((r, i) => {
        assert(r instanceof Uint8Array || r instanceof ArrayBuffer, 'resolved bytes required');
        const bytes = r instanceof Uint8Array ? new Uint8Array(r) : new Uint8Array(r.slice(0));
        assert(Number.isSafeInteger(doc.buffers[i].byteLength) && bytes.length === doc.buffers[i].byteLength, 'buffer byteLength mismatch');
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        doc.buffers[i].uri = `data:application/octet-stream;base64,${btoa(binary)}`;
        return Object.freeze(Array.from(bytes));
    });
    const payloads = buffers.map(bytes => new DataView(Uint8Array.from(bytes).buffer));
    for (const v of doc.bufferViews ?? []) {
        const b = index(v.buffer, buffers, 'buffer');
        assert(Number.isSafeInteger(v.byteLength) && v.byteLength > 0 && Number.isSafeInteger(v.byteOffset ?? 0) && (v.byteOffset ?? 0) >= 0 && (v.byteOffset ?? 0) + v.byteLength <= buffers[b].length, 'bufferView range');
    }
    const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    for (const a of doc.accessors ?? []) {
        // Sparse decoding is not needed by this resolved witness; refusal is explicit, never silent data loss.
        assert(!a.sparse, 'sparse accessors unsupported');
        const v = doc.bufferViews?.[index(a.bufferView, doc.bufferViews, 'bufferView')];
        const size = sizes[a.componentType] * components[a.type], offset = a.byteOffset ?? 0, stride = v.byteStride ?? size;
        assert(size && Number.isSafeInteger(a.count) && a.count > 0 && Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(stride) && stride >= size && offset + (a.count - 1) * stride + size <= v.byteLength, 'accessor range/layout');
    }
    for (const m of doc.materials ?? []) {
        assert(!m.alphaMode || m.alphaMode === 'OPAQUE', 'opaque materials required'); extensions(m.pbrMetallicRoughness);
        assert(!m.normalTexture && !m.occlusionTexture && !m.emissiveTexture && !m.pbrMetallicRoughness?.baseColorTexture && !m.pbrMetallicRoughness?.metallicRoughnessTexture, 'textures unsupported');
    }
    for (const m of doc.meshes ?? []) {
        assert(!('weights' in m) && Array.isArray(m.primitives) && m.primitives.length, 'invalid mesh / morph weights');
        for (const p of m.primitives) {
            extensions(p); assert(!('targets' in p) && (p.mode ?? 4) === 4, 'only static triangles supported');
            assert(p.attributes && !('JOINTS_0' in p.attributes) && !('WEIGHTS_0' in p.attributes), 'skinning unsupported');
            const position = doc.accessors?.[index(p.attributes.POSITION, doc.accessors, 'POSITION')];
            assert(position.type === 'VEC3' && position.componentType === 5126 && (position.normalized === undefined || position.normalized === false), 'non-normalized float VEC3 positions required');
            const pv = doc.bufferViews[position.bufferView], po = position.byteOffset ?? 0, ps = pv.byteStride ?? 12;
            assert(po % 4 === 0 && ((pv.byteOffset ?? 0) + po) % 4 === 0 && ps % 4 === 0 && ps >= 12 && ps <= 252, 'POSITION alignment/stride unsupported');
            const positions = payloads[pv.buffer], start = (pv.byteOffset ?? 0) + po;
            for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++)
                assert(Number.isFinite(positions.getFloat32(start + i * ps + c * 4, true)), 'nonfinite POSITION payload');
            for (const a of Object.values(p.attributes)) index(a, doc.accessors, 'attribute');
            let count = position.count;
            if (p.indices !== undefined) {
                const a = doc.accessors[index(p.indices, doc.accessors, 'indices')];
                assert(a.type === 'SCALAR' && [5121, 5123, 5125].includes(a.componentType) && (a.normalized === undefined || a.normalized === false), 'non-normalized unsigned SCALAR indices required');
                const v = doc.bufferViews[a.bufferView], size = sizes[a.componentType], offset = a.byteOffset ?? 0;
                // Index streams are tightly packed; interleaving is supported only for vertex POSITION.
                assert(v.byteStride === undefined, 'index byteStride unsupported');
                assert(offset % size === 0 && ((v.byteOffset ?? 0) + offset) % size === 0, 'index alignment unsupported');
                const data = payloads[v.buffer], start = (v.byteOffset ?? 0) + offset;
                for (let i = 0; i < a.count; i++) {
                    const at = start + i * size;
                    const value = size === 1 ? data.getUint8(at) : size === 2 ? data.getUint16(at, true) : data.getUint32(at, true);
                    assert(value < position.count && value < 2 ** (8 * size) - 1, 'index payload outside POSITION range / reserved restart index');
                }
                count = a.count;
            }
            assert(count >= 3 && count % 3 === 0, 'triangle count');
            if (p.material !== undefined) index(p.material, doc.materials, 'material');
        }
    }
    const parents = new Set<number>();
    for (const n of doc.nodes ?? []) {
        assert(!('skin' in n) && !('weights' in n) && !('camera' in n), 'skin/morph/camera unsupported');
        assert(!(n.matrix && (n.translation || n.rotation || n.scale)), 'matrix and TRS cannot coexist');
        for (const [key, length] of [['matrix', 16], ['translation', 3], ['rotation', 4], ['scale', 3]] as const) {
            if (n[key] !== undefined) assert(Array.isArray(n[key]) && n[key].length === length && n[key].every((x: unknown) => typeof x === 'number' && Number.isFinite(x)), 'invalid node transform');
        }
        if (n.rotation) frame({ translation: [0, 0, 0], rotation: n.rotation });
        if (n.mesh !== undefined) index(n.mesh, doc.meshes, 'mesh');
        if (n.children !== undefined) assert(Array.isArray(n.children), 'children array');
        for (const c of n.children ?? []) { index(c, doc.nodes, 'child'); assert(!parents.has(c), 'multiple parents'); parents.add(c); }
    }
    const done = new Set<number>(), active = new Set<number>();
    const visit = (i: number): boolean => {
        index(i, doc.nodes, 'node'); assert(!active.has(i), 'hierarchy cycle'); active.add(i);
        const n = doc.nodes[i]; let geometry = n.mesh !== undefined;
        for (const c of n.children ?? []) geometry = visit(c) || geometry;
        active.delete(i); done.add(i); return geometry;
    };
    for (let i = 0; i < (doc.nodes?.length ?? 0); i++) if (!done.has(i)) visit(i);
    for (const s of doc.scenes) {
        assert(s.nodes === undefined || (Array.isArray(s.nodes) && new Set(s.nodes).size === s.nodes.length), 'invalid scene roots');
        for (const root of s.nodes ?? []) { index(root, doc.nodes, 'root'); assert(!parents.has(root), 'scene root has parent'); }
    }
    assert(doc.scenes[selected].nodes.map(visit).some(Boolean), 'selected scene requires geometry');
    const snapshot = immutable({ document: doc, buffers }); snapshots.add(snapshot); return snapshot;
}
export function contentValue(v: any): Content {
    assert(v && Object.keys(v).length === 1 && snapshots.has(v.snapshot), 'Content requires checked immutable snapshot');
    return Object.freeze({ snapshot: v.snapshot });
}
export function constructionValue(v: any): Construction {
    assert(v && Object.keys(v).length === 1 && Array.isArray(v.placements), 'invalid Construction');
    return Object.freeze({ placements: Object.freeze(v.placements.map((p: any) => {
        assert(p && Object.keys(p).length === 2 && 'content' in p && 'frame' in p, 'invalid placement');
        return Object.freeze({ content: contentValue(p.content), frame: frame(p.frame) });
    })) });
}
/** Ordinary resolved glTF, readable without the graph. Meshes/resources are copied once per snapshot identity. */
export function resolvedNative(construction: Construction): NativeDocument {
    const value = constructionValue(construction);
    const out: NativeDocument = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
    const imported = new Map<ImmutableNativeSnapshot, { document: NativeDocument; offsets: Record<string, number> }>();
    for (const placement of value.placements) {
        const snapshot = placement.content.snapshot;
        if (!imported.has(snapshot)) {
            const d = structuredClone(snapshot.document), offsets: Record<string, number> = {};
            for (const key of ['meshes', 'materials', 'accessors', 'bufferViews', 'buffers']) offsets[key] = out[key].length;
            for (const v of d.bufferViews ?? []) v.buffer += offsets.buffers;
            for (const a of d.accessors ?? []) a.bufferView += offsets.bufferViews;
            for (const m of d.meshes ?? []) for (const p of m.primitives) {
                for (const k of Object.keys(p.attributes)) p.attributes[k] += offsets.accessors;
                if (p.indices !== undefined) p.indices += offsets.accessors;
                if (p.material !== undefined) p.material += offsets.materials;
            }
            for (const key of Object.keys(offsets)) out[key].push(...(d[key] ?? []));
            imported.set(snapshot, { document: d, offsets });
        }
        const { document: d, offsets } = imported.get(snapshot)!;
        const start = out.nodes.length;
        const cloneNode = (sourceIndex: number): number => {
            const source = d.nodes[sourceIndex], n = structuredClone(source), id = out.nodes.length;
            out.nodes.push(n);
            if (n.mesh !== undefined) n.mesh += offsets.meshes;
            if (source.children) n.children = source.children.map(cloneNode);
            return id;
        };
        out.nodes.push({ translation: [...placement.frame.translation], rotation: [...placement.frame.rotation], children: [] });
        out.nodes[start].children = d.scenes[d.scene].nodes.map(cloneNode);
        out.scenes[0].nodes.push(start);
    }
    return immutable(out);
}
