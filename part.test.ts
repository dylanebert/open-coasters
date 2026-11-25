import { expect, test } from 'bun:test';
import { nativeSnapshot, type NativeDocument } from './part';

// Hand-authored metre coordinates: a 2 x 3 right triangle, away from origin.
function fixture() {
    const bytes = new Float32Array([10, 20, 30, 12, 20, 30, 10, 23, 30]);
    const document: NativeDocument = {
        asset: { version: '2.0' }, scene: 1,
        scenes: [{ nodes: [2] }, { nodes: [0] }],
        nodes: [
            { translation: [1, 2, 3], children: [1] },
            { mesh: 0, matrix: [2,0,0,0, 0,1,0,0, 0,0,1,0, 4,5,6,1] },
            { mesh: 0, translation: [100, 100, 100] },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 1 }] }],
        materials: [ { name: 'unused' }, { name: 'authored', pbrMetallicRoughness: {
            baseColorFactor: [0.2, 0.4, 0.6, 1], metallicFactor: 0.3, roughnessFactor: 0.7,
        }, doubleSided: true } ],
        buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    };
    return { document, bytes };
}

test('part retains metric coordinates, outside origin, selected hierarchy, matrix/TRS and native appearance identity', () => {
    const { document, bytes } = fixture();
    const result = nativeSnapshot(document, [bytes.buffer]);
    expect(result.document).toEqual({ ...document, buffers: [{ byteLength: 36, uri: `data:application/octet-stream;base64,${result.buffers[0]}` }] });
    const owned = Uint8Array.from(atob(result.buffers[0]), c => c.charCodeAt(0));
    expect(Array.from(new Float32Array(owned.buffer))).toEqual([10,20,30,12,20,30,10,23,30]);
    // Independent column-major native evaluation, not a reference-core helper.
    const d = result.document, root = d.nodes[d.scenes[d.scene].nodes[0]], child = d.nodes[root.children[0]];
    const m = child.matrix;
    const points = Array.from({length: 3}, (_, i) => [0,1,2].map(a =>
        m[a] * bytes[3*i] + m[4+a] * bytes[3*i+1] + m[8+a] * bytes[3*i+2] + m[12+a] + root.translation[a]));
    expect(points).toEqual([[25,27,39], [29,27,39], [25,30,39]]);
    expect([0,1,2].map(a => Math.max(...points.map(p => p[a])) - Math.min(...points.map(p => p[a])))).toEqual([4,3,0]);
    expect(d.meshes[0].primitives[0].material).toBe(1);
    expect(d.materials[1]).toEqual(document.materials[1]);
    bytes[0] = 999; document.nodes[0].translation[0] = 999;
    expect(new Float32Array(owned.buffer)[0]).toBe(10);
    expect(d.nodes[0].translation).toEqual([1,2,3]);
    expect(Object.isFrozen(d.materials[1])).toBe(true);
});

test('native TRS and matrix are retained without a renderer decomposition gate', () => {
    const { document, bytes } = fixture();
    delete document.nodes[1].matrix;
    document.nodes[1].translation = [4,5,6];
    document.nodes[1].rotation = [0,0,1,0];
    document.nodes[1].scale = [2,3,4];
    expect(nativeSnapshot(document, [bytes.buffer]).document.nodes[1]).toEqual({
        mesh: 0, translation: [4,5,6], rotation: [0,0,1,0], scale: [2,3,4],
    });
    delete document.nodes[1].translation;
    delete document.nodes[1].rotation;
    delete document.nodes[1].scale;
    document.nodes[1].matrix = [-2,0,0,0, 0,3,0,0, 0,0,4,0, 0,0,0,1];
    expect(nativeSnapshot(document, [bytes.buffer]).document.nodes[1].matrix).toEqual([-2,0,0,0, 0,3,0,0, 0,0,4,0, 0,0,0,1]);
});

test('adapters depend inward; the part core has no imports', async () => {
    const core = await Bun.file(new URL('./part.ts', import.meta.url)).text();
    expect(core).not.toMatch(/^import\s/m);
    const adapter = await Bun.file(new URL('./construction/native.ts', import.meta.url)).text();
    expect(adapter).toContain("from '../part'");
    const demo = await Bun.file(new URL('./demo/src/instance.ts', import.meta.url)).text();
    expect(demo).toContain('await readNative(url)');
    expect(demo).not.toContain('requireStaticInstance(snapshot');
    const example = await Bun.file(new URL('./examples/repeated-tie.ts', import.meta.url)).text();
    expect(example).toContain('nativeSnapshot(document, buffers)');
});

for (const [name, corrupt] of [
    ['cycle', (d: NativeDocument) => d.nodes[1].children = [0]],
    ['matrix and TRS', (d: NativeDocument) => d.nodes[1].scale = [1,1,1]],
    ['missing material', (d: NativeDocument) => d.meshes[0].primitives[0].material = 8],
    ['empty selected scene', (d: NativeDocument) => d.scenes[1].nodes = []],
    ['invalid transform', (d: NativeDocument) => d.nodes[0].translation = [Infinity,0,0]],
    ['provisional texture refusal', (d: NativeDocument) => d.images = [{uri:'unused.png'}]],
    ['sparse', (d: NativeDocument) => d.accessors[0].sparse = {}],
] as const) test(`part refuses ${name}`, () => {
    const { document, bytes } = fixture(); corrupt(document);
    expect(() => nativeSnapshot(document, [bytes.buffer])).toThrow();
});

test('part refuses corrupt bytes and missing dependencies', () => {
    const { document, bytes } = fixture();
    expect(() => nativeSnapshot(document, [])).toThrow();
    bytes[4] = NaN;
    expect(() => nativeSnapshot(document, [bytes.buffer])).toThrow('nonfinite POSITION');
});
