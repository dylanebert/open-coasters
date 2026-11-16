import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CameraMode } from '@dylanebert/shallot';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { contour, sourceUrl, profileView, strokes, overlay, project, palettes, cameraConfiguration, cameraTransform } from './profile-plate';
const key=(p:readonly number[])=>p.slice(0,2).map(n=>n.toFixed(6)).join(',');
function verify(points:ReturnType<typeof contour>) {
  // Independent qualified delivery: accessor bytes and directed triangle edges, no demo reader.
  const url=new URL('../../demo/public/assets/ModernSpine_1.gltf',import.meta.url),j=JSON.parse(readFileSync(url,'utf8'));
  const buffers=j.buffers.map((b:any)=>readFileSync(new URL(b.uri,url)));
  function accessor(n:number) {
    const a=j.accessors[n],v=j.bufferViews[a.bufferView],b=buffers[v.buffer],count=a.type==='VEC3'?3:1,bytes=a.componentType===5126?4:a.componentType===5125?4:2;
    return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,c)=>{const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??count*bytes)+c*bytes;return a.componentType===5126?b.readFloatLE(offset):bytes===4?b.readUInt32LE(offset):b.readUInt16LE(offset);}));
  }
  const expected:string[]=[];
  for(const primitive of j.meshes[0].primitives) {
    const positions=accessor(primitive.attributes.POSITION),ids=accessor(primitive.indices).flat();
    for(let i=0;i<ids.length;i+=3) for(let k=0;k<3;k++) {
      const a=positions[ids[i+k]]!,b=positions[ids[i+(k+1)%3]]!;
      if(Math.abs(a[2]!+.05)<1e-6&&Math.abs(b[2]!+.05)<1e-6) expected.push(`${key(a)}>${key(b)}`);
    }
  }
  expect(expected).toHaveLength(24);
  expect(points.map((a,i)=>`${key(a)}>${key(points[(i+1)%24]!)}`).sort()).toEqual(expected.sort());
}
test('archived directed matching ends retain exact XY and agree with qualified delivery',()=>{
  const points=contour();expect(points).toHaveLength(24);verify(points);
  const archived=readFileSync(sourceUrl,'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.split(/\s+/).slice(1).map(Number));
  for(const p of points) expect(archived.some(a=>a[0]===p[0]&&a[1]===p[1]&&a[2]===-.05)).toBe(true);
  expect(Math.max(...points.map(p=>p[1]))).toBe(-.246667);
  expect(()=>verify(points.map(([x,y,z])=>[x,y+.513334,z]))).toThrow();
  const reordered=[...points];[reordered[1],reordered[2]]=[reordered[2]!,reordered[1]!];expect(()=>verify(reordered)).toThrow();
  expect(()=>contour(readFileSync(sourceUrl,'utf8').replace(/^f .*\n/m,''))).toThrow();
  const mesh=strokes();expect(mesh.indices.length).toBe(24*6);expect(mesh.vertices.length).toBe(24*4*8);
  for(let i=2;i<mesh.vertices.length;i+=8) expect(mesh.vertices[i]).toBe(0);
});
test('normal-to-XY orthographic pose, authored O and identical theme placements',()=>{
  const p=profileView();expect(p.origin).toEqual([0,0,0]);expect(cameraConfiguration(p)).toEqual({mode:CameraMode.Orthographic,size:.53,near:.1,far:10});
  const pose=cameraTransform(p);expect(pose.translation).toEqual([0,-.34,2]);expect(pose.rotation).toEqual([0,0,0,1]);
  for(const point of [[0,0,0],...contour()] as const) {
    const actual=project(point,p);expect(actual[0]).toBeCloseTo(450+point[0]*900/1.06,8);expect(actual[1]).toBeCloseTo(450-(point[1]+.34)*900/1.06,8);
  }
  expect(overlay('light').replaceAll(palettes.light.ink,'INK')).toBe(overlay('dark').replaceAll(palettes.dark.ink,'INK'));
  expect(overlay('light')).not.toContain('polygon');
  for(const match of overlay('light').matchAll(/<text x="([^"]+)" y="([^"]+)"/g)) {
    expect(Number(match[1])).toBeGreaterThan(20);expect(Number(match[1])).toBeLessThan(850);
    expect(Number(match[2])).toBeGreaterThan(20);expect(Number(match[2])).toBeLessThan(870);
  }
});
export function emptyInterior(data:Buffer,channels:number) {
  // Interior disk is strictly separated from every polygon edge, not just a center sample.
  const p=profileView(),center=project([0,-.513334,0],p);let count=0;
  for(let y=0;y<900;y++) for(let x=0;x<900;x++) if(Math.hypot(x-center[0]!,y-center[1]!)<195) {
    count++;for(let c=0;c<3;c++) if(data[(y*900+x)*channels+c]!==data[c]) throw Error('Filled profile interior');
  }
  expect(count).toBeGreaterThan(100000);
}
test('captured raw and final images have empty interiors and exact projected contour/dots',async()=>{
  const masks:Buffer[]=[];
  for(const theme of ['light','dark'] as const) for(const suffix of ['-raw','']) {
    const {data,info}=await sharp(new URL(`../../assets/figures/profile-${theme}${suffix}.png`,import.meta.url).pathname).raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([900,900]);emptyInterior(data,info.channels);
    const filled=Buffer.from(data),center=project([0,-.513334,0],profileView()),idx=(Math.round(center[1]!)*900+Math.round(center[0]!))*info.channels;filled[idx]=255-data[0]!;
    expect(()=>emptyInterior(filled,info.channels)).toThrow('Filled profile interior');
    const mask=Buffer.alloc(900*900);
    for(let i=0;i<mask.length;i++) mask[i]=[0,1,2].some(c=>data[i*info.channels+c]!==data[c])?1:0;
    for(const [i,a] of contour().entries()) {
      const b=contour()[(i+1)%24]!;
      for(const t of [0,.25,.5,.75,1]) {
        const q=project([a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t,0],profileView());let hit=false;
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) if(mask[(Math.round(q[1]!)+dy)*900+Math.round(q[0]!)+dx])hit=true;
        expect(hit).toBe(true);
      }
    }
    if(suffix==='-raw') masks.push(mask);
    else for(const a of contour()) {
      const q=project(a,profileView()),center=project([0,-.513334,0],profileView());
      const dx=q[0]!-center[0]!,dy=q[1]!-center[1]!,length=Math.hypot(dx,dy);
      // Dot extends beyond the thin stroke on both radial sides.
      for(const sign of [-1,1]) {
        const x=Math.round(q[0]!+sign*2*dx/length),y=Math.round(q[1]!+sign*2*dy/length);
        expect(mask[y*900+x]).toBe(1);
      }
    }
  }
  expect(masks[0]!.equals(masks[1]!)).toBe(true);
});
test('recorded source, delivery and image hashes identify this capture and unchanged tie',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../../assets/figures/profile-capture.json',import.meta.url),'utf8'));
  for(const [path,hash] of Object.entries(evidence.sha256)) expect(createHash('sha256').update(readFileSync(new URL(`../../${path}`,import.meta.url))).digest('hex')).toBe(hash);
});
