/** Renderer-independent native part binding. No loading or rendering policy. */
function immutable<T>(value: T): T {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(immutable);
        Object.freeze(value);
    }
    return value;
}
/** Native glTF JSON, not a parallel geometry representation. */
export type NativeDocument = { [key: string]: any };
export type ImmutableNativeSnapshot = { readonly document: NativeDocument; readonly buffers: readonly string[] };
const assert = (ok: unknown, cause: string): void => {
    if (!ok) throw new Error(`native resource: ${cause}`);
};
function index(v: unknown, array: readonly unknown[] | undefined, label: string): number {
    assert(Number.isInteger(v) && (v as number) >= 0 && (v as number) < (array?.length ?? 0), `invalid ${label} index`); return v as number;
}
/** Legacy document-only preflight retained for profile and checker callers.
 * Does not check resource bytes or hierarchy validity: use nativeSnapshot for a
 * checked part. Same provisional feature subset, not full glTF validation.
 */
export function requireStaticInstance(json: NativeDocument): void {
    const refuse = (reason: string): never => {
        throw new Error(`Static instance: ${reason}`);
    };
    if (json.asset?.version !== "2.0") refuse("requires glTF 2.0");
    if (!Number.isInteger(json.scene) || !json.scenes?.[json.scene!]?.nodes?.length)
        refuse("explicit nonempty selected scene required");
    if (json.animations?.length) refuse("animations unsupported");
    if (json.skins?.length) refuse("skinning unsupported");
    if ("cameras" in json) refuse("cameras unsupported");
    if (json.textures?.length || json.images?.length) refuse("textures/images unsupported");
    if (json.extensionsRequired?.length || json.extensionsUsed?.length)
        refuse("extensions unsupported");

    // Inspect schema-owned locations throughout the contribution, not arbitrary extras.
    const extensions = (value: unknown): void => {
        if (
            value &&
            typeof value === "object" &&
            "extensions" in value &&
            Object.keys(value.extensions ?? {}).length
        )
            refuse("extensions unsupported");
    };
    extensions(json);
    extensions(json.asset);
    for (const items of [
        json.scenes,
        json.nodes,
        json.buffers,
        json.bufferViews,
        json.accessors,
        json.samplers,
        json.materials,
        json.meshes,
    ])
        for (const item of items ?? []) extensions(item);
    for (const accessor of json.accessors ?? []) {
        extensions(accessor.sparse);
        extensions(accessor.sparse?.indices);
        extensions(accessor.sparse?.values);
    }
    for (const node of json.nodes ?? []) {
        if (node.weights !== undefined) refuse("morph targets/weights unsupported");
        if (node.skin !== undefined) refuse("skinning unsupported");
        if ("camera" in node) refuse("cameras unsupported");
    }
    for (const mesh of json.meshes ?? []) {
        if (mesh.weights !== undefined) refuse("morph targets/weights unsupported");
        for (const p of mesh.primitives) {
            extensions(p);
            if (p.targets !== undefined) refuse("morph targets/weights unsupported");
            if (p.attributes.JOINTS_0 !== undefined || p.attributes.WEIGHTS_0 !== undefined)
                refuse("skinning unsupported");
            if ((p.mode ?? 4) !== 4) refuse("only TRIANGLES supported");
            if (p.attributes.POSITION === undefined) refuse("POSITION required");
        }
    }
    // Empty grouping nodes are allowed, but only selected descendants contribute.
    const visited = new Set<number>();
    const pending = [...json.scenes![json.scene!].nodes!];
    let geometry = false;
    while (pending.length) {
        const index = pending.pop()!;
        if (visited.has(index)) continue; // Hierarchy validity belongs to the decoder.
        visited.add(index);
        const node = json.nodes?.[index];
        if (!node) continue;
        pending.push(...(node.children ?? []));
        const mesh = node.mesh === undefined ? undefined : json.meshes?.[node.mesh];
        if (
            mesh?.primitives.some((p: NativeDocument) => {
                const positions = json.accessors?.[p.attributes.POSITION]?.count ?? 0;
                const count =
                    p.indices === undefined
                        ? positions
                        : (json.accessors?.[p.indices]?.count ?? 0);
                return positions > 0 && count >= 3;
            })
        )
            geometry = true;
    }
    if (!geometry) refuse("selected scene requires mesh geometry");

    for (const material of json.materials ?? []) {
        extensions(material.pbrMetallicRoughness);
        for (const info of [
            material.normalTexture,
            material.occlusionTexture,
            material.emissiveTexture,
            material.pbrMetallicRoughness?.baseColorTexture,
            material.pbrMetallicRoughness?.metallicRoughnessTexture,
        ]) {
            if (info) refuse("textures/images unsupported");
        }
        if (material.alphaMode && material.alphaMode !== "OPAQUE")
            refuse("only opaque materials supported");
    }
}


/** Check and own a part in the provisional static JSON glTF 2.0 binding.
 * Coordinates are right-handed metres, +Y up/+Z front; retain the authored origin
 * even outside geometry. Do not infer placement direction, physics or attachments.
 * Only selected scene roots contribute; retain native hierarchy and matrix/TRS
 * verbatim (no consumer TRS decomposition). Preserve native material records and
 * primitive material indices, including glTF's default material when absent.
 * Resources are supplied in buffer order at exactly declared byteLength. The
 * result owns deeply frozen JSON and base64 bytes; input mutation cannot alter it.
 * Throws on invalid inputs or unsupported provisional capabilities, even in
 * unselected scenes: static triangles only, opaque untextured core materials,
 * no animation, skin, morph, camera, extension or sparse accessor. This subset
 * does not establish full glTF validity. See part-rules.md for classification;
 * these feature refusals are not universal portable asset requirements.
 */
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
    // Base64 strings own immutable bytes without freezing hundreds of thousands of
    // numeric properties. Freezing an ArrayBuffer would NOT protect its contents.
    const payloads: DataView[] = [];
    const buffers: string[] = [];
    for (let i = 0; i < (doc.buffers?.length ?? 0); i++) {
        assert(Object.hasOwn(resources, i), 'resolved bytes required');
        const r = resources[i];
        assert(r instanceof Uint8Array || r instanceof ArrayBuffer, 'resolved bytes required');
        const bytes = r instanceof Uint8Array ? new Uint8Array(r) : new Uint8Array(r.slice(0));
        assert(Number.isSafeInteger(doc.buffers[i].byteLength) && bytes.length === doc.buffers[i].byteLength, 'buffer byteLength mismatch');
        payloads.push(new DataView(bytes.buffer));
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        const encoded = btoa(binary);
        doc.buffers[i].uri = `data:application/octet-stream;base64,${encoded}`;
        buffers.push(encoded);
    }
    for (const v of doc.bufferViews ?? []) {
        const b = index(v.buffer, buffers, 'buffer');
        assert(Number.isSafeInteger(v.byteLength) && v.byteLength > 0 && Number.isSafeInteger(v.byteOffset ?? 0) && (v.byteOffset ?? 0) >= 0 && (v.byteOffset ?? 0) + v.byteLength <= payloads[b].byteLength, 'bufferView range');
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
        // Authored native transforms are retained verbatim, not recipe frame inputs.
        // This subset gate is not a glTF unit-quaternion validator (exporters use float32).
        if (n.rotation) assert(Math.hypot(...n.rotation) > 0, 'zero native rotation');
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
    const snapshot = immutable({ document: doc, buffers }); return snapshot;
}
