import { compositionDefaults, type Composition } from './configuration';

/** App-local rigid placements: repetition runs along world X; angles are degrees,
 * applied local roll (Z), pitch (X), then yaw (Y). No source normalization. */
export function authoredPlacements(repeated: boolean, values: Composition = compositionDefaults) {
  const { x, y, z, yaw, pitch, roll, count, spacing, offset } = values;
  if (Object.values(values).some(v => !Number.isFinite(v)) || !Number.isInteger(count) || count < 1 || count > 12 || spacing <= 0)
    throw new Error('Invalid authored placement');
  const [a, b, c] = [yaw, pitch, roll].map(v => v * Math.PI / 360);
  const [sy, sx, sz] = [Math.sin(a), Math.sin(b), Math.sin(c)];
  const [cy, cx, cz] = [Math.cos(a), Math.cos(b), Math.cos(c)];
  const rotation: [number, number, number, number] = [cy*sx*cz + sy*cx*sz, sy*cx*cz - cy*sx*sz, cy*cx*sz - sy*sx*cz, cy*cx*cz + sy*sx*sz];
  return Array.from({ length: repeated ? count : 1 }, (_, i) => ({
    translation: (repeated ? [offset + i * spacing, 0, 0] : [x, y, z]) as [number, number, number], rotation,
  }));
}
