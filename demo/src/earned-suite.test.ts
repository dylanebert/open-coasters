import { expect, test } from 'bun:test';
import { exampleOptions } from './configuration';

test('ordinary chooser contains exactly five placement claims', () => {
  expect(exampleOptions.map(([key]) => key)).toEqual(['ties', 'station', 'supports', 'assembly', 'track']);
});
