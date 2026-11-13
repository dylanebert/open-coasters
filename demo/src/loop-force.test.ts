import { expect, test } from 'bun:test';
import path from './loop-path.json';
import state from '../fixtures/loop-state.json';
import { loopForces, normalForce, forceColor } from './loop-force';
import { assemblyDefaults, assemblyRails, resolveAssembly } from './assembly';

// Authored targets are only an expectation here: loop.test independently recovers
// them from recorded motion AND position curvature, within 0.003 g.
const matches = (field: (s:number)=>number) => path.every((p,i) => Math.abs(field(p[0])-state.samples[i][2]) < .003);
test('realized support agrees with independently qualified targets, not flat, lateral or shifted fields', () => {
  expect(matches(normalForce)).toBe(true);
  expect(matches(() => 2)).toBe(false);
  expect(matches(() => 0)).toBe(false); // recorded lateral target, not normal
  expect(matches(s => normalForce((s+5)%path.at(-1)![0]))).toBe(false);
  expect(loopForces.length).toBe(path.length);
  for (let i=0;i<path.length;i++) expect(loopForces[i].station).toBe(path[i][0]);
});
test('distance interpolation uses unequal recorded stations; palette is explicit linear RGB', () => {
  for (const i of [0, 100, 300, path.length-2]) {
    const a=loopForces[i], b=loopForces[i+1];
    expect(normalForce(a.station+.25*(b.station-a.station))).toBeCloseTo(.75*a.normal+.25*b.normal, 10);
  }
  expect(forceColor(-1)).toEqual([.1,.3,1,1]);
  expect(forceColor(1)).toEqual([.55,.6499999999999999,1,1]);
  expect(forceColor(2)).toEqual([1,1,1,1]);
  expect(forceColor(3)).toEqual([1,.55,.55,1]);
  expect(forceColor(5)[0]).toBe(1);
  expect(forceColor(5)[1]).toBeCloseTo(.1);
  expect(() => normalForce(-1)).toThrow();
  expect(() => normalForce(NaN)).toThrow();
});
test('same unscaled circular section: every triangle corner receives its longitudinal station, including caps', () => {
  const section: [number,number][] = [[-.06,0],[0,-.06],[.06,0],[0,.06]];
  const rails=resolveAssembly({...assemblyDefaults,path:'loop'}).railFrames;
  const plain=assemblyRails(section, rails), colored=assemblyRails(section, rails, s=>forceColor(normalForce(s)));
  expect(colored.vertices).toEqual(plain.vertices);
  expect(colored.indices).toEqual(plain.indices);
  let corner=0;
  const check=(s:number) => {
    const expected=forceColor(normalForce(s));
    for(let k=0;k<4;k++) expect(colored.color![corner*4+k]).toBeCloseTo(expected[k],6);
    corner++;
  };
  for(const rail of rails) {
    for(let i=0;i<96;i++) for(let j=0;j<4;j++)
      for(const s of [rail[i].s,rail[i].s,rail[i+1].s,rail[i].s,rail[i+1].s,rail[i+1].s]) check(s);
    for(const end of [0,96]) for(let j=0;j<6;j++) check(rail[end].s);
  }
  expect(corner).toBe(colored.vertices.length/8);
});
