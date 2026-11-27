import { oneTie } from '../examples/one-tie';
import type { Path } from '../construction/geometry';
import type { Content } from '../construction/native';

const radius = 6;
const headingAt = (distance: number) => distance / radius - .18;
export const bankedLength = 5;
const bankEnd = 3.4;
const distances = Array.from({ length: bankedLength * 10 + 1 }, (_, i) => i / 10);
const samples = distances.map(distance => {
  const heading = headingAt(distance);
  const bank = -.025 - .32 * (1 - Math.cos(Math.PI * Math.min(distance, bankEnd) / bankEnd)) / 2;
  const s = Math.sin(heading / 2), c = Math.cos(heading / 2);
  const r = Math.sin(bank / 2), w = Math.cos(bank / 2);
  return {
    position: [radius * (Math.cos(headingAt(2)) - Math.cos(heading)), .06,
      .15 + radius * (Math.sin(heading) - Math.sin(headingAt(2)))],
    // Right-compose the original yaw/roll with local Ry(π):
    // (x, y, z, w) × (0, 1, 0, 0) = (−z, w, x, −y).
    rotation: [-c * r, c * w, s * r, -s * w],
  };
});
export const path: Path = {
  distances,
  positions: samples.map(sample => sample.position),
  rotations: samples.map(sample => sample.rotation),
};

export function tieAt(tie: Content, distance = 2) {
  const construction = oneTie({ path, tie, distance });
  if (construction.placements.length !== 1) throw Error('Expected one placed tie');
  return { construction, pose: construction.placements[0]!.frame, distance };
}
