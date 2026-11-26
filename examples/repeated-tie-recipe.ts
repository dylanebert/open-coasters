import { path } from '../construction/geometry';
import type { Content } from '../construction/native';
import { repeat } from '../construction/repeat';

// Extend tie sampling 1 mm past the rail end for the half-open span.
const trackPath = path({
  distances: [0, 1.951], positions: [[0, 0, .75], [0, 0, -1.201]],
  rotations: [[0, 0, 0, 1], [0, 0, 0, 1]],
});
export const defaultSpacing = 0.4;

export function placeTies(tie: Content, spacing: number) {
  const result = repeat(tie, {
    path: trackPath,
    spacing,
    startOffset: 0.15,
    allowed: [{ start: 0, end: 1.951 }],
  });
  return result;
}
