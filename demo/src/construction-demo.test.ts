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
import { initialConfiguration, history, preview, commit, undo, redo } from './configuration';
import recorded from './loop-path.json';
const root=new URL('../public/assets/',import.meta.url);
const section=await loadSampledSection(new URL('assembly-section.gltf',root));
const tie=contentValue({snapshot:await readNative(new URL('assembly-tie-bar.gltf',root))});
const fitting=contentValue({snapshot:await readNative(new URL('assembly-fitting.gltf',root))});
const post=contentValue({snapshot:diagnosticPost});
const a={...assemblyDefaults,path:'straight' as const,spacing:1,separation:1.4};

test('consumer recipe source is original text and duplicate keys fail before execution',async()=>{
 expect(normalSource).toBe(await Bun.file(new URL('../../construction/normal-track.json',import.meta.url)).text());
 const duplicate=normalSource.replace('"schema":','"schema":"cc.graph@1","schema":');
 expect(duplicate).not.toBe(normalSource);
 const parameters={path:resolveAssembly(a).path,section,tieContent:tie,separation:a.separation,spacing:a.spacing,wall:railAppearance,cap:railAppearance};
 expect(()=>normalTrack(parameters,duplicate)).toThrow('duplicate JSON key');
});

test('demo NormalTrack and station use shared graph results with independently derived counts and landmarks',()=>{
 const r=constructDemo(a,section,tie,fitting,post);
 expect(r.construction.placements).toHaveLength(14);expect(r.rails.placements).toHaveLength(2);
 expect(r.parts[0].placements.map(f=>f.translation)).toEqual(Array.from({length:12},(_,i)=>[0,1.5,i-6]));
 const mesh=packRails(r.rails,r.stations,section.length);
 for(let c=0;c<3;c++) {const v=Array.from(mesh.vertices).filter((_,i)=>i%8===c);expect(Math.min(...v)).toBeCloseTo([-.76,1.44,-6][c],6);expect(Math.max(...v)).toBeCloseTo([.76,1.56,6][c],6);}
 const s=constructDemo({...a,witness:'station'},section,tie,fitting,post);
 // Original origins s=0..11, excluded [4.2,7.8): remove 5,6,7, never restart phase.
 expect(s.parts[0].placements.map(f=>f.translation[2])).toEqual([-6,-5,-4,-3,-2,2,3,4,5]);
 expect(s.parts[1].placements.map(f=>f.translation[2])).toEqual([-1.8000000000000007,1.8000000000000007]);
 expect(s.construction.placements).toHaveLength(13);
},TIMEOUT.cheap);

test('inspectable support and static composition retain bounded explicit ownership',()=>{
 const r=constructDemo({...a,witness:'supports'},section,tie,fitting,post);
 expect(r.parts[2].placements.map(f=>f.translation)).toEqual([[0,0,-4],[0,0,4]]);
 const s=constructDemo({...a,witness:'switch'},section,tie,fitting,post);
 expect(s.rails.placements).toHaveLength(0);expect(s.construction.placements).toHaveLength(7);
 expect(s.construction.placements.map(p=>p.frame.translation)).toEqual([[0,1.5,-2],[0,1.5,-1],[-.5,1.5,0],[-1,1.5,1],[.5,1.5,0],[1,1.5,1],[0,1.5,0]]);
 expect(new Set(s.construction.placements.map(p=>p.content.snapshot)).size).toBe(2);
},TIMEOUT.cheap);

test('recorded adapter retains source station poses, explicit SLERP and closed-domain refusal, not clamped nlerp',()=>{
 const p=assemblyPath('loop'),i=100, raw=recorded[i];
 expect(p.distances).toEqual(recorded.map(r=>r[0]));
 expect(p.positions[i][1]).toBe(raw[2]+1.5);
 const apex=recorded.reduce((a,b)=>b[2]>a[2]?b:a)[1];
 expect(p.positions[i]).toEqual([-raw[1]+apex,raw[2]+1.5,-raw[3]-4.3]);
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
 const r=constructDemo(a,section,tie,fitting,post), before=JSON.stringify(resolvedNative(r.construction));
 const packed=packRails(r.rails,r.stations,section.length,s=>[s/12,0,0,1]);
 expect(packed.color!.length).toBe(packed.vertices.length/2);expect(packed.color![0]).toBe(0);
 expect(JSON.stringify(resolvedNative(r.construction))).toBe(before);
 expect(resolvedNative(r.construction).meshes.every((m:any)=>m.primitives.every((p:any)=>p.attributes.COLOR_0===undefined))).toBe(true);
},TIMEOUT.cheap);

test('construction controls keep history and deterministic camera/replacement decisions on CPU',()=>{
 const initial={...initialConfiguration,example:'assembly' as const,assembly:a};
 const edited={...initial,assembly:{...a,spacing:.5}};
 const h=commit(preview(history(initial),edited));
 expect(undo(h).present).toEqual(initial);expect(redo(undo(h)).present).toEqual(edited);
 expect(changesSubject(undefined,initial)).toBe(true);expect(changesSubject(initial,edited)).toBe(false);
 expect(geometryKey(initial)).not.toBe(geometryKey(edited));
 for(const next of [{...a,path:'loop' as const},{...a,witness:'station' as const}]) expect(changesSubject(initial,{...initial,assembly:next})).toBe(true);
 expect(changesSubject(initial,{...initial,appearance:'normal-force'})).toBe(false);
 expect(geometryKey(initial)).toBe(geometryKey({...initial,paint:{...initial.paint,rails:'#123456'}}));
},TIMEOUT.cheap);
