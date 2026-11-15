import { expect, test } from "bun:test";
import path from "./loop-path.json";
import state from "../fixtures/loop-state.json";

// Independent quaternion phase and the selected D C1 Hermite/cosine guide.
const phase = (p: number[]) => {
  const [x,y,z,w] = p.slice(4);
  const angle = Math.atan2(2*(w*x-y*z), 1-2*(x*x+y*y));
  return angle < 0 ? angle + 2*Math.PI : angle;
};
const guide = (theta: number) => {
  const xi=Math.min(theta,2*Math.PI-theta), a=Math.PI/4,b=5*Math.PI/12;
  if(xi<=a)return 4;
  if(xi>=b)return 2+2*Math.cos(xi);
  const u=(xi-a)/(b-a), v=2+2*Math.cos(b), d=-2*Math.sin(b)*(b-a);
  return 4+(v-4)*(3*u*u-2*u*u*u)+d*(u*u*u-u*u);
};
test("selected D guide: short held shoulders and full Hermite/cosine crown dip", () => {
  let holds = 0;
  for (let i=0; i<path.length-1; i++) {
    const theta = phase(path[i]);
    expect(state.samples[i][2]).toBeCloseTo(guide(theta), 8);
    if (theta < Math.PI/4 || theta > 7*Math.PI/4) {
      expect(state.samples[i][2]).toBe(4);
      holds++;
    }
  }
  expect(holds).toBeGreaterThan(250);
});

test("selected D guide rejects cosine, former notch, one-sided and stale fields; joins are C1", () => {
  const matches = (field: (theta: number, i: number) => number) => path.slice(0,-1)
    .every((p,i) => Math.abs(state.samples[i][2]-field(phase(p),i)) < 1e-8);
  expect(matches(theta => 2+2*Math.cos(theta))).toBe(false);
  expect(matches(theta => Math.abs(theta-Math.PI)>=2*Math.PI/5?4:4*Math.sin(5*(theta-Math.PI)/4)**2)).toBe(false);
  expect(matches(theta => theta < Math.PI ? guide(theta) : 4)).toBe(false);
  expect(matches((_,i) => state.samples[Math.max(0,i-10)][2])).toBe(false);
  for (const theta of [Math.PI/4,5*Math.PI/12,Math.PI,19*Math.PI/12,7*Math.PI/4]) {
    // Smaller difference step resolves D's short, high-curvature Hermite joins;
    // derivative tolerances are unchanged, and C2 is not asserted.
    const h=1e-6, left=(guide(theta)-guide(theta-h))/h, right=(guide(theta+h)-guide(theta))/h;
    expect(Math.abs(left-right)).toBeLessThan(.00013);
    const expected=theta===Math.PI/4||theta===7*Math.PI/4||theta===Math.PI?0:-2*Math.sin(theta);
    expect(Math.abs(left-expected)).toBeLessThan(.00007);
    expect(Math.abs(right-expected)).toBeLessThan(.00007);
  }
  expect(guide(Math.PI)).toBe(0);
  const phases = path.map(phase); phases[phases.length-1]=2*Math.PI;
  const timeAt = (theta: number) => {
    const j=phases.findIndex(v => v>=theta), i=j-1;
    const fraction=(theta-phases[i])/(phases[j]-phases[i]);
    return state.samples[i][0]+fraction*(state.samples[j][0]-state.samples[i][0]);
  };
  const entry=timeAt(Math.PI/4), crown=timeAt(Math.PI), exit=timeAt(7*Math.PI/4);
  expect(entry).toBeCloseTo(.6960893322021021,8);
  expect(exit-entry).toBeCloseTo(4.445909995575612,8);
  expect(state.endTime-exit).toBeCloseTo(.6960124806243946,8);
  // Numerical reflection, not forced time symmetry or a Medusa timing match.
  expect(Math.abs(entry-(state.endTime-exit))).toBeLessThan(.001);
  expect(Math.abs((crown-entry)-(exit-crown))).toBeLessThan(.001);
});
