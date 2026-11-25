import { mapList } from './list';
import { frame, type Frame } from './geometry';
import { nativeSnapshot as partSnapshot } from '../part';
import type { NativeDocument, ImmutableNativeSnapshot } from '../part';
export type { NativeDocument, ImmutableNativeSnapshot } from '../part';
export type Content = { readonly snapshot: ImmutableNativeSnapshot };
export type Construction = { readonly placements: readonly { readonly content: Content; readonly frame: Frame }[] };
const snapshots = new WeakSet<object>();
const assert = (ok: unknown, cause: string): void => {
    if (!ok) throw Error(`native resource: ${cause}`);
};
/** Construction adapter; the part owner alone decides native acceptance. */
export function nativeSnapshot(source: NativeDocument, resources: readonly (ArrayBuffer | Uint8Array)[]): ImmutableNativeSnapshot {
    assert(Array.isArray(resources), 'resources must be an array');
    const snapshot = partSnapshot(source, resources);
    snapshots.add(snapshot);
    return snapshot;
}
/** Read JSON glTF with explicit buffer URIs. Resolve and own every declared
 * buffer before publishing a snapshot checked by the part contract.
 * Explicit native-result reading; this never executes or searches for a recipe. */
export async function readNative(url: URL): Promise<ImmutableNativeSnapshot> {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Native load failed: ${response.status}`);
    const document = await response.json() as NativeDocument;
    const base = response.url || url.href;
    const resources = await Promise.all((document.buffers ?? []).map(async (buffer: any) => {
        if (typeof buffer.uri !== 'string') throw Error('Native reader requires explicit buffer URI (no GLB binding)');
        const result = await fetch(new URL(buffer.uri, base));
        if (!result.ok) throw Error(`Native buffer load failed: ${result.status}`);
        return new Uint8Array(await result.arrayBuffer());
    }));
    return nativeSnapshot(document, resources);
}
export function nativeURL(document: NativeDocument): URL {
    return new URL(`data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`);
}
/** Fresh consumer-owned bytes; mutating them cannot alter the snapshot. */
export function snapshotBytes(snapshot: ImmutableNativeSnapshot, buffer: number): Uint8Array {
    return Uint8Array.from(atob(snapshot.buffers[buffer]), c => c.charCodeAt(0));
}
export function contentValue(v: any): Content {
    assert(v && Object.keys(v).length === 1 && snapshots.has(v.snapshot), 'Content requires checked immutable snapshot');
    return Object.freeze({ snapshot: v.snapshot });
}
export function constructionValue(v: any): Construction {
    assert(v && Object.keys(v).length === 1, 'invalid Construction');
    return Object.freeze({ placements: Object.freeze(mapList(v.placements, 'placements', (p: any) => {
        assert(p && Object.keys(p).length === 2 && 'content' in p && 'frame' in p, 'invalid placement');
        return Object.freeze({ content: contentValue(p.content), frame: frame(p.frame) });
    })) });
}
/** Export glTF with embedded buffers, readable without running the recipe.
 * Wrap selected roots in each placement without changing native transforms or
 * hierarchy. Copy meshes and resources once per snapshot identity. */
export function resolvedNative(construction: Construction): NativeDocument {
    const value = constructionValue(construction);
    if (value.placements.length === 0) return freezeDocument({ asset: { version: '2.0' }, scene: 0, scenes: [{}] });
    const collections = ['meshes', 'materials', 'accessors', 'bufferViews', 'buffers'];
    const out: NativeDocument = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
    const imported = new Map<ImmutableNativeSnapshot, { document: NativeDocument; offsets: Record<string, number> }>();
    for (const placement of value.placements) {
        const snapshot = placement.content.snapshot;
        if (!imported.has(snapshot)) {
            const d = structuredClone(snapshot.document), offsets: Record<string, number> = {};
            for (const key of collections) offsets[key] = out[key].length;
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
    // Optional glTF collections must be nonempty when present.
    for (const key of collections) if (out[key].length === 0) delete out[key];
    return freezeDocument(out);
}

// Export owns this plain JSON tree, including all cloned native metadata.
function freezeDocument<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeDocument(child);
        Object.freeze(value);
    }
    return value;
}
