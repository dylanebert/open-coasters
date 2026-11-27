import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { render } from './page';
import { recipeControls } from './recipe-controls';
import { join, offsetFrames, rotate, sampleFrames } from '../../construction/geometry';
import { resolvedNative, snapshotBytes, type Construction } from '../../construction/native';
import { repeat } from '../../construction/repeat';
import { sweep } from '../../construction/sweep';
import { tieAt } from '../../visualizer/model';
import { project, view } from '../../visualizer/view';
import { defaultSpacing, defaultTrackEnd, firstRail, joinedTrack, loadTrackInputs, repeatedTies } from './track-recipes';
import { defaultGapEnd, gapStart, guideTies, tieGap } from './guide-recipe';

test('private controls bind the authored literals to the live recipe inputs', () => {
  const { html, llms } = render(resolve(import.meta.dir, '../..'), { draft: true });
  const enhanced = recipeControls(html);
  expect(html).not.toContain('recipe-preview.js');
  expect(llms).not.toContain('recipe-preview.js');
  expect([...enhanced.matchAll(/data-recipe="([^"]+)"/g)].map(m => m[1])).toEqual(['curved-ties', 'swept-rail', 'joined-track', 'tie-gap']);
  expect([...enhanced.matchAll(/type="range" min="([^"]+)" max="([^"]+)" step="([^"]+)" value="([^"]+)" aria-label="[^"]+" data-input="([^"]+)" hidden/g)].map(m => m.slice(1))).toEqual([
    ['0.4', '0.8', '0.1', '0.6', 'spacing'], ['0.10', '5.00', '0.10', '5.00', 'trackEnd'],
    ['0.4', '0.8', '0.1', '0.6', 'spacing'], ['0.10', '5.00', '0.10', '5.00', 'trackEnd'],
    ['1.2', '3.6', '0.1', '2.2', 'gapEnd'],
  ]);
  for (const [literal, changed, panel] of [
    ['const spacing = 0.6;', 'const spacing = 0.7;', 'repeated-ties'],
    ['const trackEnd = 5.00;', 'const trackEnd = 5;', 'swept-rail'],
    ['const spacing = 0.6;\nconst trackEnd = 5.00;', 'const spacing = 0.6;\nconst trackEnd = 4.90;', 'joined-track'],
    ['const gapEnd = 2.2;', 'const gapEnd = 2.3;', 'tie-gap'],
  ]) expect(() => recipeControls(html.replace(literal!, changed!))).toThrow(`Unexpected ${panel} default`);

});

function nativeRoots(track: Construction) {
  const doc = resolvedNative(track);
  return doc.scenes[doc.scene].nodes.map((i: number) => doc.nodes[i]);
}

// Independent circle and bank model, in the guide's forward-facing local frame.
function expectedFrame(s: number) {
  const h = s / 6 - .18;
  const h2 = 2 / 6 - .18;
  const b = s <= 3.4 ? -.025 - .16 * (1 - Math.cos(Math.PI * s / 3.4)) : -.345;
  return {
    center: [6 * (Math.cos(h2) - Math.cos(h)), .06, .15 + 6 * (Math.sin(h) - Math.sin(h2))],
    x: [-Math.cos(h) * Math.cos(b), -Math.sin(b), Math.sin(h) * Math.cos(b)],
    travel: [Math.sin(h), 0, Math.cos(h)],
  };
}
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));

test('the first repeated tie projects to the same length as a single tie at that station', async () => {
  const inputs = await loadTrackInputs();
  const single = tieAt(inputs.tie, .15).construction;
  const repeated = repeatedTies(inputs);
  function projectedLength(track: Construction) {
    const { translation, rotation } = nativeRoots(track)[0];
    const ends = ([-.60, .60]).map(x => project(rotate(rotation, [x, 0, 0])
      .map((n, i) => n + translation[i]), view));
    return distance(ends[0]!, ends[1]!);
  }
  // 1.2 m tie axis at the first station, in the 1080 px capture.
  expect(projectedLength(single)).toBeCloseTo(190.03, 1);
  expect(projectedLength(repeated)).toBeCloseTo(projectedLength(single), 6);
  // At 540 CSS px, the 5 m chord is longer than the old 269.07 px chord
  // while the tie at 2 m is narrower than the old 136.86 px projection.
  expect(projectedLength(tieAt(inputs.tie, 2).construction) / 2).toBeCloseTo(99.79, 1);
  const [start, end] = [0, 5].map(s => project(expectedFrame(s).center as [number, number, number], view));
  expect(distance(start!, end!) / 2).toBeCloseTo(270.66, 1);
});

function checkTies(track: Construction, railCount: number, stations: number[]) {
  const ties = nativeRoots(track).slice(railCount);
  expect(ties).toHaveLength(stations.length);
  for (const [i, s] of stations.entries()) {
    const { center, x } = expectedFrame(s);
    // Off-grid poses interpolate the path's 0.1 m samples.
    expect(distance(ties[i].translation, center), `tie at ${s} m`).toBeLessThan(.0003);
    expect(distance(rotate(ties[i].rotation, [1, 0, 0]), x), `bank at ${s} m`).toBeLessThan(.0003);
  }
}

function checkEnds(track: Construction, sides: number[], end: number) {
  for (const [i, side] of sides.entries()) {
    const { snapshot } = track.placements[i]!.content;
    const doc = snapshot.document;
    const caps = doc.accessors[doc.meshes[0].primitives[1].attributes.POSITION];
    const view = doc.bufferViews[caps.bufferView];
    const bytes = snapshotBytes(snapshot, view.buffer);
    const data = new DataView(bytes.buffer, bytes.byteOffset + view.byteOffset, view.byteLength);
    const positions = Array.from({ length: caps.count }, (_, j) => [0, 4, 8].map(k => data.getFloat32(j * 12 + k, true)));
    for (const station of [0, end]) {
      const { center, x, travel } = expectedFrame(station);
      const origin = center.map((v, j) => v + side * .60 * x[j]!);
      const ring = positions.filter(v => Math.abs(distance(v, origin) - .06) < .00015 &&
        Math.abs(v.reduce((dot, p, j) => dot + (p - origin[j]!) * travel[j]!, 0)) < .00001);
      expect(ring.length, `rail ${side} cap at ${station} m`).toBe(caps.count / 2);
    }
  }
}

test('the displayed defaults agree with captured recipes, native rail ends and banked tie poses', async () => {
  const guide = await Bun.file(new URL('../../construction-contract.md', import.meta.url)).text();
  const inputs = await loadTrackInputs();
  const bindings = { ...inputs, repeat, sweep, sampleFrames, offsetFrames, join };
  const snippets = [...guide.matchAll(/```ts\n([\s\S]*?)```/g)].slice(1).map(m => m[1]!);
  const [repeatCode, sweepCode, joinedCode, gapCode] = snippets;
  expect(snippets).toHaveLength(4);
  expect(repeatCode).toStartWith(`const spacing = ${defaultSpacing.toFixed(1)};\n`);
  expect(sweepCode).toStartWith(`const trackEnd = ${defaultTrackEnd.toFixed(2)};\n`);
  expect(joinedCode).toStartWith(`const spacing = ${defaultSpacing.toFixed(1)};\nconst trackEnd = ${defaultTrackEnd.toFixed(2)};\n`);
  const run = (code: string, result: string): Construction =>
    new Function(...Object.keys(bindings), `${code}\nreturn ${result};`)(...Object.values(bindings));
  const gapTrack = joinedCode!.replace(/const ties = repeat\([\s\S]*?\n\}\);\n/, gapCode!);
  const [ties, rail, track, gap] = [run(repeatCode!, 'ties'), run(sweepCode!, 'rail'), run(joinedCode!, 'track'), run(gapTrack, 'track')];
  for (const [name, shown, captured] of [
    ['repeat', ties, repeatedTies(inputs)], ['single rail', rail, firstRail(inputs).rail],
    ['joined', track, joinedTrack(inputs)], ['gap', gap, joinedTrack(inputs, undefined, undefined, tieGap())],
  ] as const) expect(resolvedNative(shown), `${name} snippet and capture recipe disagree`).toEqual(resolvedNative(captured));
  expect(gapCode).toStartWith(`const gapEnd = ${defaultGapEnd.toFixed(1)};\n`);
  expect(gapCode).toContain(`excluded: [{ start: ${gapStart}, end: gapEnd }]`);

  const stations = [.15, .75, 1.35, 1.95, 2.55, 3.15, 3.75, 4.35];
  for (const [end, kept] of [[1.2, [0, 1, 2, 3, 4, 5, 6, 7]], [3.6, [0, 1, 6, 7]]] as const) {
    const adjusted = run(gapTrack.replace(`const gapEnd = ${defaultGapEnd};`, `const gapEnd = ${end};`), 'track');
    checkTies(adjusted, 2, kept.map(i => stations[i]!));
    const rails = track.placements.slice(0, 2);
    const survivorTies = guideTies(inputs.tie, defaultSpacing, defaultTrackEnd, tieGap(end));
    const expected = resolvedNative({ placements: [...rails, ...kept.map(i => track.placements[i + 2]!)] });
    expect(resolvedNative(adjusted)).toEqual(expected);
    expect(resolvedNative({ placements: [...rails, ...survivorTies.placements] })).toEqual(expected);
  }

  // 4.95 m is on the path but beyond the joined track's 4.94 m cutoff.
  checkTies(ties, 0, [.15, .75, 1.35, 1.95, 2.55, 3.15, 3.75, 4.35, 4.95]);
  checkTies(track, 2, stations);
  checkTies(gap, 2, [.15, .75, 2.55, 3.15, 3.75, 4.35]);
  checkTies(repeatedTies(inputs, .4), 0, [.15, .55, .95, 1.35, 1.75, 2.15, 2.55, 2.95, 3.35, 3.75, 4.15, 4.55, 4.95]);
  checkTies(repeatedTies(inputs, .8), 0, [.15, .95, 1.75, 2.55, 3.35, 4.15, 4.95]);
  for (const end of [.10, 1.70]) checkEnds(firstRail(inputs, end).rail, [-1], end);
  checkTies(joinedTrack(inputs, .4, 1.7), 2, [.15, .55, .95, 1.35]);
  checkTies(joinedTrack(inputs, .6, 1.7), 2, [.15, .75, 1.35]);
  checkTies(joinedTrack(inputs, .6, .1), 2, []);
  // 0.15 m is before the rail end, but outside the 0.06 m pullback.
  checkTies(joinedTrack(inputs, .6, .2), 2, []);
  checkTies(joinedTrack(inputs, .6, .3), 2, [.15]);
  checkTies(joinedTrack(inputs, .4), 2, [.15, .55, .95, 1.35, 1.75, 2.15, 2.55, 2.95, 3.35, 3.75, 4.15, 4.55]);
  checkEnds(joinedTrack(inputs, .4, 1.7), [-1, 1], 1.7);
  checkEnds(joinedTrack(inputs, .6, .1), [-1, 1], .1);
  checkEnds(rail, [-1], 5);
  checkEnds(track, [-1, 1], 5);
  expect(resolvedNative({ placements: gap.placements.slice(0, 2) }))
    .toEqual(resolvedNative({ placements: track.placements.slice(0, 2) }));
  expect(nativeRoots(gap).slice(2).map(({ translation, rotation }) => ({ translation, rotation })))
    .toEqual([2, 3, 6, 7, 8, 9].map(i => {
      const { translation, rotation } = nativeRoots(track)[i];
      return { translation, rotation };
    }));
});
