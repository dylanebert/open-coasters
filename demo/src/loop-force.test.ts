import { expect, test } from 'bun:test';
import path from './loop-path.json';
import state from '../fixtures/loop-state.json';
import { loopForces, normalForce, forceColor } from './loop-force';
import { assemblyDefaults, packRails, railAppearance, resolveAssembly } from './assembly';
import { rotation } from './track';
import { loadSampledSection } from './sampled-section';
import { sweepConvex } from '../../construction/sweep';
const section = await loadSampledSection(new URL('../public/assets/assembly-section.gltf',import.meta.url));

// Authored targets are an expectation, never the production field. The separate
// recorded-motion test in loop.test also qualifies their agreement (<0.003 g).
const matches = (field: (s:number)=>number) => path.every((p,i) => Math.abs(field(p[0])-state.samples[i][2]) < .003);
test('realized support agrees with independently qualified targets, not flat, lateral or shifted fields', () => {
  expect(matches(normalForce)).toBe(true);
  expect(matches(() => 2)).toBe(false);
  expect(matches(() => 0)).toBe(false);
  expect(matches(s => normalForce((s+5)%path.at(-1)![0]))).toBe(false);
  expect(loopForces.length).toBe(path.length);
  for (let i=0;i<path.length;i++) expect(loopForces[i].station).toBe(path[i][0]);
});
test('independent position-curvature expectations recover support, not world-Y or across acceleration', () => {
  const tangent = (i:number) => {
    const chord=path[i+1].slice(1,4).map((v,k)=>v-path[i-1][k+1]);
    return chord.map(v=>v/Math.hypot(...chord));
  };
  let wrongWorldY=0, wrongAcross=0;
  for(let i=2;i<path.length-3;i++) {
    const before=tangent(i-1), after=tangent(i+1), [x,y,z,w]=path[i].slice(4);
    const curvature=after.map((v,k)=>(v-before[k])/(path[i+1][0]-path[i-1][0]));
    const felt=curvature.map((v,k)=>v*state.samples[i][1]**2/9.81+(k===1?1:0));
    const up=[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)];
    const right=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)];
    const expected=felt.reduce((sum,v,k)=>sum+v*up[k],0);
    expect(normalForce(path[i][0])).toBeCloseTo(expected,3);
    wrongWorldY=Math.max(wrongWorldY,Math.abs(felt[1]-expected));
    wrongAcross=Math.max(wrongAcross,Math.abs(felt.reduce((sum,v,k)=>sum+v*right[k],0)-expected));
  }
  expect(wrongWorldY).toBeGreaterThan(1);
  expect(wrongAcross).toBeGreaterThan(3);
});
test('distance interpolation uses unequal recorded stations; palette is explicit linear RGB', () => {
  for (const i of [0, 100, 300, path.length-2]) {
    const a=loopForces[i], b=loopForces[i+1];
    expect(normalForce(a.station+.25*(b.station-a.station))).toBeCloseTo(.75*a.normal+.25*b.normal, 10);
  }
  for(const [g, rgb] of [[-1,[.1,.3,1]],[1,[.55,.65,1]],[2,[1,1,1]],[3,[1,.55,.55]],[5,[1,.1,.1]]] as const)
    forceColor(g).forEach((v,k)=>expect(v).toBeCloseTo(k===3?1:rgb[k],10));
  expect(() => normalForce(-1)).toThrow();
  expect(() => normalForce(NaN)).toThrow();
});
// Independent distance lookup over the qualified target evidence, not production
// normalForce/forceColor. Explicit expected stations do not read resolved .s.
function expectedColor(s:number) {
  const right=path.findIndex(p=>p[0]>=s), hi=Math.max(1,right);
  const t=(s-path[hi-1][0])/(path[hi][0]-path[hi-1][0]);
  const g=state.samples[hi-1][2]*(1-t)+state.samples[hi][2]*t;
  return g<2 ? [.1+.45*g,.3+.35*g,1,1] : [1,1-.45*(g-2),1-.45*(g-2),1];
}
test('unchanged section receives longitudinal corner colors; flat, transverse and shifted output controls fail', () => {
  const rails=resolveAssembly({...assemblyDefaults,path:'loop'}).railFrames;
  const construction={placements:rails.flatMap(r=>sweepConvex(section,r.map(f=>({translation:f.p,rotation:rotation(f)})),railAppearance,railAppearance).placements)};
  const pack=(appearance?: (s:number)=>readonly number[])=>packRails(construction,rails[0].map(f=>f.s),section.length,appearance);
  const plain=pack(), colored=pack(s=>forceColor(normalForce(s)));
  expect(colored.vertices).toEqual(plain.vertices);
  expect(colored.indices).toEqual(plain.indices);
  const stations:number[]=[];
  for(let rail=0;rail<2;rail++) {
    for(let i=0;i<96;i++) for(let j=0;j<section.length;j++)
      for(const k of [i,i,i+1,i,i+1,i+1]) stations.push(108.5071019065*k/96);
    // Shared native sweep alternates start/end triangles for each fan edge.
    for(let fan=0;fan<section.length-2;fan++) for(const end of [0,96]) for(let j=0;j<3;j++) stations.push(108.5071019065*end/96);
  }
  const audit=(color:Float32Array)=>stations.every((s,i)=>expectedColor(s).every((v,k)=>Math.abs(v-color[i*4+k])<.002));
  expect(stations.length).toBe(colored.vertices.length/8);
  expect(audit(colored.color!)).toBe(true);
  const flat=pack(()=>[1,1,1,1]);
  expect(audit(flat.color!)).toBe(false);
  const shifted=pack(s=>forceColor(normalForce((s+5)%108.5071019065)));
  expect(audit(shifted.color!)).toBe(false);
  const transverse=new Float32Array(colored.color!.length);
  for(let i=0;i<stations.length;i++) transverse.set(expectedColor((i%24)/24*108.5071019065),i*4);
  expect(audit(transverse)).toBe(false);
});
