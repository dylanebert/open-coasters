import { expect, test } from 'bun:test';
import { parseDocument, registry } from '../../../construction/kernel';
import { frame, ids, instance, nominal, standardRegistry, standardTypes, standardOperations } from '../../../construction/geometry';
import { contentValue, nativeSnapshot, resolvedNative, type Construction } from '../../../construction/native';
import { planeId, planeSupports, planeType, supportRegistry } from '../../../construction/plane-supports';
import { staticSwitch } from '../../../construction/static-switch';
const supportSource = await Bun.file(new URL('../../../construction/plane-supports.json',import.meta.url)).text();
const selectedNative = await Bun.file(new URL('../../../construction/witness/resolved-supports.gltf',import.meta.url)).json();
const switchSource = await Bun.file(new URL('../../../construction/static-switch.json',import.meta.url)).text();
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
 return {inputs:{attachments:{type:{list:nominal(ids.frame)},value:attachments},terrain:{type:nominal(planeId),value:terrain},post:{type:nominal(ids.content),value:content}}};
}
// Independent raw native oracle for these identity-authored/translated fixtures.
// No snapshot decoder, geometry helpers, or source execution participates in reading.
function raw(doc:any) {
 const buffers=doc.buffers.map((b:any)=>new DataView(Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0)).buffer));
 const out:number[][]=[];
 function visit(i:number,t:number[]) {
  const n=doc.nodes[i], p=t.map((x,c)=>x+(n.translation?.[c]??0));
  if(n.mesh!==undefined) for(const primitive of doc.meshes[n.mesh].primitives) {
   const a=doc.accessors[primitive.attributes.POSITION],v=doc.bufferViews[a.bufferView];
   for(let j=0;j<a.count;j++) out.push([0,1,2].map(c=>p[c]+buffers[v.buffer].getFloat32((v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??12)+c*4,true)));
  }
  (n.children??[]).forEach((c:number)=>visit(c,p));
 }
 doc.scenes[doc.scene].nodes.forEach((i:number)=>visit(i,[0,0,0])); return out;
}
test('exact extension signature and local supported switch list graph',()=>{
 expect(planeSupports.operation).toBe('example.planeSupports@1');
 expect(planeSupports.inputs).toEqual([{name:'attachments',type:{list:{id:'cc.frame@1'}}},{name:'terrain',type:{id:'example.plane@1'}},{name:'post',type:{id:'cc.content@1'}}]);
 expect(planeSupports.outputs).toEqual([{name:'construction',type:{id:'cc.construction@1'}}]);
 const d=parseDocument(switchSource),g=d.groups[0];
 expect(g.operation).toBe('example.staticSwitch@1');
 expect(g.graph.inputs).toEqual(['approach','left','right','custom'].map(name=>({name,type:{id:'cc.construction@1'}})));
 expect(g.graph.nodes).toEqual([{id:'join',operation:'cc.join@1',inputs:{constructions:{list:['approach','left','right','custom'].map(input=>({input}))}}}]);
 expect(g.graph.outputs).toEqual([{name:'construction',type:{id:'cc.construction@1'},binding:{node:'join',output:'construction'}}]);
},1000);
test('installed support owns reused immutable native post and independent bases/top landmarks',()=>{
 const f=post(), before=JSON.stringify(f.doc), bytes=Array.from(f.data);
 const result=supportRegistry().evaluate(parseDocument(supportSource),invocation(f.content)).construction as Construction;
 expect(Object.keys(result)).toEqual(['placements']);
 expect(result.placements.map(p=>p.frame)).toEqual([pose(0,0,0),pose(0,0,4)]);
 expect(result.placements.every(p=>p.content.snapshot===f.content.snapshot)).toBe(true);
 const native=resolvedNative(result), points=raw(native);
 expect(native.meshes.length).toBe(1); expect(native.buffers.length).toBe(1); expect(points.length).toBe(72);
 for(const z of [0,4]) for(const y of [0,1.5]) expect(points).toContainEqual([Math.fround(.05),y,z+Math.fround(.05)]);
 expect(JSON.stringify(f.doc)).toBe(before); expect(Array.from(f.data)).toEqual(bytes);
 f.data.fill(99); expect(raw(resolvedNative(result))).toEqual(points);
 expect(Object.isFrozen(result.placements)).toBe(true); expect(Object.isFrozen(f.content.snapshot.buffers[0])).toBe(true);
},1000);
test('source execution capabilities are separate from explicitly selected native reading; no fallback',()=>{
 const input=invocation(),doc=parseDocument(supportSource);
 const native=selectedNative;
 expect(raw(resolvedNative(supportRegistry().evaluate(doc,input).construction as Construction))).toEqual(raw(native));
 for(const r of [standardRegistry(),registry(standardTypes,[...standardOperations,planeSupports]),registry([...standardTypes,planeType],standardOperations)]) {
  let result:unknown, error:any; try { result=r.evaluate(doc,input); } catch(e) { error=e; }
  expect(error.category).toBe('unsupported'); expect(result).toBeUndefined();
 }
 // Read selected ordinary native artifact even when no operation/type is installed.
 expect(raw(native).length).toBe(72);
 expect(native.scenes[0].nodes.map((i:number)=>native.nodes[i].translation)).toEqual([[0,0,0],[0,0,4]]);
 expect(Math.min(...raw(native).map(p=>p[1]))).toBe(0); expect(Math.max(...raw(native).map(p=>p[1]))).toBe(1.5);
 const resources=native.buffers.map((b:any)=>Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0)));
 expect(nativeSnapshot(native,resources).document.scene).toBe(0);
},1000);
test('incompatible height/orientation/plane/selected post refuse atomically, including a bad second attachment',()=>{
 const good=post().content;
 const cases=[invocation(post(2).content),invocation(good,[pose(0,1.5,0),pose(0,2,4)]),invocation(good,[frame({translation:[0,1.5,0],rotation:[0,1,0,0]})]),invocation(good,undefined,{point:[0,0,0],normal:[0,0,1]}),invocation(good,undefined,{point:[0,0,0],normal:[0,2,0]})];
 const transformed=post(); transformed.doc.nodes[0]= {...transformed.doc.nodes[0],translation:[0,.1,0]} as any;
 cases.push(invocation(contentValue({snapshot:nativeSnapshot(transformed.doc,[transformed.data.buffer])})));
 for(const input of cases) { let result:unknown; expect(()=>{result=supportRegistry().evaluate(parseDocument(supportSource),input);}).toThrow(); expect(result).toBeUndefined(); }
},1000);
test('native compatibility uses selected bytes and transforms, not metadata or unselected meshes',()=>{
 const wrong=post(); wrong.data[0]=.2;
 (wrong.doc.accessors[0] as any).min=[-.05,0,-.05]; (wrong.doc.accessors[0] as any).max=[.05,1.5,.05];
 const malformed=contentValue({snapshot:nativeSnapshot(wrong.doc,[wrong.data.buffer])});
 expect(()=>supportRegistry().evaluate(parseDocument(supportSource),invocation(malformed))).toThrow('incompatible diagnostic post dimensions');
 const f=post();
 // An unselected, incompatible authored copy is not part of the post selection.
 (f.doc.nodes as any[]).push({mesh:0,translation:[0,100,0]});
 (f.doc.scenes as any[]).push({nodes:[1]});
 const selected=contentValue({snapshot:nativeSnapshot(f.doc,[f.data.buffer])});
 const result=supportRegistry().evaluate(parseDocument(supportSource),invocation(selected,[pose(2,4.5,8)],{point:[7,3,9],normal:[0,1,0]})).construction as Construction;
 expect(result.placements.map(p=>p.frame.translation)).toEqual([[2,3,8]]);
},1000);
test('parameterized switch owns seven ordered placements, shared approach once, custom ordinary content',()=>{
 for(const offset of [0,10]) {
  const a=post().content,b=post().content;
  const approach=instance(a,[pose(0,0,offset),pose(0,0,offset+1)]),left=instance(a,[pose(-1,0,offset+2),pose(-2,0,offset+3)]),right=instance(a,[pose(1,0,offset+2),pose(2,0,offset+3)]),custom=instance(b,[pose(.2,.3,offset+2)]);
  const result=staticSwitch(switchSource,{approach,left,right,custom});
  expect(result.placements.map(p=>p.frame.translation)).toEqual([[0,0,offset],[0,0,offset+1],[-1,0,offset+2],[-2,0,offset+3],[1,0,offset+2],[2,0,offset+3],[.2,.3,offset+2]]);
  expect(result.placements.map(p=>p.content.snapshot)).toEqual([a,a,a,a,a,a,b].map(c=>c.snapshot));
  const native=resolvedNative(result); expect(native.scenes[0].nodes.length).toBe(7); expect(native.meshes.length).toBe(2); expect(raw(native).length).toBe(252);
  expect(raw(native)).toContainEqual([.2+Math.fround(.05),1.8,offset+2+Math.fround(.05)]);
  expect(approach.placements.length).toBe(2); expect(left.placements.length).toBe(2);
  // No inferred deduplication: deliberate repeated ownership remains repeated.
  expect(staticSwitch(switchSource,{approach,left:approach,right,custom}).placements.length).toBe(7);
 }
},1000);
