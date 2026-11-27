import { expect, test } from 'bun:test';
import { nativeSnapshot } from '../construction/native';
import { rotate } from '../construction/geometry';
import { tieAt, path } from './model';
import { frameGlyphs, project, sceneGeometry, view } from './view';

function near(actual: readonly number[], expected: readonly number[], precision = 5) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, precision));
}

const asset = new URL('../demo/public/assets/blitz-tie.gltf', import.meta.url);

test('the distance input sets the placed tie’s position and signed axes', async () => {
  const source = await Bun.file(asset).json();
  const buffers = await Promise.all(source.buffers.map(({ uri }: { uri: string }) => Bun.file(new URL(uri, asset)).arrayBuffer()));
  const content = { snapshot: nativeSnapshot(source, buffers) };
  const initial = tieAt(content);
  expect(initial.distance).toBe(2);
  const halfway = tieAt(content, 1);
  for (const [result, position, travel, right, up] of [
    [halfway, [-.069862, .06, -.846397], [-.013333, 0, .999911], [-.995991, .088463, -.013281], [.088455, .996079, .001179]],
    [initial, [0, .06, .15], [.152733, 0, .988267], [-.962516, .226795, .148753], [.224135, .973942, -.034639]],
    [tieAt(content, 5), [1.165232, .06, 2.880621], [.607837, 0, .794062], [-.747272, .338197, .572020], [.268549, .941075, -.205568]],
  ] as const) {
    const [{ frame }] = result.construction.placements;
    near(frame.translation, position);
    near(rotate(frame.rotation, [0, 0, -1]), travel);
    near(rotate(frame.rotation, [1, 0, 0]), right);
    near(rotate(frame.rotation, [0, 1, 0]), up);
  }
  expect(() => tieAt(content, 5.1)).toThrow(/outside/);
});

test('the banked path retains its 10 cm arc intervals and tangent rotations', () => {
  expect(path.distances).toEqual(Array.from({ length: 51 }, (_, i) => i / 10));
  expect(path.positions).toHaveLength(51);
  expect(path.rotations).toHaveLength(51);
  path.positions.forEach((center, i) => {
    const h = i / 60 - .18;
    near(center, [6 * (Math.cos(2 / 6 - .18) - Math.cos(h)), .06,
      .15 + 6 * (Math.sin(h) - Math.sin(2 / 6 - .18))], 12);
    const bank = i <= 34 ? -.025 - .16 * (1 - Math.cos(Math.PI * (i / 10) / 3.4)) : -.345;
    expect(rotate(path.rotations[i]!, [1, 0, 0])[1]).toBeCloseTo(-Math.sin(bank), 12);
    if (!i) return;
    expect(path.distances[i]! - path.distances[i - 1]!).toBeCloseTo(.1, 12);
    expect(Math.hypot(...center.map((v, j) => v - path.positions[i - 1]![j]!))).toBeCloseTo(.1, 5);
    if (i === 50) return;
    const tangent = path.positions[i + 1]!.map((v, j) => v - path.positions[i - 1]![j]!);
    near(rotate(path.rotations[i]!, [0, 0, -1]), tangent.map(v => v / Math.hypot(...tangent)));
  });
});

test('20 cm glyphs project positive XY from one anchor on the banked path', () => {
  expect(frameGlyphs).toHaveLength(26);
  frameGlyphs.forEach(({ distance }, i) => expect(distance).toBeCloseTo(.2 * i, 12));
  const glyph = frameGlyphs[10]!;
  const center = [0, .06, .15] as const;
  const x = [-.962516, .226795, .148753] as const;
  const y = [.224135, .973942, -.034639] as const;
  const anchor = project(center, view);
  near(glyph.origin, anchor);
  expect(glyph.endpoints).toHaveLength(2);
  const rays = sceneGeometry({ translation: center, rotation: path.rotations[20]! }, 0).glyphs.flat();
  [x, y].forEach((axis, i) => {
    const endpoint = glyph.endpoints[i]!;
    near(endpoint, project([center[0] + .073 * axis[0], center[1] + .073 * axis[1], center[2] + .073 * axis[2]], view), 4);
    expect(rays).toContain(`M${glyph.origin}L${endpoint}`);
  });
  expect(sceneGeometry({ translation: center, rotation: path.rotations[20]! }, 2).glyphs.flat()
    .some(ray => ray.startsWith(`M${glyph.origin}L`))).toBe(false);
});
test('the sampled course has no gap at any selected pose', () => {
  const points = path.positions.map(position => project(position, view));
  const expected = `M${points.join('L')}`;
  path.distances.forEach((distance, i) => {
    expect(sceneGeometry({ translation: path.positions[i]!, rotation: path.rotations[i]! }, distance).course).toBe(expected);
  });
});
