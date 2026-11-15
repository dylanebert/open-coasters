import { expect, test } from 'bun:test';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { constructDemo, diagnosticPost } from './construction-demo';
import { assemblyDefaults, assemblyPath, packRails, resolveAssembly, railAppearance } from './assembly';
import normalSource from '../../construction/normal-track.json?raw';
import { normalTrack } from '../../construction/normal-track';
import { contentValue, readNative, resolvedNative } from '../../construction/native';
import { framesAt, path } from '../../construction/geometry';
import { loadSampledSection } from './sampled-section';
import { changesSubject, geometryKey } from './selection';
import { initialConfiguration, effective, history, preview, commit, undo, redo } from './configuration';
import recorded from './loop-path.json';
import { setPath, selectExample } from './configuration';
import { length } from './track';
const root=new URL('../public/assets/',import.meta.url);
const section=await loadSampledSection(new URL('assembly-section.gltf',root));
const tie=contentValue({snapshot:await readNative(new URL('assembly-tie-bar.gltf',root))});
const post=contentValue({snapshot:diagnosticPost});
const a={...assemblyDefaults,path:'straight' as const,spacing:1,separation:1.4};

for (const kind of ['straight','curve','loop'] as const) test(`gap phase and sampled poses on ${kind}`, () => {
 const spacing=.65, start=2.125, end=7.875;
 const result=constructDemo({...a,path:kind,witness:'station',spacing,gapStart:start,gapEnd:end},section,tie,post);
 const source=assemblyPath(kind), total=source.distances.at(-1)!;
 const expected:number[]=[];
 for(let i=0;i*spacing<total;i++) if(i*spacing<start || i*spacing>end) expected.push(i*spacing);
 const native=resolveAssembly({...a,path:kind}).path;
 const poses=result.parts[0].placements;
 expect(poses).toHaveLength(expected.length);
 expected.forEach((distance,index)=>{
   const cell=Math.min(95,Math.floor(distance/total*96));
   const fraction=(distance-native.distances[cell])/(native.distances[cell+1]-native.distances[cell]);
   for(let axis=0;axis<3;axis++) expect(poses[index].translation[axis]).toBeCloseTo(native.positions[cell][axis]*(1-fraction)+native.positions[cell+1][axis]*fraction,10);
   const left=native.rotations[cell], right=native.rotations[cell+1];
   const dot=left.reduce((sum,v,i)=>sum+v*right[i],0), sign=dot<0?-1:1;
   const angle=Math.acos(Math.min(1,Math.abs(dot)));
   const weights=angle<1e-6?[1-fraction,fraction]:[Math.sin((1-fraction)*angle)/Math.sin(angle),Math.sin(fraction*angle)/Math.sin(angle)];
   const q=left.map((v,i)=>v*weights[0]+right[i]*sign*weights[1]), norm=Math.hypot(...q);
   const alignment=q.reduce((sum,v,i)=>sum+v/norm*poses[index].rotation[i],0);
   expect(Math.abs(alignment)).toBeCloseTo(1,10);
 });
 expect(result.stations.at(-1)).toBe(total);
 let config=selectExample(structuredClone(initialConfiguration),'station');
 config=setPath(config,kind); config.values.station.start=total-1;config.values.station.end=total;
 const next=setPath(config,'straight');
 expect(next.values.station.start).toBeLessThanOrEqual(next.values.station.end);
 expect(next.values.station.end).toBeLessThanOrEqual(length('straight'));
 expect(effective(setPath(config,kind)).assembly?.path).toBe(kind);
});

test('consumer recipe source is original text and duplicate keys fail before execution',async()=>{
 expect(normalSource).toBe(await Bun.file(new URL('../../construction/normal-track.json',import.meta.url)).text());
 const duplicate=normalSource.replace('"schema":','"schema":"cc.graph@1","schema":');
 expect(duplicate).not.toBe(normalSource);
 const parameters={path:resolveAssembly(a).path,section,tieContent:tie,separation:a.separation,spacing:a.spacing,wall:railAppearance,cap:railAppearance};
 expect(()=>normalTrack(parameters,duplicate)).toThrow('duplicate JSON key');
});

test('demo NormalTrack and station use shared graph results with independently derived counts and landmarks',()=>{
 const r=constructDemo(a,section,tie,post);
 expect(r.construction.placements).toHaveLength(14);expect(r.rails.placements).toHaveLength(2);
 expect(r.parts[0].placements.map(f=>f.translation)).toEqual(Array.from({length:12},(_,i)=>[0,1.5,i-6]));
 const mesh=packRails(r.rails,r.stations,section.length);
 for(let c=0;c<3;c++) {const v=Array.from(mesh.vertices).filter((_,i)=>i%8===c);expect(Math.min(...v)).toBeCloseTo([-.76,1.44,-6][c],6);expect(Math.max(...v)).toBeCloseTo([.76,1.56,6][c],6);}
 const s=constructDemo({...a,witness:'station'},section,tie,post);
 // Original origins s=0..11, excluded [4.2,7.8): remove 5,6,7, never restart phase.
 expect(s.parts[0].placements.map(f=>f.translation[2])).toEqual([-6,-5,-4,-3,-2,2,3,4,5]);
 expect(s.construction.placements).toHaveLength(11);
},TIMEOUT.cheap);

for (const [start,end,spacing,expected] of [
 [0,0,1,[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5]],
 [12,12,1,[-6,-5,-4,-3,-2,-1,0,1,2,3,4,5]],
 [0,12,1,[]],
 [2,5,1,[-6,-5,-1,0,1,2,3,4,5]],
 [2.125,5.125,1,[-6,-5,-4,0,1,2,3,4,5]],
 [2,5,1.5,[-6,-4.5,0,1.5,3,4.5]],
 [0,1.5,1.5,[-4.5,-3,-1.5,0,1.5,3,4.5]],
 [10.5,12,1.5,[-6,-4.5,-3,-1.5,0,1.5,3]],
] as const) test(`editable gap [${start},${end}) keeps phase at spacing ${spacing}`,()=>{
 const r=constructDemo({...a,witness:'station',gapStart:start,gapEnd:end,spacing},section,tie,post);
 expect(r.parts[0].placements.map(f=>f.translation[2])).toEqual([...expected]);
 expect(r.rails.placements).toHaveLength(2);
 expect(r.construction.placements).toHaveLength(expected.length+2);
},TIMEOUT.cheap);

test('gap adapter refuses out-of-domain or reversed intervals without clamping',()=>{
 for(const [gapStart,gapEnd] of [[-.001,5],[0,12.001],[5,4],[NaN,5],[0,Infinity]]) {
  expect(()=>constructDemo({...a,witness:'station',gapStart,gapEnd},section,tie,post)).toThrow('Invalid gap interval');
 }
},TIMEOUT.cheap);

test('inspectable supports retain bounded explicit ownership',()=>{
 const r=constructDemo({...a,witness:'supports'},section,tie,post);
 expect(r.parts[1].placements.map(f=>f.translation)).toEqual([[0,0,-4],[0,0,4]]);
},TIMEOUT.cheap);

test('recorded adapter retains source station poses, explicit SLERP and closed-domain refusal, not clamped nlerp',()=>{
 const p=assemblyPath('loop'),i=100, raw=recorded[i];
 expect(p.distances).toEqual(recorded.map(r=>r[0]));
 expect(p.positions[i][1]).toBe(raw[2]+1.5);
 const apex=recorded.reduce((a,b)=>b[2]>a[2]?b:a)[1];
 expect(p.positions[i]).toEqual([-raw[1]+apex,raw[2]+1.5,-raw[3]-5.3998784515]);
 // Independent basis landmark from the recorded quaternion; adaptation conjugates Y half-turn.
 const q=raw.slice(4),norm=Math.hypot(...q),[x,y,z,w]=q.map(v=>v/norm);
 const expected=[1-2*(y*y+z*z),-2*(x*y+z*w),2*(x*z-y*w)];
 const f=framesAt(p,[raw[0]])[0],r=f.rotation;
 const actual=[1-2*(r[1]*r[1]+r[2]*r[2]),2*(r[0]*r[1]+r[2]*r[3]),2*(r[0]*r[2]-r[1]*r[3])];
 actual.forEach((v,c)=>expect(v).toBeCloseTo(expected[c],12));
 expect(()=>framesAt(p,[-1])).toThrow('outside');expect(()=>framesAt(p,[p.distances.at(-1)!+1])).toThrow('outside');
 const asymmetric=path({distances:[0,8],positions:[[0,0,0],[0,0,8]],rotations:[[0,0,0,1],[0,Math.sin(Math.PI/3),0,Math.cos(Math.PI/3)]]});
 expect(framesAt(asymmetric,[2])[0].rotation[1]).toBeCloseTo(Math.sin(Math.PI/12),12);
},TIMEOUT.cheap);

test('consumer force packing does not mutate native export or source appearance',()=>{
 const r=constructDemo(a,section,tie,post), before=JSON.stringify(resolvedNative(r.construction));
 const packed=packRails(r.rails,r.stations,section.length,s=>[s/12,0,0,1]);
 expect(packed.color!.length).toBe(packed.vertices.length/2);expect(packed.color![0]).toBe(0);
 expect(JSON.stringify(resolvedNative(r.construction))).toBe(before);
 expect(resolvedNative(r.construction).meshes.every((m:any)=>m.primitives.every((p:any)=>p.attributes.COLOR_0===undefined))).toBe(true);
},TIMEOUT.cheap);

test('construction controls keep history and deterministic camera/replacement decisions on CPU',()=>{
 const state=structuredClone(initialConfiguration);
 const next={...state,values:{...state.values,ties:{...state.values.ties,spacing:.5}}};
 const h=commit(preview(history(state),next));
 expect(undo(h).present).toEqual(state);expect(redo(undo(h)).present).toEqual(next);
 const initial=effective(state), edited=effective(next);
 expect(changesSubject(undefined,initial)).toBe(true);expect(changesSubject(initial,edited)).toBe(false);
 expect(geometryKey(initial)).not.toBe(geometryKey(edited));
 for(const next of [{...a,path:'loop' as const},{...a,witness:'station' as const}]) expect(changesSubject(initial,{...initial,assembly:next})).toBe(true);
 expect(changesSubject(initial,{...initial,appearance:'normal-force'})).toBe(false);
 expect(geometryKey(initial)).toBe(geometryKey({...initial,paint:{rails:'#123456',ties:'#000000',spine:'#000000'}}));
},TIMEOUT.cheap);

 for(const [post1,post2] of [[0,12],[12,0],[3.125,8.875],[4.25,4.25]]) test(`explicit support stations ${post1}, ${post2} are independent of tie repetition`,()=>{
 const build=(patch:object)=>constructDemo({...a,witness:'supports',...patch},section,tie,post);
 const base=build({});
   const r=build({post1,post2});
   expect(r.parts[1].placements).toHaveLength(2);
   r.parts[1].placements.forEach((f,i)=>{ expect(f.translation[0]).toBe(0); expect(f.translation[1]).toBe(0); expect(f.translation[2]).toBeCloseTo([post1,post2][i]-6,12); });
   expect(r.parts[0]).toEqual(base.parts[0]);
   expect(build({post1,post2,spacing:.375}).parts[1]).toEqual(r.parts[1]);

 expect(build({post1:1.234}).parts[1].placements[1]).toEqual(base.parts[1].placements[1]);
 expect(build({post2:11.789}).parts[1].placements[0]).toEqual(base.parts[1].placements[0]);
 for(const key of ['post1','post2']) for(const value of [NaN,Infinity,-.001,12.001]) expect(()=>build({[key]:value})).toThrow('Invalid support station');
 },TIMEOUT.cheap);
