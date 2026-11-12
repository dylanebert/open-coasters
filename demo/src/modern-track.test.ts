import { expect, test } from 'bun:test';
import { trackGeometry, modernTies } from './modern-track';
import { defaults } from './track';
import loop from './loop-path.json';

// Independent analytic/recorded frame oracle, not production frame/sweep helpers.
function expected(kind: string, station: number, x: number, y: number, nx: number, ny: number) {
  if (kind === 'straight') return [[x, 1.5 + y, station * 12 / 192 - 6], [nx, ny, 0]];
  if (kind === 'curve') {
    const a = station * Math.PI / 384 - Math.PI / 4, b = Math.PI / 6;
    return [[8 * Math.cos(a) - 6 + (x * Math.cos(b) - y * Math.sin(b)) * Math.cos(a), 1.5 + x * Math.sin(b) + y * Math.cos(b), 8 * Math.sin(a) + (x * Math.cos(b) - y * Math.sin(b)) * Math.sin(a)], [(nx * Math.cos(b) - ny * Math.sin(b)) * Math.cos(a), nx * Math.sin(b) + ny * Math.cos(b), (nx * Math.cos(b) - ny * Math.sin(b)) * Math.sin(a)]];
  }
  const s = loop.at(-1)![0] * station / 192;
  let i = 0;
  while (i < loop.length - 2 && loop[i + 1][0] < s) i++;
  const a = loop[i], b = loop[i + 1], t = (s - a[0]) / (b[0] - a[0]);
  const sign = a.slice(4).reduce((v, q, k) => v + q * b[k + 4], 0) < 0 ? -1 : 1;
  const q = a.slice(4).map((v, k) => v * (1 - t) + sign * b[k + 4] * t);
  const norm = Math.hypot(...q); const [qx, qy, qz, qw] = q.map(v => v / norm);
  const right = [1 - 2 * (qy*qy + qz*qz), -2 * (qx*qy + qw*qz), 2 * (qx*qz - qw*qy)];
  const up = [-2 * (qx*qy - qw*qz), 1 - 2 * (qx*qx + qz*qz), -2 * (qy*qz + qw*qx)];
  const apex = loop.reduce((a,b) => a[2] > b[2] ? a : b)[1];
  const p = a.slice(1,4).map((v,k) => v * (1-t) + b[k+1]*t);
  const origin = [-p[0]+apex, p[1]+1.5, -p[2]-4.3];
  return [origin.map((v,k) => v+right[k]*x+up[k]*y), right.map((v,k) => v*nx+up[k]*ny)];
}
async function sourceEdges(name: string) {
  const v: number[][] = [], n: number[][] = [], faces: number[][][] = [];
  for (const line of (await Bun.file(new URL(`../../assets/blitz-profile/${name}.obj`, import.meta.url)).text()).split('\n')) {
    const [tag,...values] = line.trim().split(/\s+/);
    if (tag === 'v') v.push(values.map(Number));
    if (tag === 'vn') { const a=values.map(Number); n.push(a.map(x=>x/Math.hypot(...a))); }
    if (tag === 'f') faces.push(values.map(c=>c.split('/').map(x=>Number(x)-1)));
  }
  const z = Math.min(...v.map(p=>p[2]));
  return faces.flatMap(face=>face.flatMap((a,i)=> { const b=face[(i+1)%face.length]; return v[a[0]][2] === z && v[b[0]][2] === z ? [[{p:v[a[0]],n:n[a[2]]},{p:v[b[0]],n:n[b[2]]}]] : []; }));
}
const build = trackGeometry(name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
for (const configuration of ['straight','curve','loop'] as const) for (const secondSpine of [false,true]) test(`integrated source geometry: ${configuration}, second spine ${secondSpine}`,async()=>{
  const p={...defaults,configuration,fixed:true,secondSpine};
  const mesh=await build(p);
  expect(modernTies(p)).toEqual(secondSpine ? ['ModernTie_Med','ModernTie_Dense'] : ['ModernTie_Med']);
  const names=['ModernRail','ModernSpine_1',...(secondSpine?['ModernSpine_2']:[])];
  const edges=(await Promise.all(names.map(sourceEdges))).flat();
  // Locate authored wall strips by endpoint position AND normal, not by cap
  // offsets. Each strip still has its original shared edge-station topology.
  const starts=Array.from({length:mesh.vertices.length/8},(_,i)=>i*8);
  const triangles=new Set(Array.from({length:mesh.indices.length/3},(_,i)=>Array.from(mesh.indices.slice(i*3,i*3+3)).join(',')));
  for(const edge of edges){
    const start=starts.find(start=> [0,1].every(end=>{
      const e=edge[end], [pos,n]=expected(configuration,0,e.p[0],e.p[1],e.n[0],e.n[1]);
      return pos.every((v,k)=>Math.abs(v-mesh.vertices[start+end*8+k])<3e-6) && n.every((v,k)=>Math.abs(v-mesh.vertices[start+end*8+4+k])<1e-4);
    }));
    expect(start).toBeDefined();
    for(let station=0;station<192;station++) {
      const a=start!/8+station*2;
      expect(triangles.has([a,a+1,a+3].join(','))).toBe(true);
      expect(triangles.has([a,a+3,a+2].join(','))).toBe(true);
    }
    for(let station=0;station<=192;station++) for(let end=0;end<2;end++){
      const e=edge[end]; const [pos,normal]=expected(configuration,station,e.p[0],e.p[1],e.n[0],e.n[1]);
      const offset=start!+(station*2+end)*8;
      expect(pos.every((v,k)=>Math.abs(v-mesh.vertices[offset+k])<3e-6)).toBe(true);
      expect(normal.every((v,k)=>Math.abs(v-mesh.vertices[offset+4+k])<1e-4)).toBe(true);
    }
  }
  // Adjustable-only dimensions and spacing cannot deform the source sections.
  expect((await build({...p,separation:1.6,width:.6,depth:.8,spacing:1.5})).vertices).toEqual(mesh.vertices);
});
