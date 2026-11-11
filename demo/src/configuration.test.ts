import { expect, test } from 'bun:test';
import { history, preview, commit, undo, redo, initialConfiguration, effective, linearColor } from './configuration';
import { generate } from './track';

test('snapshot gestures, no-ops, undo/redo and branching', () => {
  const a = structuredClone(initialConfiguration);
  const b = { ...a, parameters: { ...a.parameters, separation: 1.4 } };
  const c = { ...b, parameters: { ...b.parameters, fixed: true } };
  let h = history(a);
  h = preview(preview(h, b), c);
  expect(h.past).toHaveLength(0);
  h = commit(h);
  expect(h.past).toEqual([a]);
  expect(effective(h.present).parameters.separation).toBe(1);
  expect(h.present.parameters.separation).toBe(1.4);
  h = undo(h);
  expect(h.present).toEqual(a);
  h = redo(h);
  expect(h.present).toEqual(c);
  h = commit(preview(h, structuredClone(c)));
  expect(h.past).toHaveLength(1);
  h = undo(h);
  h = commit(preview(preview(h, b), a));
  expect(h.future).toEqual([c]); // returning to origin is not a branch
  h = commit(preview(h, b));
  expect(h.future).toHaveLength(0);
  expect(redo(h)).toEqual(h);
  expect(undo(preview(h, c)).present).toEqual(b); // undo a still-live session
});

test('sRGB color conversion uses independent standard values', () => {
  expect(linearColor('#000000')).toEqual([0, 0, 0, 1]);
  expect(linearColor('#ffffff')).toEqual([1, 1, 1, 1]);
  const value = linearColor('#0a80ff');
  expect(value[0]).toBeCloseTo(0.003035269835488375, 12);
  expect(value[1]).toBeCloseTo(0.21586050011389926, 12);
  expect(value[2]).toBe(1);
});

test('part views reconstruct original typed arrays without changing indices or vertex bytes', () => {
  for (const configuration of ['straight', 'curve', 'loop'] as const) {
    const mesh = generate({ ...initialConfiguration.parameters, configuration });
    const vertices: number[] = [], indices: number[] = [];
    for (const part of mesh.parts) {
      vertices.push(...mesh.vertices.subarray(part.vertex * 8, part.endVertex * 8));
      const local = mesh.indices.slice(part.index, part.endIndex).map(i => i - part.vertex);
      expect([...local].every(i => i < part.endVertex - part.vertex)).toBe(true);
      indices.push(...local.map(i => i + part.vertex));
    }
    expect(new Float32Array(vertices)).toEqual(mesh.vertices);
    expect(new Uint32Array(indices)).toEqual(mesh.indices);
  }
});
