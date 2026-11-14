import { TIMEOUT } from "@dylanebert/shallot/testing";
import { test, expect } from 'bun:test';
import { normalTrack, stationGap } from '../../../construction/normal-track';
import { sampledSection } from '../../../construction/section';
import { sweepConvex, materialValue } from '../../../construction/sweep';
import { nativeSnapshot, contentValue, snapshotBytes } from '../../../construction/native';
import { frame, path, adjustFrames, rotate } from '../../../construction/geometry';
const root = new URL('../../public/assets/', import.meta.url);
const json = await Bun.file(new URL('assembly-section.gltf', root)).json();
const bytes = await Bun.file(new URL('assembly-section.bin', root)).arrayBuffer();
const section = sampledSection(json,[bytes]);
const source = await Bun.file(new URL('../../../construction/normal-track.json',import.meta.url)).text();
const doc = await Bun.file(new URL('../../../construction/witness/resolved-ties.gltf',import.meta.url)).json();
const raw = new Float32Array([.1,.2,.4,.4,.2,.4,.1,.5,.4]);
doc.buffers = [{byteLength:raw.byteLength}]; doc.materials = [{pbrMetallicRoughness:{baseColorFactor:[.2,.3,.4,1]}},{pbrMetallicRoughness:{baseColorFactor:[.2,.3,.4,1]}}];
const snapshot = nativeSnapshot(doc,[new Uint8Array(raw.buffer)]);
const tieContent = contentValue({snapshot});
const wall = materialValue({snapshot,material:0}), cap = materialValue({snapshot,material:1});
const I = [0,0,0,1];
const parameters = {path:path({distances:[0,6],positions:[[0,1.5,0],[0,1.5,6]],rotations:[I,I]}),section,tieContent,separation:1.4,spacing:1,wall,cap};
// Independent raw native accessor reader; never calls the generator's transform or decoder.
function read(s: typeof snapshot, index: number): number[][] {
 const a=s.document.accessors[index], v=s.document.bufferViews[a.bufferView];
 const data=new DataView(snapshotBytes(s,v.buffer).buffer);
 return Array.from({length:a.count},(_,i)=>[0,1,2].map(c=>data.getFloat32((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12)+c*4,true)));
}
const close = (a: readonly number[], b: readonly number[], tolerance=1e-12) => a.forEach((x,i)=>expect(Math.abs(x-b[i])).toBeLessThanOrEqual(tolerance));
test('NormalTrack base counts, independent native bounds, mesh counts and fresh owned material identities',()=>{
 const result=normalTrack(parameters,source), again=normalTrack(parameters,source);
 expect(result.placements.length).toBe(8);
 expect(result.placements.slice(2).map(p=>p.frame.translation)).toEqual([0,1,2,3,4,5].map(z=>[0,1.5,z]));
 const points=result.placements.slice(0,2).flatMap(p=>read(p.content.snapshot,0));
 close([0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),[-.76,1.44,0],1e-7);
 close([0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),[.76,1.56,6],1e-7);
 for(const [i,p] of result.placements.slice(0,2).entries()) {
  const s=p.content.snapshot; expect(read(s,0).length).toBe(96); expect(read(s,2).length).toBe(84);
  expect(s.document.materials.length).toBe(2); expect(s.document.meshes[0].primitives.map((p:any)=>p.material)).toEqual([0,1]);
  expect(s).not.toBe(again.placements[i].content.snapshot); expect(Object.isFrozen(s.buffers[0])).toBe(true);
 }
 expect(result.placements[2].content.snapshot).toBe(snapshot);
}, TIMEOUT.cheap);
test('phase preserving station gaps and explicitly owned custom parts',()=>{
 for(const [phase,expected] of [[0,[0,1,4,5]],[.5,[.5,1.5,3.5,4.5,5.5]]] as const){
 const result=stationGap({...parameters,phase,excluded:[{start:2,end:3.5}]},source,[{content:tieContent,frames:[frame({translation:[9,8,7],rotation:I})]}]);
 expect(result.placements.slice(2,-1).map(p=>p.frame.translation[2])).toEqual([...expected]);
 expect(result.placements.at(-1)!.frame.translation).toEqual([9,8,7]); expect(result.placements.at(-1)!.content.snapshot).toBe(snapshot);
 }
}, TIMEOUT.cheap);
test('asymmetric local adjustment straight, banked and inverted, plus faceted directed native normals and caps',()=>{
 const local=frame({translation:[.2,-.1,.3],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]});
 for(const [q,expected] of [[I,[.6,1.6,2.2]],[[0,0,Math.SQRT1_2,Math.SQRT1_2],[-.1,2.1,2.2]],[[0,0,1,0],[-.6,1.4,2.2]]] as const){
 const f=adjustFrames([frame({translation:[0,1.5,2],rotation:q})],local)[0];
 close(rotate(f.rotation,[.1,.2,.4]).map((x,i)=>x+f.translation[i]),expected);
 const s=sweepConvex(section,[frame({translation:[0,0,0],rotation:q}),frame({translation:[0,0,6],rotation:q})],wall,cap).placements[0].content.snapshot;
 for(const [pi,ni] of [[0,1],[2,3]]){
  const ps=read(s,pi), ns=read(s,ni);
  for(let i=0;i<ps.length;i+=3){
   const [a,b,c]=ps.slice(i,i+3), u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
   const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], length=Math.hypot(...cross);
   close(ns[i],cross.map(x=>x/length),2e-6); expect(ns[i]).toEqual(ns[i+1]);expect(ns[i]).toEqual(ns[i+2]);
   if(pi===2) close(ns[i],[0,0,a[2]===0?-1:1],1e-7);
   else expect(ns[i][0]*(a[0]+b[0]+c[0])+ns[i][1]*(a[1]+b[1]+c[1])).toBeGreaterThan(0);
  }
 }
 }
}, TIMEOUT.cheap);
test('unsupported section, geometry and appearance fail without publishing results',()=>{
 const f=frame({translation:[0,0,0],rotation:I});
 for(const frames of [[f],[f,f],[f,frame({translation:[0,0,1e-14],rotation:I})]]) expect(()=>sweepConvex(section,frames,wall,cap)).toThrow();
 expect(()=>sweepConvex([[0,0],[1,0],[0,1]], [f,f],wall,cap)).toThrow('decoded assembly');
 for(const patch of [{alphaMode:'BLEND'},{normalTexture:{index:0}},{pbrMetallicRoughness:{baseColorTexture:{index:0}}}]) {
  const d=structuredClone(doc); d.materials[0]=patch;
  expect(()=>materialValue({snapshot:nativeSnapshot(d,[new Uint8Array(raw.buffer)]),material:0})).toThrow();
 }
 for(const change of [(j:any)=>j.nodes[0].translation=[1,0,0],(j:any)=>j.meshes[0].primitives[0].mode=3]){
  const j=structuredClone(json);change(j);expect(()=>sampledSection(j,[bytes])).toThrow();
 }
 expect(()=>normalTrack({...parameters,separation:0},source)).toThrow();
 expect(()=>normalTrack({...parameters,spacing:NaN},source)).toThrow();
}, TIMEOUT.cheap);

test('published NormalTrack interface, defaults and composition remain explicit graph data',()=>{
 const d=JSON.parse(source), g=d.groups.find((g:any)=>g.operation==='example.NormalTrack@1').graph;
 expect(d.entry).toBe('example.NormalTrack@1');
 expect(g.inputs.map((p:any)=>[p.name,p.type])).toEqual([
 ['path',{id:'cc.sampled-frame-path@1'}],['section',{id:'cc.convex-section@1'}],['tieContent',{id:'cc.content@1'}],['separation',{id:'cc.number@1'}],['spacing',{id:'cc.number@1'}],['wall',{id:'cc.native-material@1'}],['cap',{id:'cc.native-material@1'}],['phase',{id:'cc.number@1'}],['excluded',{list:{id:'cc.span@1'}}],['tieLocalFrame',{id:'cc.frame@1'}]]);
 expect(g.inputs.filter((p:any)=>'default' in p).map((p:any)=>[p.name,p.default])).toEqual([['phase',0],['excluded',[]],['tieLocalFrame',{translation:[0,0,0],rotation:I}]]);
 expect(g.nodes.map((n:any)=>n.operation)).toEqual(['cc.pathStations@1','cc.fullSpan@1','cc.railOffsets@1','cc.adjustFrames@1','cc.sweepConvex@1','cc.adjustFrames@1','cc.sweepConvex@1','example.Ties@1','cc.join@1']);
 expect(g.nodes.at(-1).inputs.constructions).toEqual({list:[{node:'leftRail',output:'construction'},{node:'rightRail',output:'construction'},{node:'ties',output:'construction'}]});
 expect(g.outputs).toEqual([{name:'construction',type:{id:'cc.construction@1'},binding:{node:'join',output:'construction'}}]);
}, TIMEOUT.cheap);

test('native float32 precision collapse refuses atomically at ordinary and translated coordinates',()=>{
 // Exact review counterexample, then the same representability failure on other axes/scales.
 for (const [a,b] of [
  [[0,0,1],[0,0,1+1e-8]],
  [[0,0,1e8],[0,0,1e8+1]],
  [[2**24,0,0],[2**24,0,6]],
  [[0,2**24,0],[0,2**24,6]],
 ]) {
  let published: unknown;
  expect(()=>{published=sweepConvex(section,[frame({translation:a,rotation:I}),frame({translation:b,rotation:I})],wall,cap);}).toThrow('degenerate sweep triangle');
  expect(published).toBeUndefined();
 }
 // Finiteness is also an emitted-coordinate property.
 expect(()=>sweepConvex(section,[frame({translation:[0,0,1e39],rotation:I}),frame({translation:[0,0,2e39],rotation:I})],wall,cap)).toThrow('nonfinite');
}, TIMEOUT.cheap);

test('native accessor positions own degeneracy and directed normals on banked nonplanar and precision-boundary sweeps',()=>{
 for (const frames of [
  [frame({translation:[.13,.27,1],rotation:I}),frame({translation:[.19,.31,1+1e-6],rotation:[0,0,Math.sin(.2),Math.cos(.2)]})],
  [frame({translation:[.13,.27,1],rotation:I}),frame({translation:[.19,.31,3.1],rotation:[Math.sin(.13),0,0,Math.cos(.13)]})],
  [frame({translation:[0,0,1],rotation:I}),frame({translation:[0,0,1+2**-23],rotation:I})],
 ]) {
  const placement=sweepConvex(section,frames,wall,cap).placements[0];
  // Generated native node and placement are identity: raw accessors are world coordinates.
  expect(placement.frame).toEqual({translation:[0,0,0],rotation:I});
  expect(placement.content.snapshot.document.nodes).toEqual([{mesh:0}]);
  const s=placement.content.snapshot;
  for(const [pi,ni] of [[0,1],[2,3]]) {
   const ps=read(s,pi), ns=read(s,ni);
   for(let i=0;i<ps.length;i+=3) {
    const [a,b,c]=ps.slice(i,i+3),u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]], length=Math.hypot(...cross);
    expect([...a,...b,...c,...ns[i]].every(Number.isFinite)).toBe(true);
    expect(length).toBeGreaterThan(1e-12);
    // Exactly the float32 encoding of the native POSITION directed cross normal.
    expect(ns[i]).toEqual(cross.map(x=>Math.fround(x/length)));
    expect(ns[i+1]).toEqual(ns[i]);expect(ns[i+2]).toEqual(ns[i]);
   }
  }
 }
}, TIMEOUT.cheap);
