import { TIMEOUT } from "@dylanebert/shallot/testing";
import { expect, test } from 'bun:test';
import { frame, instance, join, path } from '../../../construction/geometry';
import { normalTrack } from '../../../construction/normal-track';
import { sampledSection } from '../../../construction/section';
import { materialValue } from '../../../construction/sweep';
import { twoPieceFixture } from '../../../examples/two-piece-fixture';
import { contentValue, nativeSnapshot, resolvedNative } from '../../../construction/native';
import { planeSupports } from '../../../construction/plane-supports';
import { staticSwitch } from '../../../construction/static-switch';
const selectedNative = await Bun.file(new URL('../../../construction/witness/resolved-supports.gltf',import.meta.url)).json();

const pose = (x:number,y:number,z:number) => frame({translation:[x,y,z],rotation:[0,0,0,1]});
// Authored native box evidence: six quad faces, expanded into ordinary triangles.
function post(height=1.5) {
 const corners=[[-.05,0,-.05],[.05,0,-.05],[.05,height,-.05],[-.05,height,-.05],[-.05,0,.05],[.05,0,.05],[.05,height,.05],[-.05,height,.05]];
 const quads=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
 const data=new Float32Array(quads.flatMap(([a,b,c,d])=>[a,b,c,a,c,d].flatMap(i=>corners[i])));
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:data.byteLength}],bufferViews:[{buffer:0,byteLength:data.byteLength}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:36}]};
 return {content:contentValue({snapshot:nativeSnapshot(doc,[data.buffer])}),doc,data};
}
function invocation(content=post().content, attachments=[pose(0,1.5,0),pose(0,1.5,4)], terrain:any={point:[0,0,0],normal:[0,1,0]}) {
 return [attachments,terrain,content] as const;
}
// Independent raw native oracle for these identity-authored/translated fixtures.
// No snapshot decoder, geometry helpers, or source execution participates in reading.
function rawRoots(doc:any): number[][][] {
 const buffers=doc.buffers.map((b:any)=>new DataView(Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0)).buffer));
 function visit(i:number,t:number[],out:number[][]) {
  const n=doc.nodes[i], p=t.map((x,c)=>x+(n.translation?.[c]??0));
  if(n.mesh!==undefined) for(const primitive of doc.meshes[n.mesh].primitives) {
   const a=doc.accessors[primitive.attributes.POSITION],v=doc.bufferViews[a.bufferView];
   for(let j=0;j<a.count;j++) out.push([0,1,2].map(c=>p[c]+buffers[v.buffer].getFloat32((v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??12)+c*4,true)));
  }
  (n.children??[]).forEach((c:number)=>visit(c,p,out));
 }
 return doc.scenes[doc.scene].nodes.map((i:number)=>{
  const out:number[][]=[];
  visit(i,[0,0,0],out);
  return out;
 });
}
const raw = (doc:any) => rawRoots(doc).flat();
test('native support owns reused immutable native post and independent bases/top landmarks',()=>{
 const f=post(), before=JSON.stringify(f.doc), bytes=Array.from(f.data);
 const result=planeSupports(...invocation(f.content));
 expect(raw(resolvedNative(result))).toEqual(raw(selectedNative));
 expect(Object.keys(result)).toEqual(['placements']);
 expect(result.placements.map(p=>p.frame)).toEqual([pose(0,0,0),pose(0,0,4)]);
 expect(result.placements.every(p=>p.content.snapshot===f.content.snapshot)).toBe(true);
 const native=resolvedNative(result), points=raw(native);
 expect(native.meshes.length).toBe(1); expect(native.buffers.length).toBe(1); expect(points.length).toBe(72);
 for(const z of [0,4]) for(const y of [0,1.5]) expect(points).toContainEqual([Math.fround(.05),y,z+Math.fround(.05)]);
 expect(JSON.stringify(f.doc)).toBe(before); expect(Array.from(f.data)).toEqual(bytes);
 f.data.fill(99); expect(raw(resolvedNative(result))).toEqual(points);
 expect(Object.isFrozen(result.placements)).toBe(true); expect(Object.isFrozen(f.content.snapshot.buffers[0])).toBe(true);
}, TIMEOUT.cheap);
test('selected native witness can be read without executing a recipe',()=>{
 const native=selectedNative;
 expect(raw(native).length).toBe(72);
 expect(native.scenes[0].nodes.map((i:number)=>native.nodes[i].translation)).toEqual([[0,0,0],[0,0,4]]);
 expect(Math.min(...raw(native).map(p=>p[1]))).toBe(0); expect(Math.max(...raw(native).map(p=>p[1]))).toBe(1.5);
 const resources=native.buffers.map((b:any)=>Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0)));
 expect(nativeSnapshot(native,resources).document.scene).toBe(0);
}, TIMEOUT.cheap);
test('incompatible height/orientation/plane/selected post refuse atomically, including a bad second attachment',()=>{
 const good=post().content;
 const cases=[invocation(post(2).content),invocation(good,[pose(0,1.5,0),pose(0,2,4)]),invocation(good,[frame({translation:[0,1.5,0],rotation:[0,1,0,0]})]),invocation(good,undefined,{point:[0,0,0],normal:[0,0,1]}),invocation(good,undefined,{point:[0,0,0],normal:[0,2,0]})];
 const sideways=Object.assign([0,0,1],{some:()=>false});
 cases.push(invocation(good,undefined,{point:[0,0,0],normal:sideways}));
 cases.push(invocation(good,{} as any));
 for(const bad of [{translation:[Infinity,1.5,4],rotation:[0,0,0,1]}, {translation:[0,1.5,4],rotation:[0,0,0,2]}, {translation:[0,1.5,4],rotation:[0,0,NaN,1]}]) {
  cases.push(invocation(good,[pose(0,1.5,0),bad]));
 }
 cases.push(invocation(good,undefined,{point:[NaN,0,0],normal:[0,1,0]}));
 const transformed=post(); transformed.doc.nodes[0]= {...transformed.doc.nodes[0],translation:[0,.1,0]} as any;
 cases.push(invocation(contentValue({snapshot:nativeSnapshot(transformed.doc,[transformed.data.buffer])})));
 for(const input of cases) { let result:unknown; expect(()=>{result=planeSupports(...input);}).toThrow(); expect(result).toBeUndefined(); }
}, TIMEOUT.cheap);
test('native compatibility uses selected bytes and transforms, not metadata or unselected meshes',()=>{
 const wrong=post(); wrong.data[0]=.2;
 (wrong.doc.accessors[0] as any).min=[-.05,0,-.05]; (wrong.doc.accessors[0] as any).max=[.05,1.5,.05];
 const malformed=contentValue({snapshot:nativeSnapshot(wrong.doc,[wrong.data.buffer])});
 expect(()=>planeSupports(...invocation(malformed))).toThrow('incompatible diagnostic post dimensions');
 const f=post();
 // An unselected, incompatible authored copy is not part of the post selection.
 (f.doc.nodes as any[]).push({mesh:0,translation:[0,100,0]});
 (f.doc.scenes as any[]).push({nodes:[1]});
 const selected=contentValue({snapshot:nativeSnapshot(f.doc,[f.data.buffer])});
 const result=planeSupports(...invocation(selected,[pose(2,4.5,8)],{point:[7,3,9],normal:[0,1,0]}));
 expect(result.placements.map(p=>p.frame.translation)).toEqual([[2,3,8]]);
}, TIMEOUT.cheap);
test('parameterized switch owns seven ordered placements, shared approach once, custom ordinary content',()=>{
 for(const offset of [0,10]) {
  const a=post().content,b=post().content;
  const approach=instance(a,[pose(0,0,offset),pose(0,0,offset+1)]),left=instance(a,[pose(-1,0,offset+2),pose(-2,0,offset+3)]),right=instance(a,[pose(1,0,offset+2),pose(2,0,offset+3)]),custom=instance(b,[pose(.2,.3,offset+2)]);
  const result=staticSwitch({approach,left,right,custom});
  expect(result.placements.map(p=>p.frame.translation)).toEqual([[0,0,offset],[0,0,offset+1],[-1,0,offset+2],[-2,0,offset+3],[1,0,offset+2],[2,0,offset+3],[.2,.3,offset+2]]);
  expect(result.placements.map(p=>p.content.snapshot)).toEqual([a,a,a,a,a,a,b].map(c=>c.snapshot));
  const native=resolvedNative(result); expect(native.scenes[0].nodes.length).toBe(7); expect(native.meshes.length).toBe(2); expect(raw(native).length).toBe(252);
  expect(raw(native)).toContainEqual([.2+Math.fround(.05),1.8,offset+2+Math.fround(.05)]);
  expect(approach.placements.length).toBe(2); expect(left.placements.length).toBe(2);
  // No inferred deduplication: deliberate repeated ownership remains repeated.
  expect(staticSwitch({approach,left:approach,right,custom}).placements).toEqual([
   ...approach.placements,...approach.placements,...right.placements,...custom.placements,
  ]);
  expect(() => staticSwitch({approach,left,right,custom:{ placements: [{content:b,frame:{translation:[NaN,0,0],rotation:[0,0,0,1]}}] }})).toThrow('finite number required');
 }
}, TIMEOUT.cheap);

test('two static native snapshots move both fixture-local track pieces and only those pieces', async () => {
 const assets = new URL('../../public/assets/', import.meta.url);
 const load = async (name: string) => [
  await Bun.file(new URL(`${name}.gltf`, assets)).json(),
  [await Bun.file(new URL(`${name}.bin`, assets)).arrayBuffer()],
 ] as const;
 const section = sampledSection(...await load('assembly-section'));
 const tieSnapshot = nativeSnapshot(...await load('assembly-tie-bar'));
 const steel = materialValue({ snapshot: tieSnapshot, material: 0 });
 const I = [0,0,0,1];
 const track = (x: number, z: number) => normalTrack({
  path: path({ distances:[0,1], positions:[[x,1.5,z],[x,1.5,z-1]], rotations:[I,I] }),
  section, tieContent:contentValue({ snapshot:tieSnapshot }), separation:1.4, spacing:1, wall:steel, cap:steel,
 });
 // Separate stations identify each owner's geometry; these are not connected routes.
 const extension = track(7,-9);
 const fixed = staticSwitch({ approach:track(0,6), left:track(-4,-6), right:track(4,-6), custom:extension });
 const pieces = [track(0,0), track(2,-3)] as const;
 const bounds = (points: number[][]) => {
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const axes = [0,1,2].map(i => points.map(p => p[i]));
  return [axes.map(a => round(Math.min(...a))), axes.map(a => round(Math.max(...a)))];
 };
 const fixedBounds = [
  [[-.76,1.44,5],[-.64,1.56,6]], [[.64,1.44,5],[.76,1.56,6]], [[-.95,1.32,5.91],[.95,1.44,6.09]],
  [[-4.76,1.44,-7],[-4.64,1.56,-6]], [[-3.36,1.44,-7],[-3.24,1.56,-6]], [[-4.95,1.32,-6.09],[-3.05,1.44,-5.91]],
  [[3.24,1.44,-7],[3.36,1.56,-6]], [[4.64,1.44,-7],[4.76,1.56,-6]], [[3.05,1.32,-6.09],[4.95,1.44,-5.91]],
  [[6.24,1.44,-10],[6.36,1.56,-9]], [[7.64,1.44,-10],[7.76,1.56,-9]], [[6.05,1.32,-9.09],[7.95,1.44,-8.91]],
 ];
 const snapshots = [
  { x:0, landmarks:[
   [[-.76,1.44,-1],[-.64,1.56,0]], [[.64,1.44,-1],[.76,1.56,0]], [[-.95,1.32,-.09],[.95,1.44,.09]],
   [[1.24,1.44,-4],[1.36,1.56,-3]], [[2.64,1.44,-4],[2.76,1.56,-3]], [[1.05,1.32,-3.09],[2.95,1.44,-2.91]],
  ] },
  { x:-2, landmarks:[
   [[-2.76,1.44,-1],[-2.64,1.56,0]], [[-1.36,1.44,-1],[-1.24,1.56,0]], [[-2.95,1.32,-.09],[-1.05,1.44,.09]],
   [[-.76,1.44,-4],[-.64,1.56,-3]], [[.64,1.44,-4],[.76,1.56,-3]], [[-.95,1.32,-3.09],[.95,1.44,-2.91]],
  ] },
 ];
 for (const { x, landmarks } of snapshots) {
  const native = resolvedNative(join([fixed, twoPieceFixture(pose(x,0,0), pieces)]));
  expect(rawRoots(native).map(bounds)).toEqual([...fixedBounds, ...landmarks]);
 }
}, TIMEOUT.cheap);

test('support attachments and fixture piece lists require own slots in arrays', () => {
 const [attachments,terrain,content] = invocation();
 const inherited = <T>(values: readonly T[]) => Object.setPrototypeOf(Array(values.length), values) as T[];
 const arrayLike = <T>(values: readonly T[]) => Object.assign(Object.create(values), {length:values.length});
 expect(planeSupports([],terrain,content).placements).toEqual([]);
 for (const list of [inherited(attachments), arrayLike(attachments)]) expect(()=>planeSupports(list,terrain,content)).toThrow();
 const piece = instance(content,[pose(0,0,0)]);
 const pieces = [piece,piece] as const;
 for (const list of [inherited(pieces), arrayLike(pieces)]) expect(()=>twoPieceFixture(pose(0,0,0),list as typeof pieces)).toThrow();
 expect(()=>twoPieceFixture(pose(0,0,0),[] as unknown as typeof pieces)).toThrow();
}, TIMEOUT.cheap);
