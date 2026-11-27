// Test-only analytic pose, evaluated without production frames or quaternions.
import type { Vec } from './track';

export const replaySamples = [
  {name: 'rest', time: 0, radius: 8},
  {name: 'intermediate in', time: 2.5, radius: 48/7},
  {name: 'maximum bend', time: 4, radius: 6},
  {name: 'intermediate out', time: 5.5, radius: 48/7},
  {name: 'final rest', time: 7, radius: 8},
  {name: 'unchanged hold', time: 8, radius: 8},
] as const;

export const asset = (name: string) => new URL(`../public/assets/${name}.gltf`, import.meta.url);
export const sectionAssets = ['ModernRail', 'ModernSpine_1'] as const;

export const arc = (radius: number) => (s: number) => {
  const angle = (s - 2*Math.PI) / radius;
  const c = Math.cos(angle), t = Math.sin(angle), cosBank = Math.sqrt(3)/2;
  return {
    p: [2 - radius*(1-c), 1.5, radius*t] as Vec,
    x: [-cosBank*c, -.5, -cosBank*t] as Vec,
    y: [-.5*c, cosBank, -.5*t] as Vec,
    z: [t, 0, -c] as Vec,
  };
};

export function nativePoint(matrix: ArrayLike<number>, x: number, y: number, z: number) {
  return [0,1,2].map(a => matrix[12+a] + x*matrix[a] + y*matrix[4+a] + z*matrix[8+a]);
}

export function posePoint(pose: ReturnType<ReturnType<typeof arc>>, [x,y,z]: readonly number[]) {
  return pose.p.map((v,a) => v + x*pose.x[a] + y*pose.y[a] + z*pose.z[a]);
}
