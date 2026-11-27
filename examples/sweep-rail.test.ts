import { expect, test } from 'bun:test';
import { snapshotBytes } from '../construction/native';
import { railAppearance as metal } from '../demo/src/rail-material';
import { frames, rail } from './sweep-rail';

test('the straight example native walls and caps use the two expected rings', () => {
    expect(frames.map(f => f.translation)).toEqual([[-.5, .065, .75], [-.5, .065, -1.2]]);
    expect(rail.placements).toHaveLength(1);
    const [placement] = rail.placements;
    expect(placement.frame).toEqual({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
    const { snapshot } = placement.content;
    const { meshes, accessors, bufferViews, materials } = snapshot.document;
    expect(materials).toEqual([metal.snapshot.document.materials[metal.material]]);
    const bytes = snapshotBytes(snapshot, 0);
    for (const [primitive, count] of [[meshes[0].primitives[0], 96], [meshes[0].primitives[1], 84]] as const) {
        expect(primitive.material).toBe(0);
        const accessor = accessors[primitive.attributes.POSITION];
        const view = bufferViews[accessor.bufferView];
        expect(accessor.count).toBe(count);
        const data = new DataView(bytes.buffer, bytes.byteOffset + (view.byteOffset ?? 0), view.byteLength);
        const seen = new Set<number>();
        for (let i = 0; i < count; i++) {
            const [x, y, z] = [0, 4, 8].map(offset => data.getFloat32(i * 12 + offset, true));
            // Independent analytic model of the asset: 16 points at radius 0.06 m.
            const ring = [.75, Math.fround(-1.2)].indexOf(z);
            expect(ring).not.toBe(-1);
            const corner = Array.from({ length: 16 }, (_, j) => j).find(j =>
                Math.abs(x - (-.5 + .06 * Math.cos(j * Math.PI / 8))) < 1e-7 &&
                Math.abs(y - (.065 + .06 * Math.sin(j * Math.PI / 8))) < 1e-7);
            expect(corner).toBeDefined();
            seen.add(ring * 16 + corner!);
        }
        expect(seen.size).toBe(32);
    }
});
