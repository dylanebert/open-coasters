import { expect, test } from 'bun:test';
import path from './loop-path.json';
import state from '../fixtures/loop-state.json';

// Composite trapezoid speed quadrature, using the actual unequal time grid.
// The local sampled error estimate uses adjacent divided second differences
// with a factor-two allowance to form a numerical consistency envelope, not
// a guaranteed bound on unresolved trajectory variation or continuous v''.
// Decimal source rounding adds 1e-9 m.
function timing(samples: readonly (readonly number[])[]) {
  const slopes = samples.slice(1).map((r,i) => (r[1]-samples[i][1])/(r[0]-samples[i][0]));
  const second = slopes.slice(1).map((v,i) => 2*Math.abs(v-slopes[i])/(samples[i+2][0]-samples[i][0]));
  let integrated = 0, bound = 0, worstRatio = 0;
  for (let i=1;i<samples.length;i++) {
    const dt = samples[i][0]-samples[i-1][0];
    const mean = (samples[i][1]+samples[i-1][1])/2;
    const ds = path[i][0]-path[i-1][0];
    const curvature = Math.max(...second.slice(Math.max(0,i-3), Math.min(second.length,i+1)));
    const local = (2*curvature*dt**3/12+1e-9)/mean;
    integrated += ds/mean;
    bound += local;
    worstRatio = Math.max(worstRatio, Math.abs(ds/mean-dt)/local);
  }
  return { integrated, bound, worstRatio, elapsed: samples.at(-1)![0]-samples[0][0] };
}

test('station/speed integration agrees with unequal recorded times and rejects inconsistent retiming/speed', () => {
  const original = timing(state.samples);
  expect(original.worstRatio).toBeLessThan(1);
  expect(Math.abs(original.integrated-original.elapsed)).toBeLessThan(original.bound);
  const crown = timing(state.samples.slice(0,585));
  expect(Math.abs(crown.integrated-crown.elapsed)).toBeLessThan(crown.bound);
  expect(crown.worstRatio).toBeLessThan(1);
  expect(state.samples[584][0]).toBe(2.92);
  expect(state.samples[584][1]).toBeCloseTo(9.5925309264,10);
  expect(state.samples.at(-1)![0]).toBeCloseTo(5.838011808402109,10);
  for (const [timeScale,speedScale] of [[1.1,1],[1,1.1]]) {
    const bad = timing(state.samples.map(r => r.map((x,i) => i===0?x*timeScale:i===1?x*speedScale:x)));
    expect(Math.abs(bad.integrated-bad.elapsed)).toBeGreaterThan(100*bad.bound);
    expect(bad.worstRatio).toBeGreaterThan(100);
  }
  const uniform = timing(state.samples.map((r,i) => [i*state.endTime/(state.samples.length-1), ...r.slice(1)]));
  expect(uniform.worstRatio).toBeGreaterThan(100);
  console.log('independent timing quadrature', {full:original,crown,uniformTimeNegativeControl:uniform});
});
