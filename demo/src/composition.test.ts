import { expect, test } from 'bun:test';
import { composeMat4 } from '@dylanebert/shallot/utils';
import { authoredPlacements } from './composition';
import { compositionDefaults, history, preview, commit, undo, redo, initialConfiguration } from './configuration';

test('rigid matrices use world repetition and local Z then X then Y, without normalization', () => {
  // 90 degrees on all axes: (x,y,z) -> (x,-z,y), independently expanded.
  const values = { ...compositionDefaults, x: 2, y: -3, z: 4, yaw: 90, pitch: 90, roll: 90, count: 3, spacing: 2.5, offset: -1 };
  for (const repeated of [false, true]) {
    const placements = authoredPlacements(repeated, values);
    expect(placements.length).toBe(repeated ? 3 : 1);
    placements.forEach((p, i) => {
      const expected = [1,0,0,0, 0,0,1,0, 0,-1,0,0, ...(repeated ? [-1+i*2.5,0,0] : [2,-3,4]),1];
      const matrix = composeMat4(...p.translation, ...p.rotation, 1,1,1);
      matrix.forEach((v,k) => expect(v).toBeCloseTo(expected[k], 5));
    });
  }
  expect(() => authoredPlacements(true, { ...values, count: 1.5 })).toThrow();
  expect(() => authoredPlacements(true, { ...values, spacing: 0 })).toThrow();
});

test('composition controls and example selection retain complete history snapshots', () => {
  let h = history(structuredClone(initialConfiguration));
  for (const example of ['placed', 'repeated'] as const) {
    const before = h.present;
    h = commit(preview(h, { ...h.present, example, composition: { ...compositionDefaults, yaw: 90, x: 3, count: 7, spacing: 1.5, offset: -4 } }));
    const after = h.present;
    expect(undo(h).present).toEqual(before);
    expect(redo(undo(h)).present).toEqual(after);
  }
});
