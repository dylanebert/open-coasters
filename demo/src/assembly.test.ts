import { expect, test } from 'bun:test';
import { assemblyDefaults, resolveAssembly, assemblyRails } from './assembly';
import { sampledSection } from './sampled-section';
import { loadGltf, type GltfJson } from '@dylanebert/shallot/gltf';
import { staticInstanceSnapshot } from './instance';

const root = new URL('../public/assets/', import.meta.url);
const json: GltfJson = await Bun.file(new URL('assembly-section.gltf', root)).json();
const buffer = await Bun.file(new URL('assembly-section.bin', root)).arrayBuffer();
const section = sampledSection(json, [buffer]);

test('declared static components retain independently authored source bounds and native appearance', async () => {
  for (const [name, low, high, color, metal, rough] of [
    ['assembly-tie-bar',[-.95,-.18,-.09],[.95,-.06,.09],[.035,.32,.48,1],.65,.3],
    ['assembly-tie-fork',[-.95,-.18,-.13],[.95,-.10,.13],[.035,.32,.48,1],.65,.3],
    ['assembly-fitting',[-.095,-.13,0],[.21,.095,.20],[.8,.24,.035,1],.55,.28],
  ] as const) {
    const data = await loadGltf(await staticInstanceSnapshot(new URL(name+'.gltf',root)));
    expect(data.unsupported).toEqual([]);
    const points = data.instances.flatMap(instance => {
      const m = instance.matrix, v = data.meshes[instance.mesh].vertices;
      return Array.from({length:v.length/8},(_,i) => [0,1,2].map(a => m[a]*v[8*i]+m[a+4]*v[8*i+1]+m[a+8]*v[8*i+2]+m[a+12]));
    });
    for(let a=0;a<3;a++) { expect(Math.min(...points.map(p => p[a]))).toBeCloseTo(low[a],7); expect(Math.max(...points.map(p => p[a]))).toBeCloseTo(high[a],7); }
    for(const m of data.materials) {
      m.color!.forEach((v,i) => expect(v).toBeCloseTo(color[i],6));
      expect(m.metallic).toBeCloseTo(metal,6); expect(m.roughness).toBeCloseTo(rough,6);
    }
  }
});

test('native sampled section retains metric XY coordinates, authored directed cycle and origin', () => {
  expect(section.length).toBe(16);
  section.forEach((p,i) => p.forEach((v,a) => expect(v).toBeCloseTo(.06 * (a ? Math.sin : Math.cos)(i*Math.PI/8), 7)));
  // Exact topology independently authored in native curve: 0->1 ... 15->0.
  expect(Array.from(new Uint16Array(buffer,192))).toEqual(Array.from({length:16}, (_,i) => [i,(i+1)%16]).flat());
  expect(Math.max(...section.map(p => p[0])) - Math.min(...section.map(p => p[0]))).toBeCloseTo(.12, 7);
  // Translation is retained, not normalized; this binding does not require centered sections.
  const shifted = buffer.slice(0), floats = new Float32Array(shifted,0,48);
  for (let i=0;i<16;i++) { floats[3*i] += .25; floats[3*i+1] -= .4; }
  const off = sampledSection(json,[shifted]);
  expect(off[0][0]).toBeCloseTo(.31,7); expect(off[4][1]).toBeCloseTo(-.34,7);
});

test('invalid geometry and unclaimed capabilities refuse rather than repair', () => {
  const mutate = (fn: (j: any, b: ArrayBuffer) => void) => {
    const j = structuredClone(json), b = buffer.slice(0); fn(j,b);
    expect(() => sampledSection(j,[b])).toThrow('Sampled section');
  };
  for (const field of ['translation','rotation','scale','matrix']) mutate(j => j.nodes[0][field] = []);
  for (const field of ['materials','animations','skins','textures','extensionsUsed']) mutate(j => j[field] = []);
  mutate(j => j.meshes[0].primitives[0].attributes.NORMAL = 0);
  mutate(j => j.meshes[0].primitives[0].material = 0);
  mutate(j => j.meshes[0].primitives[0].mode = 2);
  mutate(j => j.scene = 1);
  mutate(j => j.accessors[0].sparse = {});
  mutate(j => j.accessors[0].count = 17);
  mutate(j => j.bufferViews[0].byteLength = 12);
  mutate(j => j.bufferViews[0].byteStride = 2);
  mutate((_,b) => new Float32Array(b)[2] = .01);
  mutate((_,b) => new Float32Array(b)[0] = NaN);
  mutate((_,b) => new Float32Array(b)[0] = -.01); // concavity
  mutate((_,b) => new Uint16Array(b,192)[31] = 1); // open/branch
  mutate((_,b) => new Uint16Array(b,192)[0] = 16);
  mutate((_,b) => { const e = new Uint16Array(b,192); for (let i=0;i<16;i++) { e[2*i]=(16-i)%16; e[2*i+1]=(15-i)%16; } });
  expect(() => sampledSection(json,[buffer.slice(0,200)])).toThrow();
});

test('straight rigid rail/tie/fitting placements have independently known coordinates and no scaling', () => {
  const a = resolveAssembly({...assemblyDefaults,path:'straight',spacing:1.5,separation:1.4});
  expect(a.railFrames.map(r => [r[0].p,r.at(-1)!.p])).toEqual([[[-.7,1.5,-6],[-.7,1.5,6]],[[.7,1.5,-6],[.7,1.5,6]]]);
  expect(a.ties.map(p => p.translation)).toEqual(Array.from({length:8},(_,i) => [0,1.5,-6+1.5*i]));
  expect(a.ties.every(p => p.rotation.every((v,i) => Math.abs(v-[0,0,0,1][i])<1e-10))).toBe(true);
  expect(a.fitting[0].translation).toEqual([.7,1.5,6]);
  expect(a.fitting[0].rotation).toEqual([0,0,0,1]);
  const m = assemblyRails(section,a.railFrames);
  const xyz = [0,1,2].map(axis => Array.from(m.vertices).filter((_,i) => i%8===axis));
  xyz.forEach((v,i) => { expect(Math.min(...v)).toBeCloseTo([-.76,1.44,-6][i],6); expect(Math.max(...v)).toBeCloseTo([.76,1.56,6][i],6); });
  // Two rails, 96 longitudinal spans, 16 sides, two triangles; 14 triangles/cap.
  expect(m.indices.length).toBe(2*(96*16*2+28)*3);
  for (let i=0;i<m.vertices.length;i+=8) expect(Math.hypot(...m.vertices.slice(i+4,i+7))).toBeCloseTo(1,6);
  // Exposed caps point out, not toward the path.
  const normal = (vertex: number) => Array.from(m.vertices.slice(vertex*8+4,vertex*8+7));
  expect([...normal(96*16*6),...normal(96*16*6+42)]).toEqual([0,0,-1,0,0,1]);
});

test('banked curve midpoint and endpoints are independent analytic expectations', () => {
  const a = resolveAssembly({...assemblyDefaults,spacing: Math.PI/3, separation:1.6});
  const sqrt = Math.sqrt;
  for (const rail of a.railFrames) {
    rail[48].x.forEach((v,k) => expect(v).toBeCloseTo([sqrt(3)/2,.5,0][k],7));
    rail[48].y.forEach((v,k) => expect(v).toBeCloseTo([-.5,sqrt(3)/2,0][k],7));
    rail[48].z.forEach((v,k) => expect(v).toBeCloseTo([0,0,1][k],7));
    rail[0].x.forEach((v,k) => expect(v).toBeCloseTo([sqrt(6)/4,.5,-sqrt(6)/4][k],7));
    rail[0].y.forEach((v,k) => expect(v).toBeCloseTo([-sqrt(2)/4,sqrt(3)/2,sqrt(2)/4][k],7));
    rail[0].z.forEach((v,k) => expect(v).toBeCloseTo([sqrt(2)/2,0,sqrt(2)/2][k],7));
  }
  for (const [i,side] of [-1,1].entries()) {
    a.railFrames[i][48].p.forEach((v,k) => expect(v).toBeCloseTo([2+side*.4*sqrt(3),1.5+side*.4,0][k],7));
    a.railFrames[i][0].p.forEach((v,k) => expect(v).toBeCloseTo([4*sqrt(2)-6+side*.2*sqrt(6),1.5+side*.4,-4*sqrt(2)-side*.2*sqrt(6)][k],7));
  }
  expect(a.ties.length).toBe(12);
  a.ties[6].translation.forEach((v,k) => expect(v).toBeCloseTo([2,1.5,0][k],7));
  // At midpoint: pure +30 degree local Z bank.
  a.ties[6].rotation.forEach((v,k) => expect(v).toBeCloseTo([0,0,Math.sin(Math.PI/12),Math.cos(Math.PI/12)][k],7));
  const f = a.fitting[0];
  f.translation.forEach((v,k) => expect(v).toBeCloseTo([4*sqrt(2)-6+.2*sqrt(6),1.9,4*sqrt(2)+.2*sqrt(6)][k],7));
  // Y(-45°) * Z(30°), XYZW.
  f.rotation.forEach((v,k) => expect(v).toBeCloseTo([-Math.sin(Math.PI/8)*Math.sin(Math.PI/12),-Math.sin(Math.PI/8)*Math.cos(Math.PI/12),Math.cos(Math.PI/8)*Math.sin(Math.PI/12),Math.cos(Math.PI/8)*Math.cos(Math.PI/12)][k],7));
  // Every emitted station retains the source radius, including banked offsets.
  const m = assemblyRails(section,a.railFrames);
  for (const i of [0,48,95]) for (const rail of [0,1]) {
    const base = (rail*(96*16*6+84)+i*16*6)*8;
    const p = a.railFrames[rail][i].p;
    expect(Math.hypot(...[0,1,2].map(k => m.vertices[base+k]-p[k]))).toBeCloseTo(.06,6);
  }
});

for (const bad of [{spacing:0},{spacing:NaN},{separation:Infinity},{separation:.5},{path:'loop'},{tie:'unknown'}]) test(`invalid assembly ${JSON.stringify(bad)}`, () => {
  expect(() => resolveAssembly({...assemblyDefaults,...bad} as any)).toThrow('Invalid assembly');
});
