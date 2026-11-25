import { expect, test } from 'bun:test';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { nativeSnapshot, readNative, nativeURL, snapshotBytes, contentValue, resolvedNative } from '../../../construction/native';
import { frame, instance, join } from '../../../construction/geometry';

const positions=new Float32Array([1,0,0,0,2,0,0,0,3]);
const normals=new Float32Array([0,0,1,0,0,1,0,0,1]);
function authored() {
 const material={name:'equal valued',pbrMetallicRoughness:{baseColorFactor:[.2,.4,.6,1],metallicFactor:.3,roughnessFactor:.7},emissiveFactor:[.01,.02,.03],doubleSided:true};
 return {asset:{version:'2.0'},scene:1,scenes:[{nodes:[3]},{nodes:[0,2]}],nodes:[{translation:[2,3,4],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],children:[1]},{mesh:0,translation:[1,0,0],scale:[2,3,4]},{mesh:0,translation:[-1,0,0]},{mesh:0,translation:[999,999,999]}],meshes:[{primitives:[0,1].map(material=>({attributes:{POSITION:0,NORMAL:1},material}))}],materials:[material,structuredClone(material)],buffers:[{byteLength:36,uri:'position.bin'},{byteLength:36,uri:'normal.bin'}],bufferViews:[{buffer:0,byteLength:36},{buffer:1,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5126,count:3,type:'VEC3'}]};
}
test('ordinary native export retains selected roots, authored hierarchy, identity reuse and dependent bytes independently of recipe',async()=>{
 const source=authored(), resources=[positions.buffer,normals.buffer];
 const a=nativeSnapshot(source,resources), b=nativeSnapshot(source,resources);
 const pose=frame({translation:[10,20,30],rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2]});
 const result=join([instance(contentValue({snapshot:a}),[pose,pose]),instance(contentValue({snapshot:b}),[pose])]);
 const native=resolvedNative(result);
 expect(native.scenes[0].nodes).toEqual([0,4,8]);
 expect(native.nodes[0].children).toEqual([1,3]);
 expect(native.nodes[1].children).toEqual([2]);
 expect(native.nodes[1].translation).toEqual([2,3,4]);
 expect(native.nodes[2].scale).toEqual([2,3,4]);
 expect(native.nodes[3].translation).toEqual([-1,0,0]);
 expect(native.nodes.some((n:any)=>n.translation?.includes(999))).toBe(false);
 expect(native.meshes).toHaveLength(2); expect(native.materials).toHaveLength(4); expect(native.buffers).toHaveLength(4);
 expect(native.meshes.map((m:any)=>m.primitives.map((p:any)=>p.material))).toEqual([[0,1],[2,3]]);
 expect(native.materials).toEqual([...source.materials,...source.materials]);
 for(let i=0;i<4;i++) expect(Uint8Array.from(atob(native.buffers[i].uri.split(',')[1]),c=>c.charCodeAt(0))).toEqual(new Uint8Array(resources[i%2]));
 expect(native.nodes[2].mesh).toBe(native.nodes[6].mesh); expect(native.nodes[10].mesh).not.toBe(native.nodes[2].mesh);
 // Independent renderer reader, compared against hand-computed asymmetric source landmarks.
 const read=await loadGltf(nativeURL(native)); expect(read.unsupported).toEqual([]); expect(read.instances).toHaveLength(12);
 const point=(i:number)=>{const n=read.instances[i],v=read.meshes[n.mesh].vertices,m=n.matrix;return [0,1,2].map(c=>m[c]*v[0]+m[c+4]*v[1]+m[c+8]*v[2]+m[c+12]);};
 for(const i of [0,1,4,5,8,9]) point(i).forEach((v,c)=>expect(v).toBeCloseTo([14,26,28][c],5));
 for(const i of [2,3,6,7,10,11]) point(i).forEach((v,c)=>expect(v).toBeCloseTo([10,20,30][c],5));
 const copy=snapshotBytes(a,0); copy.fill(255); expect(snapshotBytes(a,0)).toEqual(new Uint8Array(positions.buffer));
},TIMEOUT.cheap);

test('native float32-authored node rotation remains verbatim, distinct from recipe frame normalization',()=>{
 const d=authored(), q=[0,0,-0.7071068286895752,0.7071068286895752];d.nodes[0].rotation=q;
 const s=nativeSnapshot(d,[positions.buffer,normals.buffer]);
 expect(s.document.nodes[0].rotation).toEqual(q);
 expect(resolvedNative(instance(contentValue({snapshot:s}),[frame({translation:[0,0,0],rotation:[0,0,0,1]})])).nodes[1].rotation).toEqual(q);
 d.nodes[0].rotation=[0,0,0,0];expect(()=>nativeSnapshot(d,[positions.buffer,normals.buffer])).toThrow('zero native rotation');
},TIMEOUT.cheap);

test('URL adapter owns all dependencies before invocation, never rebases mutable live resources',async()=>{
 let current=positions.slice(), calls=0;
 const server=Bun.serve({port:0,fetch(request){calls++; const p=new URL(request.url).pathname; return p.endsWith('.gltf')?Response.json(authored()):new Response(p.endsWith('position.bin')?current:normals);}});
 try {
  const snapshot=await readNative(new URL('/scene.gltf',server.url)); expect(calls).toBe(3);
  current.fill(99); server.stop(true);
  const d=resolvedNative(instance(contentValue({snapshot}),[frame({translation:[0,0,0],rotation:[0,0,0,1]})]));
  expect(snapshotBytes(snapshot,0)).toEqual(new Uint8Array(positions.buffer));
  expect((await loadGltf(nativeURL(d))).instances).toHaveLength(4); expect(calls).toBe(3);
 } finally {server.stop(true);}
},TIMEOUT.cheap);

test('native reader explicitly refuses unsupported fidelity and missing dependent bytes',async()=>{
 for(const [mutate,cause] of [[(d:any)=>d.images=[{uri:'image.png'}],'images unsupported'],[(d:any)=>d.animations=[{}],'animations unsupported'],[(d:any)=>d.materials[0].alphaMode='BLEND','opaque materials required'],[(d:any)=>d.meshes[0].primitives[0].extensions={unknown:{}},'extensions unsupported']] as const) {
  const d=authored();mutate(d);expect(()=>nativeSnapshot(d,[positions.buffer,normals.buffer])).toThrow(cause);
 }
 expect(()=>nativeSnapshot(authored(),[positions.buffer])).toThrow('all declared buffers');
 const d=authored();d.buffers[1].uri='data:application/octet-stream;base64,AA==';
 await expect(readNative(nativeURL(d))).rejects.toThrow();
},TIMEOUT.cheap);

// Khronos glTF 2.0 schema: glTF.schema.json's optional collections below and
// scene.schema.json's optional nodes each have minItems: 1 when present.
function expectNativeCollectionShape(wire: unknown) {
 const json = JSON.parse(JSON.stringify(wire));
 for (const key of ['accessors','buffers','bufferViews','materials','meshes','nodes','scenes']) {
  if (key in json) expect(json[key].length).toBeGreaterThanOrEqual(1);
 }
 expect(json.scenes[json.scene]).toBeDefined();
 for (const scene of json.scenes) if ('nodes' in scene) expect(scene.nodes.length).toBeGreaterThanOrEqual(1);
 return json;
}

test('native export writes a valid empty selected scene without empty optional arrays', async () => {
 const native = resolvedNative(join([]));
 expect(expectNativeCollectionShape(native)).toEqual({asset:{version:'2.0'},scene:0,scenes:[{}]});
 // This is glTF, but not geometry-bearing part input.
 await expect(readNative(nativeURL(native))).rejects.toThrow('nonempty selected roots required');
}, TIMEOUT.cheap);

test('native export omits materials when none are authored and keeps used collections', async () => {
 const {materials: _, ...source} = authored();
 const meshes = source.meshes.map(mesh => ({primitives:mesh.primitives.map(({material: _, ...primitive}) => primitive)}));
 const snapshot = nativeSnapshot({...source,meshes},[positions.buffer,normals.buffer]);
 const pose = frame({translation:[0,0,0],rotation:[0,0,0,1]});
 const native = resolvedNative(instance(contentValue({snapshot}),[pose]));
 const json = expectNativeCollectionShape(native);
 expect(json).not.toHaveProperty('materials');
 expect(json.scenes[0].nodes).toEqual([0]);
 expect(json.meshes).toEqual(meshes);
 expect(json.accessors).toHaveLength(2);
 expect(json.bufferViews).toHaveLength(2);
 expect(json.buffers).toHaveLength(2);
 expect((await loadGltf(nativeURL(native))).instances).toHaveLength(4);
}, TIMEOUT.cheap);
