import { test, expect } from 'bun:test';
import { interactionColors } from './chrome';
import { palettes } from './theme-data';
import { contrast } from '../tests/contrast';

test('interaction colors cover text, icon and focus contrast in both themes', () => {
  expect(contrast('#000000', '#ffffff')).toBe(21);
  expect(contrast('#d49560', palettes.light.bg)).toBeLessThan(3);
  for (const theme of ['light', 'dark'] as const) {
    expect(contrast(interactionColors[theme], palettes[theme].bg)).toBeGreaterThanOrEqual(4.5);
  }
});
