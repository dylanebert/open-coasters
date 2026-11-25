import { expect, test } from 'bun:test';
import { nativeSnapshot, resolvedNative } from '../construction/native';
import { rotate } from '../construction/geometry';
import { placeTies, repeatedView } from './repeated';
import { defaultSpacing } from '../examples/repeated-tie-recipe';

const asset = new URL('../demo/public/assets/blitz-tie.gltf', import.meta.url);

test('the displayed recipe draws the archived ties at the selected spacing', async () => {
  const source = await Bun.file(asset).json();
  const buffers = await Promise.all(source.buffers.map(({ uri }: { uri: string }) => Bun.file(new URL(uri, asset)).arrayBuffer()));
  const tie = { snapshot: nativeSnapshot(source, buffers) };
  const guide = await Bun.file(new URL('../construction-contract.md', import.meta.url)).text();
  const [, spacing, recipe] = guide.match(/```ts\nconst spacing = (\d+\.\d+);\n([\s\S]*?)```/) ?? [];
  expect(spacing).toBe('0.4');
  expect(Number(spacing)).toBe(defaultSpacing);
  const runtime = await Bun.file(new URL('../examples/repeated-tie-recipe.ts', import.meta.url)).text();
  expect(recipe).toBe(runtime.split('spacing: number) {\n')[1]?.split('  return result;')[0]?.replace(/^  /gm, ''));

  for (const [value, expected] of [
    [.4, [.6, .2, -.2, -.6, -1]],
    [.8, [.6, -.2, -1]],
  ] as const) {
    const result = placeTies(tie, value);
    expect(result.placements.every(placement => placement.content.snapshot === tie.snapshot)).toBe(true);
    const doc = resolvedNative(result);
    const draws = doc.scenes[0].nodes.map((index: number) => doc.nodes[index]);
    const { camera, target } = repeatedView;
    const forward = target.map((x, i) => x - camera[i]!);
    const depths = draws.map(({ translation }: { translation: number[] }) =>
      forward.reduce((depth, x, i) => depth + x * (translation[i]! - camera[i]!), 0));
    expect(depths[0], 'the first draw must be nearest in camera depth').toBe(Math.min(...depths));
    for (let i = 1; i < draws.length; i++) {
      expect(depths[i]).toBeGreaterThan(depths[i - 1]);
      const previous = draws[i - 1];
      const travel = draws[i].translation.map((x: number, j: number) => (x - previous.translation[j]) / value);
      const localForward = rotate(previous.rotation, [0, 0, -1]);
      travel.forEach((x: number, j: number) => expect(x).toBeCloseTo(localForward[j]!, 12));
    }
    expect(draws.map(({ translation }: { translation: number[] }) => translation.map(x => Number(x.toFixed(12)))))
      .toEqual(expected.map(z => [0, 0, z]));
  }
});
