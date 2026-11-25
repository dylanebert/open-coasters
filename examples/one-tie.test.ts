import { expect, test } from 'bun:test';
import { contentValue, nativeSnapshot, resolvedNative } from '../construction/native';
import { oneTie } from './one-tie';

// Eight metres along −Z, with a 120° bank about the travel axis.
const path = {
    distances: [0, 8],
    positions: [[0, 0, 0], [0, 0, -8]],
    rotations: [[0, 0, 0, 1], [0, 0, -Math.sqrt(3) / 2, 0.5]],
};
const tie = contentValue({ snapshot: nativeSnapshot({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
}, [new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer)]) });

test('places one resolved tie at each requested distance without changing its snapshot', () => {
    const original = structuredClone(tie.snapshot);
    const diagonal = Math.SQRT1_2;
    for (const [distance, tip] of [[3, [diagonal, -diagonal, -3]], [6, [0, -1, -6]]] as const) {
        const result = oneTie({ path, tie, distance });
        expect(result.placements).toHaveLength(1);
        expect(result.placements[0].content.snapshot).toBe(tie.snapshot);

        const native = resolvedNative(result);
        const [root] = native.scenes[native.scene].nodes;
        const { translation, rotation, children } = native.nodes[root];
        expect(translation).toEqual([0, 0, -distance]);
        expect(native.nodes[children[0]].translation).toEqual([1, 0, 0]);
        // The mesh origin sits one metre to the right of the tie origin.
        // Apply the first column of the realized rotation matrix to that offset.
        const [x, y, z, w] = rotation;
        const tipOffset = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
        tip.forEach((coordinate, i) => expect(translation[i] + tipOffset[i]).toBeCloseTo(coordinate, 12));
        expect(x).toBe(0);
        expect(y).toBe(0);
    }
    expect(tie.snapshot).toEqual(original);
});

test('refuses a distance outside the path', () => {
    expect(() => oneTie({ path, tie, distance: 9 })).toThrow('distance outside path');
});
