import { expect, test } from "bun:test";
import path from "./loop-path.json";
import state from "../fixtures/loop-state.json";

// Independent quaternion forward and accepted 108/144/108 degree guide.
const phase = (p: number[]) => {
  const [x,y,z,w] = p.slice(4);
  const angle = Math.atan2(2*(w*x-y*z), 1-2*(x*x+y*y));
  return angle < 0 ? angle + 2*Math.PI : angle;
};
const guide = (theta: number) => Math.abs(theta-Math.PI) >= 2*Math.PI/5
  ? 4 : 4*Math.sin(5*(theta-Math.PI)/4)**2;
test("loop: realized held-positive shoulders and compact symmetric crown guide", () => {
  let holds = 0;
  for (let i=0; i<path.length-1; i++) {
    const theta = phase(path[i]);
    expect(state.samples[i][2]).toBeCloseTo(guide(theta), 8);
    if (theta < 3*Math.PI/5 || theta > 7*Math.PI/5) {
      expect(state.samples[i][2]).toBe(4);
      holds++;
    }
  }
  expect(holds).toBeGreaterThan(500);
});

test("held guide rejects cosine, one-sided and stale fields; joins are C1", () => {
  const matches = (field: (theta: number, i: number) => number) => path.slice(0,-1)
    .every((p,i) => Math.abs(state.samples[i][2]-field(phase(p),i)) < 1e-8);
  expect(matches(theta => 2+2*Math.cos(theta))).toBe(false);
  expect(matches(theta => theta < Math.PI ? guide(theta) : 4)).toBe(false);
  expect(matches((_,i) => state.samples[Math.max(0,i-10)][2])).toBe(false);
  for (const theta of [3*Math.PI/5, Math.PI, 7*Math.PI/5]) {
    const h=1e-5, left=(guide(theta)-guide(theta-h))/h, right=(guide(theta+h)-guide(theta))/h;
    expect(Math.abs(left-right)).toBeLessThan(.00013);
    expect(Math.abs(left)).toBeLessThan(.00007);
    expect(Math.abs(right)).toBeLessThan(.00007);
  }
  expect(guide(Math.PI)).toBe(0);
  const phases = path.map(phase); phases[phases.length-1]=2*Math.PI;
  const timeAt = (theta: number) => {
    const j=phases.findIndex(v => v>=theta), i=j-1;
    const fraction=(theta-phases[i])/(phases[j]-phases[i]);
    return state.samples[i][0]+fraction*(state.samples[j][0]-state.samples[i][0]);
  };
  const entry=timeAt(3*Math.PI/5), crown=timeAt(Math.PI), exit=timeAt(7*Math.PI/5);
  expect(entry).toBeCloseTo(1.3665873745378723,8);
  expect(exit-entry).toBeCloseTo(1.8906558141751901,8);
  expect(state.endTime-exit).toBeCloseTo(1.3662659552936707,8);
  // Symmetry is numerical, not an exact time-reflection constraint on causal steps.
  expect(Math.abs(entry-(state.endTime-exit))).toBeLessThan(.001);
  expect(Math.abs((crown-entry)-(exit-crown))).toBeLessThan(.001);
});
