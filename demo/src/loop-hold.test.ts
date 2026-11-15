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
