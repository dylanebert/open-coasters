// Consumer visualization only. The original records stay in their offline homes.
import path from './loop-path.json';
import state from '../fixtures/loop-state.json';

// Source-space velocity and local up, from the recorded XYZW pose. No authored
// force lane is used: this is support acceleration (dv/dt - gravity) projected up.
const poses = path.map((p, i) => {
  const [x,y,z,w] = p.slice(4), speed = state.samples[i][1];
  return { velocity: [-2*(x*z+w*y)*speed, -2*(y*z-w*x)*speed, (-1+2*(x*x+y*y))*speed],
    up: [2*(x*y-w*z), 1-2*(x*x+z*z), 2*(y*z+w*x)] };
});
export const loopForces = path.map((p, i) => {
  // Three-point Lagrange derivative at the actual timestamp, including one-sided
  // endpoint stencils and the unequal physical terminal step.
  const first = Math.max(0, Math.min(i-1, path.length-3));
  const ids = [first, first+1, first+2], t = state.samples[i][0];
  const acceleration = [0, 9.81, 0];
  for (const j of ids) {
    const [a,b] = ids.filter(k => k !== j).map(k => state.samples[k][0]);
    const tj = state.samples[j][0];
    const weight = (2*t-a-b)/((tj-a)*(tj-b));
    for (let k=0; k<3; k++) acceleration[k] += weight*poses[j].velocity[k];
  }
  return { station: p[0], normal: acceleration.reduce((sum, a, k) => sum+a*poses[i].up[k], 0)/9.81 };
});
export function normalForce(station: number) {
  if (!Number.isFinite(station) || station < 0 || station > loopForces.at(-1)!.station) throw new Error('Outside recorded loop');
  let lo=0, hi=loopForces.length-1;
  while (hi-lo>1) { const mid=(lo+hi)>>1; if (loopForces[mid].station <= station) lo=mid; else hi=mid; }
  const a=loopForces[lo], b=loopForces[hi], t=(station-a.station)/(b.station-a.station);
  return a.normal+(b.normal-a.normal)*t;
}
// Linear RGB modulation, clamped 0–4 g: blue → white → red. StandardMaterial
// multiplies this with its native base color; it is not an emissive heatmap.
export function forceColor(g: number): [number, number, number, number] {
  const t=Math.max(0, Math.min(4,g))/2;
  return t<=1 ? [.1+.9*t, .3+.7*t, 1, 1] : [1, 1-.9*(t-1), 1-.9*(t-1), 1];
}
