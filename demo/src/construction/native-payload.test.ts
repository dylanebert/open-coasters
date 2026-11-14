import { expect, test } from 'bun:test';
import { nativeSnapshot, contentValue } from '../../../construction/native';
import { ConstructionError } from '../../../construction/kernel';
const witness = await Bun.file(new URL('../../../construction/witness/resolved-ties.gltf', import.meta.url)).json();
function fixture(componentType = 5123) {
    const doc = structuredClone(witness), bytes = new Uint8Array(100), view = new DataView(bytes.buffer);
    // POSITION: bufferView offset 4, accessor offset 4, interleaved stride 16.
    // Padding deliberately contains nonfinite float words and must not be interpreted as POSITION.
    for (let at = 0; at < bytes.length; at += 4) view.setFloat32(at, NaN, true);
    [[.1, .2, .4], [.4, .2, .4], [.1, .5, .4]].forEach((p, i) => p.forEach((x, c) => view.setFloat32(8 + i * 16 + c * 4, x, true)));
    const size = componentType === 5121 ? 1 : componentType === 5123 ? 2 : 4;
    const indices = 64 + size;
    for (let i = 0; i < 3; i++) {
        if (size === 1) view.setUint8(indices + i, i);
        else if (size === 2) view.setUint16(indices + i * 2, i, true);
        else view.setUint32(indices + i * 4, i, true);
    }
    doc.buffers = [{ byteLength: bytes.length, uri: 'source.bin' }];
    doc.bufferViews = [{ buffer: 0, byteOffset: 4, byteLength: 52, byteStride: 16 }, { buffer: 0, byteOffset: 64, byteLength: size * 4 }];
    doc.accessors[0].byteOffset = 4;
    doc.accessors.push({ bufferView: 1, byteOffset: size, componentType, count: 3, type: 'SCALAR' });
    doc.meshes[0].primitives[0].indices = 1;
    return { doc, bytes, view, indices, size };
}
function refuses(f: ReturnType<typeof fixture>, cause: string) {
    let published: unknown, caught: any;
    try { published = nativeSnapshot(f.doc, [f.bytes]); } catch (e) { caught = e; }
    expect(published).toBeUndefined(); expect(caught).toBeInstanceOf(ConstructionError);
    expect(caught.category).toBe('resource'); expect(caught.message).toContain(cause);
}
test('native POSITION reads owned bytes with both offsets and interleaved stride, ignoring padding', () => {
    const f = fixture(), before = f.bytes.slice(); f.doc.accessors[0].normalized = false;
    const snapshot = nativeSnapshot(f.doc, [f.bytes]);
    expect(contentValue({ snapshot }).snapshot).toBe(snapshot); expect(snapshot.buffers[0]).toEqual(Array.from(before));
    expect(f.bytes).toEqual(before); expect(f.doc.buffers[0].uri).toBe('source.bin');
    f.bytes.fill(0); expect(snapshot.buffers[0]).toEqual(Array.from(before));
    // A subarray's backing-buffer prefix must not change resolved byte offsets.
    const backing = new Uint8Array(before.length + 7); backing.set(before, 7);
    expect(nativeSnapshot(f.doc, [backing.subarray(7)]).buffers[0]).toEqual(Array.from(before));
}, 1000);
test('native POSITION refuses each nonfinite component, normalization and unsupported alignment/layout', () => {
    for (const value of [NaN, Infinity, -Infinity]) for (const at of [8, 28, 48]) {
        const f = fixture(); f.view.setFloat32(at, value, true); refuses(f, 'nonfinite POSITION');
    }
    for (const normalized of [true, 1, null]) { const f = fixture(); f.doc.accessors[0].normalized = normalized; refuses(f, 'non-normalized'); }
    for (const mutate of [
        (f: ReturnType<typeof fixture>) => f.doc.accessors[0].byteOffset = 2,
        (f: ReturnType<typeof fixture>) => f.doc.bufferViews[0].byteOffset = 2,
        (f: ReturnType<typeof fixture>) => f.doc.bufferViews[0].byteStride = 13,
        (f: ReturnType<typeof fixture>) => f.doc.bufferViews[0].byteStride = 256,
        (f: ReturnType<typeof fixture>) => f.doc.accessors[0].byteOffset = 12,
    ]) { const f = fixture(); mutate(f); refuses(f, ''); }
}, 1000);
test('native indices accept only non-normalized unsigned scalar encodings and check every referenced vertex', () => {
    for (const componentType of [5121, 5123, 5125]) {
        const f = fixture(componentType); f.doc.accessors[1].normalized = false;
        expect(nativeSnapshot(f.doc, [f.bytes])).toBeDefined();
        // Last element is out of range, so checking only the first index cannot pass.
        const at = f.indices + 2 * f.size;
        if (f.size === 1) f.view.setUint8(at, 3);
        else if (f.size === 2) f.view.setUint16(at, 3, true);
        else f.view.setUint32(at, 3, true);
        refuses(f, 'index payload outside POSITION');
        // High-bit unsigned values must not be misread as negative signed indices.
        const high = fixture(componentType), highValue = 2 ** (8 * high.size - 1);
        if (high.size === 1) high.view.setUint8(high.indices, highValue);
        else if (high.size === 2) high.view.setUint16(high.indices, highValue, true);
        else high.view.setUint32(high.indices, highValue, true);
        refuses(high, 'index payload outside POSITION');
    }
    for (const componentType of [5120, 5122, 5126]) { const f = fixture(5125); f.doc.accessors[1].componentType = componentType; refuses(f, 'unsigned SCALAR'); }
    for (const normalized of [true, 1, null]) { const f = fixture(); f.doc.accessors[1].normalized = normalized; refuses(f, 'unsigned SCALAR'); }
    const vector = fixture(); vector.doc.accessors[1].type = 'VEC2'; vector.doc.bufferViews[1].byteLength = 16; refuses(vector, 'unsigned SCALAR');
    const stride = fixture(); stride.doc.bufferViews[1].byteStride = 2; refuses(stride, 'index byteStride');
    for (const mutate of [
        (f: ReturnType<typeof fixture>) => f.doc.accessors[1].byteOffset = 1,
        (f: ReturnType<typeof fixture>) => f.doc.bufferViews[1].byteOffset = 65,
        (f: ReturnType<typeof fixture>) => f.doc.accessors[1].count = 4,
    ]) { const f = fixture(); mutate(f); refuses(f, ''); }
}, 1000);
test('original tight POSITION bytes and FLOAT-index review counterexamples are refused before branding', () => {
    const doc = structuredClone(witness), bytes = Uint8Array.from(atob(doc.buffers[0].uri.split(',')[1]), c => c.charCodeAt(0));
    new DataView(bytes.buffer).setFloat32(0, NaN, true);
    expect(() => nativeSnapshot(doc, [bytes])).toThrow('nonfinite POSITION');
    new DataView(bytes.buffer).setFloat32(0, .1, true);
    doc.accessors.push({ bufferView: 0, componentType: 5126, count: 3, type: 'SCALAR' }); doc.meshes[0].primitives[0].indices = 1;
    expect(() => nativeSnapshot(doc, [bytes])).toThrow('unsigned SCALAR');
}, 1000);
