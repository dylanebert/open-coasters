import {test,expect} from 'bun:test';
import sharp from 'sharp';
import {palettes} from './profile-plate';
import {wallColors} from './profile-extrusion';
import {readFileSync,mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import {plate} from './plate';
import {walls,railOrigin,oppositeOrigin,railEnd,view,registration,identity,inputs,assertEvidence} from './profile-extrusion';
import {sha256} from './profile-evidence';
import {contour,profileView,project} from './profile-plate';
import {contextPlate,tieOffsets} from './tie-context';

test('all twelve uncapped wall corners preserve canonical rail-sized XY and straight ends',()=>{
 const m=walls();expect(m.vertices.length).toBe(48*8);expect(m.indices.length).toBe(144);
 for(let i=0;i<12;i++)for(let corner=0;corner<4;corner++){
  const angle=((corner===1||corner===2)?(i+1)%12:i)*Math.PI/6;
  const expected=[.03*Math.cos(angle),.03*Math.sin(angle),corner<2?0:-1.95];
  for(let axis=0;axis<3;axis++)expect(m.vertices[(i*4+corner)*8+axis]).toBeCloseTo(expected[axis]!,7);
 }
 for(let i=0;i<m.indices.length;i+=3){const ids=Array.from(m.indices.slice(i,i+3));expect(new Set(ids.map(id=>m.vertices[id*8+2])).size).toBe(2);expect(new Set(ids.map(id=>Math.floor(id/4))).size).toBe(1);}
 expect(()=>walls(contour(),0)).toThrow();expect(railEnd).toBe(-1.2);
 for(const p of contour()){const q=project(p,profileView());expect(q[0]).toBeCloseTo(600+p[0]*650/.092,8);expect(q[1]).toBeCloseTo(325-p[1]*650/.092,8);}
});

test('reference camera, one foreground rail, rigid ghost ties and origin registration',()=>{
 const data=inputs(),p=view();const {asset:referenceAsset,origin:referenceOrigin,axes:referenceAxes,...reference}=contextPlate();
 const {asset,origin,axes,...frame}=p;expect(frame).toEqual(reference);expect([p.width,p.height,p.size]).toEqual([1200,650,.94]);
 expect(data.foregroundRails).toBe(1);expect(data.ties.ghosted).toBe(true);expect(data.ties.placements).toEqual(tieOffsets.map(z=>[0,0,z]));
 expect(railOrigin).toEqual([-.5,.065,.75]);expect(oppositeOrigin).toEqual([.5,.065,.75]);expect(p.origin).toEqual(railOrigin);
 for(const [axis,end] of p.axes.entries())for(let i=0;i<3;i++){
  if(i===axis)expect(end[i]!-p.origin[i]!).toBeGreaterThan(0);
  else expect(end[i]).toBe(p.origin[i]);
 }
 const r=registration(),back=p.camera.map((x,i)=>x-p.target[i]!);const n=Math.hypot(...back),b=back.map(x=>x/n),rn=Math.hypot(b[2]!,b[0]!);
 const right=[b[2]!/rn,0,-b[0]!/rn],up=[-b[1]!*b[0]!/rn,rn,-b[1]!*b[2]!/rn];
 for(const [i,v] of [p.origin,...p.axes].entries()){
  const d=v.map((x,j)=>x-p.target[j]!),expected=[600+d.reduce((s,x,j)=>s+x*right[j]!,0)*650/1.88,325-d.reduce((s,x,j)=>s+x*up[j]!,0)*650/1.88],actual=[r.origin,...r.axes][i]!;
  expect(actual[0]).toBeCloseTo(expected[0]!,8);expect(actual[1]).toBeCloseTo(expected[1]!,8);
 }
});

test('identical resource bytes relocated to a different checkout keep native identity',()=>{
 const root=mkdtempSync(join(tmpdir(),'profile-relocated-'));
 try{
  const asset=plate().asset,gltf=readFileSync(asset),json=JSON.parse(gltf.toString()),relocated=join(root,'other-checkout/demo/public/assets/blitz-tie.gltf');
  mkdirSync(dirname(relocated),{recursive:true});writeFileSync(relocated,gltf);
  for(const b of json.buffers){const dest=join(dirname(relocated),b.uri);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(new URL(b.uri,asset)));}
  expect(inputs(pathToFileURL(relocated))).toEqual(inputs());expect(identity(inputs(pathToFileURL(relocated)))).toBe(identity());
  const bufferPath=join(dirname(relocated),json.buffers[0].uri),bytes=readFileSync(bufferPath);bytes[0]^=1;writeFileSync(bufferPath,bytes);
  expect(identity(inputs(pathToFileURL(relocated)))).not.toBe(identity());
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('actual geometry, placement, native resource and view corruptions invalidate identity',()=>{
 const data=inputs(),raw=Buffer.from('native fixture'),name='raw.png',e={nativeIdentity:identity(),sha256:{[name]:sha256(raw)}};
 assertEvidence(e,raw,name);
 const mutations=[(d:typeof data)=>{d.walls.vertices[0]!+=.01;},(d:typeof data)=>{d.contour[0]=[.04,0,0];},(d:typeof data)=>{d.view.size+=.1;},(d:typeof data)=>{d.ties.placements[0]![2]!+=.1;},(d:typeof data)=>{d.ties.buffers[0]!.sha256='changed';}];
 for(const mutate of mutations){const changed=structuredClone(data);mutate(changed);expect(identity(changed)).not.toBe(identity());expect(()=>assertEvidence({...e,nativeIdentity:identity(changed)},raw,name)).toThrow('Stale');}
 expect(()=>assertEvidence(e,Buffer.from('corrupt'),name)).toThrow('hash');
});

test('real native themes show foreground rail and ghost opposite rail at projected locations',async()=>{
 for(const theme of ['light','dark'] as const){
  const {data,info}=await sharp(new URL(`../../assets/figures/profile-extrusion-${theme}-raw.png`,import.meta.url).pathname).raw().toBuffer({resolveWithObject:true});
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const ink=rgb(wallColors[theme]),bg=rgb(palettes[theme].bg);
  // Probe between ties: a ghost tie must not masquerade as the opposite rail.
  for(const [x,foreground] of [[-.5,true],[.5,false]] as const){const q=project([x,.065,-.45],view());let found=false;
   for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){const c=[0,1,2].map(k=>data[((Math.round(q[1]!)+dy)*info.width+Math.round(q[0]!)+dx)*info.channels+k]!);
    if(foreground?c.every((v,k)=>Math.abs(v-ink[k]!)<3):c.some((v,k)=>Math.abs(v-bg[k]!)>8)&&c.every((v,k)=>Math.abs(v-ink[k]!)>15))found=true;
   }expect(found).toBe(true);
  }
 }
});

test('committed native and final receipts match current inputs and bytes',()=>{
 const root=new URL('../../assets/figures/',import.meta.url),e=JSON.parse(readFileSync(new URL('profile-extrusion-capture.json',root),'utf8'));
 expect(e.nativeIdentity).toBe(identity());expect(e.inputs).toEqual(inputs());
 for(const [name,hash] of Object.entries(e.sha256))expect(sha256(readFileSync(new URL(name,root)))).toBe(hash);
 expect(e.captures.every((c:any)=>c.adapter.class==='real')).toBe(true);
});
