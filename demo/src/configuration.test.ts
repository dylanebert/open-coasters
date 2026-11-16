import { expect, test } from 'bun:test';
import { history, preview, commit, undo, redo, initialConfiguration, effective, linearColor } from './configuration';
import { defaults, generate } from './track';

test('earned entry fixes native Bar defaults without changing procedural fixture defaults', () => {
  expect(defaults.fixed).toBe(false);
  expect(initialConfiguration.selected).toBe('ties');
  expect(effective(initialConfiguration).assembly).toMatchObject({tie:'assembly-tie-bar', spacing:.65, separation:1.2});
});

test('snapshot gestures, no-ops, undo/redo and branching', () => {
  const a = structuredClone(initialConfiguration);
  const b = { ...a, values: { ...a.values, ties: {...a.values.ties, spacing: 1.4} } };
  const c = { ...b, selected: 'track' as const };
  let h = history(a);
  h = preview(preview(h, b), c);
  expect(h.past).toHaveLength(0);
  h = commit(h);
  expect(h.past).toEqual([a]);
  expect(effective(h.present).parameters.separation).toBe(1.2);
  expect(h.present.values.ties.spacing).toBe(1.4);
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
    const mesh = generate({ ...defaults, configuration });
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

 test('flat example selection and URL values share a reversible view mapping',async()=>{
 const {exampleOptions,selectedExample,selectExample,initialConfiguration}=await import('./configuration');
 for(const [key] of exampleOptions) {
  const selected=selectExample(initialConfiguration,key);
  expect(selectedExample(selected)).toBe(key);
  expect(selectedExample(selectExample(selected,'track'))).toBe('track');
 }
 expect(selectedExample(selectExample(selectExample(initialConfiguration,'assembly'),'witness'))).toBe('witness');
 expect(selectExample(initialConfiguration,'unknown')).toBe(initialConfiguration);
 expect(selectedExample({...initialConfiguration,selected:'witness'})).toBe('witness');
 expect(selectedExample({...initialConfiguration,selected:'ties'})).toBe('ties');
 });
