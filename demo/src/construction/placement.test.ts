import { TIMEOUT } from "@dylanebert/shallot/testing";
import { expect, test } from 'bun:test';
import { parseGltf, type GltfJson } from '@dylanebert/shallot/gltf';
import { compose, offsetFrames, repeatDistances, frame, sampleFrames, instance, join, path, quaternion } from '../../../construction/geometry';
import { constructionValue, contentValue, nativeSnapshot, resolvedNative, type Construction, type Content } from '../../../construction/native';
import { repeat } from '../../../construction/repeat';
const I = [0, 0, 0, 1], H = Math.SQRT1_2;
const basePath = { distances: [0, 6], positions: [[0, 1.5, 0], [0, 1.5, 6]], rotations: [I, I] };
function fixture() {
    const bytes = new Float32Array([.1, .2, .4, .4, .2, .4, .1, .5, .4]);
    const source = {
        asset: { version: '2.0' }, scene: 1, scenes: [{ nodes: [0] }, { nodes: [1, 3] }],
        nodes: [{ mesh: 0, translation: [100, 0, 0] }, { name: 'authored group', children: [2] }, { mesh: 0 }, { mesh: 0, translation: [1, 0, 0] }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorFactor: [.2, .3, .4, 1], metallicFactor: 0, roughnessFactor: .8 } }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [.1, .2, .4], max: [.4, .5, .4] }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.byteLength }], buffers: [{ byteLength: bytes.byteLength, uri: 'mutable.bin' }],
    };
    const snapshot = nativeSnapshot(source, [bytes.buffer]); return { source, bytes, snapshot, content: contentValue({ snapshot }) };
}
function near(a: readonly number[], b: readonly number[], eps = 1e-12) { expect(a.length).toBe(b.length); a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThanOrEqual(eps)); }
// Independent quaternion-to-column-matrix landmark calculation (not the product rotate/compose helpers).
function point(f: { translation: readonly number[]; rotation: readonly number[] }, p: readonly number[]) {
    const [x, y, z, w] = f.rotation;
    const rows = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
    return rows.map((r, i) => r.reduce((sum, v, j) => sum + v * p[j], f.translation[i]));
}
function run(content: Content, extra: Partial<Parameters<typeof repeat>[1]> = {}): Construction {
    return repeat(content, { path: basePath, allowed: [{ start: 0, end: 6 }], ...extra });
}

test('binary64 origin candidates: nonzero startOffset, unions, exclusions and exact/near endpoints', () => {
    const all = [{ start: 0, end: 6 }];
    expect(repeatDistances(6, 1, 0, all, [{ start: 2, end: 3.5 }])).toEqual([0, 1, 4, 5]);
    expect(repeatDistances(6, 1, .5, all, [{ start: 2, end: 3.5 }])).toEqual([.5, 1.5, 3.5, 4.5, 5.5]);
    expect(repeatDistances(6, 1, .5, [{ start: 0, end: 4 }, { start: 2, end: 6 }], [{ start: 1, end: 2 }, { start: 1.5, end: 3 }])).toEqual([.5, 3.5, 4.5, 5.5]);
    expect(repeatDistances(6, 1, 0, [], [])).toEqual([]);
    expect(repeatDistances(1, .1, 0, [{ start: 0, end: 1 }], [])).toEqual(Array.from({ length: 10 }, (_, k) => k * .1));
    expect(repeatDistances(1, .25, 0, [{ start: 0, end: 1 }], [])).toEqual([0, .25, .5, .75]);
    expect(repeatDistances(1 + Number.EPSILON, 1, 0, [{ start: 0, end: 1 + Number.EPSILON }], [])).toEqual([0, 1]);
    expect(repeatDistances(1 - Number.EPSILON / 2, 1, 0, [{ start: 0, end: 1 - Number.EPSILON / 2 }], [])).toEqual([0]);
    expect(repeatDistances(1, .1, 0, [{ start: .3, end: .30000000000000004 }], [])).toEqual([]);
    for (const args of [[0, 1, 0], [1, 0, 0], [1, 1, 1], [1, 1, -.1], [Infinity, 1, 0]]) expect(() => repeatDistances(...args as [number, number, number], [], [])).toThrow();
    expect(() => repeatDistances(1, 1, 0, [{ start: 0, end: 2 }], [])).toThrow('outside');
    let published: readonly number[] | undefined;
    expect(() => published = repeatDistances(6, 1, 0, all, [], 3)).toThrow('host candidate-work budget'); expect(published).toBeUndefined();
}, TIMEOUT.cheap);

test('frame refuses a hole in translation', () => {
 expect(() => frame({translation:[0,,4],rotation:[0,0,0,1]})).toThrow('finite number required');
}, TIMEOUT.cheap);

test('path boundaries, quaternion normalization and distinguishing shortest-arc SLERP', () => {
    const source = structuredClone(basePath), before = structuredClone(source);
    const sampled = sampleFrames(path(source), [6, 0, 2, 2]);
    expect(sampled.map(f => f.translation)).toEqual([[0, 1.5, 6], [0, 1.5, 0], [0, 1.5, 2], [0, 1.5, 2]]);
    expect(() => sampleFrames(path(source), [-Number.MIN_VALUE])).toThrow('outside');
    expect(() => sampleFrames(path(source), [6 + 2 * Number.EPSILON * 6])).toThrow('outside');
    const turn = path({ distances: [0, 4], positions: [[0, 0, 0], [0, 0, 4]], rotations: [I, [0, 1, 0, 0]] });
    near(sampleFrames(turn, [1])[0].rotation, [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]);
    near(point(sampleFrames(turn, [1])[0], [1, 0, 0]), [H, 0, 1 - H]);
    expect(source).toEqual(before); expect(Object.isFrozen(source)).toBe(false);
    expect(quaternion([0, 0, 0, -1 - 5e-13])).toEqual(I);
    expect(() => quaternion([0, 0, 0, 1 + 2e-12])).toThrow('unit');
    const normalized = frame({ translation: [0, 0, 0], rotation: [0, 0, 0, 1 + 5e-13] }); expect(normalized.rotation).toEqual(I);
    for (const p of [ { ...basePath, distances: [0, 0] }, { ...basePath, rotations: [I, [0, 0, 0, 2]] }, { ...basePath, positions: [[0, 0, 0]] } ]) expect(() => path(p)).toThrow();
}, TIMEOUT.cheap);

test('asymmetric straight/banked/inverted landmarks prove path × local × authored order', () => {
    const local = frame({ translation: [.2, -.1, .3], rotation: [0, H, 0, H] });
    const inputs = [I, [0, 0, H, H], [0, 0, 1, 0]];
    const expected = [[.6, 1.6, 2.2], [-.1, 2.1, 2.2], [-.6, 1.4, 2.2]];
    inputs.forEach((rotation, i) => {
        const adjusted = offsetFrames([frame({ translation: [0, 1.5, 2], rotation })], local)[0];
        near(point(adjusted, [.1, .2, .4]), expected[i]);
    });
    // Authored child translation remains inside the two rigid placement transforms.
    near(point(offsetFrames([frame({ translation: [0, 1.5, 2], rotation: I })], local)[0], [1.1, .2, .4]), [.6, 1.6, 1.2]);
}, TIMEOUT.cheap);

test('Ties is reusable, owns immutable native bytes, preserves identity/hierarchy and joins without flattening', () => {
    const { source, bytes, snapshot, content } = fixture(), original = structuredClone(source);
    const result = run(content);
    expect(result.placements.map(p => p.frame.translation)).toEqual([0, 1, 2, 3, 4, 5].map(s => [0, 1.5, s]));
    expect(result.placements.every(p => p.content.snapshot === snapshot)).toBe(true);
    expect(source).toEqual(original); expect(Object.isFrozen(source)).toBe(false); expect(Object.isFrozen(bytes.buffer)).toBe(false);
    const first = snapshot.buffers[0][0]; bytes.fill(0); source.nodes[2].mesh = 100; source.buffers[0].uri = 'changed';
    expect(snapshot.buffers[0][0]).toBe(first); expect(snapshot.document.nodes[2].mesh).toBe(0); expect(snapshot.document.buffers[0].uri.startsWith('data:')).toBe(true);
    for (const mutate of [() => (snapshot.buffers as string[])[0] = 'changed', () => snapshot.document.nodes[1].children.push(99), () => (result.placements as any[]).push({}), () => (result.placements[0].frame.translation as number[])[0] = 9]) expect(mutate).toThrow();
    const joined = join([result, result]); expect(joined.placements).toHaveLength(12); expect(joined.placements.every(p => p.content.snapshot === snapshot)).toBe(true);
    const distinct = fixture().snapshot; expect(distinct).not.toBe(snapshot);
    const combined = join([result, instance(contentValue({ snapshot: distinct }), [frame({ translation: [0, 0, 0], rotation: I })])]);
    expect(resolvedNative(combined).meshes).toHaveLength(2);
    // The result retains bytes after all external resource arrays have been overwritten.
    const resolved = resolvedNative(result); expect(resolved.meshes).toHaveLength(1); expect(resolved.buffers).toHaveLength(1);
    expect(resolved.scenes[0].nodes).toHaveLength(6); expect(resolved.nodes[0].children).toHaveLength(2);
    expect(resolved.nodes[1].name).toBe('authored group'); expect(resolved.nodes[1].children).toEqual([2]); expect(resolved.nodes[3].translation).toEqual([1, 0, 0]);
    let published: Construction | undefined;
    expect(() => published = run(content, { spacing: 0 })).toThrow('invalid repetition parameters'); expect(published).toBeUndefined();
    expect(run(content, { startOffset: .5 }).placements.map(p => p.frame.translation[2])).toEqual([.5, 1.5, 2.5, 3.5, 4.5, 5.5]);
}, TIMEOUT.cheap);

test('Ties reads an own non-enumerable spacing option', () => {
    const { content } = fixture();
    const options = { path: basePath, allowed: [{ start: 0, end: 6 }] };
    Object.defineProperty(options, 'spacing', { value: 2, enumerable: false });
    expect(repeat(content, options).placements.map(p => p.frame.translation[2])).toEqual([0, 2, 4]);
});

test('Ties keeps nonzero phase across a half-open gap', () => {
    const { content } = fixture();
    expect(run(content, { startOffset: .5, excluded: [{ start: 1.5, end: 3.25 }, { start: 4, end: 4.5 }] }).placements.map(p => p.frame.translation[2])).toEqual([.5, 3.5, 4.5, 5.5]);
}, TIMEOUT.cheap);

test('independent native reader consumes resolved witness with no recipe execution', async () => {
    const { content } = fixture();
    const construction = instance(content, [frame({ translation: [0, 1.5, 2], rotation: I }), frame({ translation: [2, 0, 0], rotation: [0, H, 0, H] })]);
    // A plain serialized glTF + embedded buffers goes through the existing independent Shallot reader.
    const json = await Bun.file(new URL('../../../construction/witness/resolved-ties.gltf', import.meta.url)).json() as GltfJson;
    expect(json).toEqual(JSON.parse(JSON.stringify(resolvedNative(construction))));
    expect('groups' in json).toBe(false);
    const buffers = json.buffers!.map(b => Uint8Array.from(atob(b.uri!.split(',')[1]), c => c.charCodeAt(0)).buffer);
    const scene = parseGltf(json, buffers);
    expect(scene.instances).toHaveLength(4); expect(scene.meshes).toHaveLength(1);
    const landmarks = scene.instances.map(i => {
        const v = scene.meshes[i.mesh].vertices, m = i.matrix;
        return [0, 1, 2].map(row => m[row] * v[0] + m[4 + row] * v[1] + m[8 + row] * v[2] + m[12 + row]);
    });
    // Native geometry is float32; the rigid transform expectations remain analytic.
    const expected = [[.1, 1.7, 2.4], [1.1, 1.7, 2.4], [2.4, .2, -.1], [2.4, .2, -1.1]];
    landmarks.forEach((p, i) => near(p, expected[i], 1e-7));
}, TIMEOUT.cheap);

test('parameterized Ties carries local adjustments through bank/inversion into independently read native landmarks', () => {
    const { content } = fixture();
    const expected = [[.6, 1.6, 2.2], [-.1, 2.1, 2.2], [-.6, 1.4, 2.2]];
    [I, [0, 0, H, H], [0, 0, 1, 0]].forEach((rotation, k) => {
        const result = run(content, {
            path: { ...basePath, rotations: [rotation, rotation] },
            localFrame: { translation: [.2, -.1, .3], rotation: [0, H, 0, H] },
            spacing: 2,
        });
        expect(result.placements).toHaveLength(3);
        near(point(result.placements[1].frame, [.1, .2, .4]), expected[k]);
        const json = JSON.parse(JSON.stringify(resolvedNative(result))) as GltfJson;
        const buffers = json.buffers!.map(b => Uint8Array.from(atob(b.uri!.split(',')[1]), c => c.charCodeAt(0)).buffer);
        const scene = parseGltf(json, buffers), placed = scene.instances[2], m = placed.matrix, v = scene.meshes[placed.mesh].vertices;
        near([0, 1, 2].map(row => m[row] * v[0] + m[4 + row] * v[1] + m[8 + row] * v[2] + m[12 + row]), expected[k], 1e-7);
    });
}, TIMEOUT.cheap);

test('Ties refuses fabricated content even with no stations', () => {
    const { snapshot } = fixture();
    expect(() => run({ snapshot: { ...snapshot } }, { allowed: [] })).toThrow('checked immutable snapshot');
}, TIMEOUT.cheap);

test('native boundary refuses live/fabricated resources and invalid selection/subsets atomically', () => {
    expect(() => contentValue({ snapshot: { document: {}, buffers: [] } })).toThrow('checked');
    for (const mutate of [
        (s: any) => s.scene = 8,
        (s: any) => s.scenes[1].nodes = [],
        (s: any) => s.nodes[1].children = [1],
        (s: any) => s.nodes[2].weights = [],
        (s: any) => s.images = [{}],
        (s: any) => s.materials[0].alphaMode = 'BLEND',
        (s: any) => s.nodes[0].extensions = { unknown: {} },
        (s: any) => s.accessors[0].count = 1000,
    ]) { const { source, bytes } = fixture(); mutate(source); expect(() => nativeSnapshot(source, [bytes.buffer])).toThrow('native resource'); }
}, TIMEOUT.cheap);

const malformedLists = [Array(1), Object.assign(Object.create([0]), { length: 1 })];

const placementCalls: Record<string, (list: any, content: Content) => unknown> = {
    sample: list => sampleFrames(basePath, list),
    join: list => join(list),
    'instance with forged content': list => instance({ snapshot: {} } as Content, list),
    instance: (list, content) => instance(content, list),
    construction: list => constructionValue({ placements: list }),
    export: list => resolvedNative({ placements: list }),
};
for (const [name, call] of Object.entries(placementCalls)) {
    test(`${name} refuses malformed direct placement lists atomically`, () => {
        const { content } = fixture();
        for (const list of malformedLists) {
            let published: unknown;
            expect(() => { published = call(list, content); }).toThrow();
            expect(published).toBeUndefined();
        }
    });
}

test('direct placement lists accept valid empty inputs', () => {
    const { content } = fixture();
    expect(sampleFrames(basePath, [])).toEqual([]);
    expect(instance(content, [])).toEqual({ placements: [] });
    expect(join([])).toEqual({ placements: [] });
    expect(constructionValue({ placements: [] })).toEqual({ placements: [] });
    expect(() => instance({ snapshot: {} } as Content, [])).toThrow();
});

test('direct placement lists preserve valid dense inputs', () => {
    const { content } = fixture();
    const frames = sampleFrames(basePath, [0, 6]);
    expect(frames.map(f => f.translation)).toEqual(basePath.positions);
    const result = { placements: frames.map(frame => ({ frame, content })) };
    expect(instance(content, frames)).toEqual(result);
    expect(constructionValue(result)).toEqual(result);
    expect(join([result, result]).placements).toEqual([...result.placements, ...result.placements]);
});

test('offset, path and span lists require own slots in arrays', () => {
    const pose = frame({ translation: [0, 0, 0], rotation: I });
    const holeWithInherited = [0, 6];
    delete holeWithInherited[1];
    Object.setPrototypeOf(holeWithInherited, [0, 6]);
    expect(() => path({ ...basePath, distances: holeWithInherited })).toThrow();
    for (const key of ['distances', 'positions', 'rotations']) {
        expect(() => path({ ...basePath, [key]: Array(2) })).toThrow();
        expect(() => path({ ...basePath, [key]: { ...basePath[key as keyof typeof basePath], length: 2 } })).toThrow();
    }
    for (const list of malformedLists) {
        expect(() => offsetFrames(list, pose)).toThrow();
        expect(() => repeatDistances(6, 1, 0, list, [])).toThrow();
        expect(() => repeatDistances(6, 1, 0, [], list)).toThrow();
    }
});

test('compose rejects non-unit operands even when their product is a unit quaternion', () => {
    const a = { translation: [0, 0, 0], rotation: [0, 0, 0, 2] };
    const b = { translation: [0, 0, 0], rotation: [0, 0, 0, .5] };
    expect(() => compose(a, b)).toThrow('unit quaternion required');
    expect(() => compose(b, a)).toThrow('unit quaternion required');
    // One operand alone is outside tolerance; their product is still within it.
    const within = { ...a, rotation: [0, 0, 0, 1 - .75e-12] };
    const outside = { ...b, rotation: [0, 0, 0, 1 + 1.5e-12] };
    expect(() => compose(within, outside)).toThrow('unit quaternion required');
    expect(() => compose(outside, within)).toThrow('unit quaternion required');
});

test('compose applies the second pose in the first pose’s coordinates', () => {
    const a = { translation: [4, 5, 6], rotation: [0, 0, H, H] };
    const b = { translation: [2, 3, 4], rotation: [0, 0, -H, H] };
    const result = compose(a, b);
    near(result.translation, [1, 7, 10]);
    near(result.rotation, I);
});
