import { expect, test } from 'bun:test';
import { defaults, generate, type Configuration } from './track';
import { trackGeometry } from './modern-track';
import { sweepProfile } from './profile-sweep';
import type { Profile } from './profile';
import loop from './loop-path.json';

// This oracle knows no triangulation or vertex/index layout. Boundary cancellation
// against the emitted walls checks every endpoint, including disconnected sections.
type P = number[];
type T = P[];
const sub = (a:P,b:P)=>a.map((v,i)=>v-b[i]);
const cross = (a:P,b:P)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a:P,b:P)=>a.reduce((s,v,i)=>s+v*b[i],0);
const key = (p:P)=>p.map(Math.fround).join(',');
function closure(triangles:T[], expectedLoops:number) {
  const edges = new Map<string, {a:P,b:P,count:number, balance:number}>();
  const faces = new Set<string>();
  for(const t of triangles) {
    const face=t.map(key).sort().join('/');
    expect(faces.has(face), 'duplicate face').toBe(false); faces.add(face);
    expect(Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))).toBeGreaterThan(1e-10);
    for(let i=0;i<3;i++) {
      const a=t[i],b=t[(i+1)%3], ka=key(a),kb=key(b), k=[ka,kb].sort().join('/');
      const e=edges.get(k)??{a,b,count:0,balance:0}; e.count++; e.balance+=ka<kb?1:-1; edges.set(k,e);
    }
  }
  // Closed manifold triangle soup: no internal caps (which make 3+ faces),
  // holes, wrong winding, duplicate faces, or boundary mismatch after Float32.
  for(const e of edges.values()) { expect(e.count,'unclosed or internal edge').toBe(2); expect(e.balance,'edge winding').toBe(0); }
  // Euler independently checks the number of disconnected closed sweep shells.
  const vertices=new Set(triangles.flat().map(key));
  expect(vertices.size-edges.size+triangles.length).toBe(2*expectedLoops);
}
function packed(mesh:ReturnType<typeof generate>, part:string) {
  const p=mesh.parts.find(p=>p.name===part)!;
  return Array.from({length:(p.endIndex-p.index)/3},(_,t)=>Array.from(mesh.indices.slice(p.index+t*3,p.index+t*3+3)).map(i=>Array.from(mesh.vertices.slice(i*8,i*8+3))));
}
// Independent endpoint planes: analytic path equations and recorded quaternions,
// not the production frame/point functions.
function endpoint(kind:Configuration,end:number) {
  if(kind==='straight') return {p:[0,1.5,end?6:-6],n:[0,0,end?1:-1]};
  if(kind==='curve') { const a=(end?1:-1)*Math.PI/4; return {p:[8*Math.cos(a)-6,1.5,8*Math.sin(a)],n:[-Math.sin(a),0,Math.cos(a)].map(v=>v*(end?1:-1))}; }
  const row=loop[end?loop.length-1:0], [x,y,z,w]=row.slice(4);
  const apex=loop.reduce((a,b)=>a[2]>b[2]?a:b)[1];
  return {p:[-row[1]+apex,row[2]+1.5,-row[3]-4.3],n:[-2*(x*z+w*y),2*(y*z-w*x),1-2*(x*x+y*y)].map(v=>v*(end?1:-1))};
}
// Convex clipping is deliberately different from the ear-clipping implementation.
// It detects positive-area overlap even if an equal gap conserves total area.
function intersectionArea(a:P[],b:P[]) {
  const turn=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const sign=Math.sign(turn(...b as [P,P,P])); let polygon=a;
  for(let i=0;i<3;i++) {
    const u=b[i],v=b[(i+1)%3],out:P[]=[];
    polygon.forEach((p,j)=>{const q=polygon[(j+1)%polygon.length],dp=sign*turn(u,v,p),dq=sign*turn(u,v,q);
      if(dp>=0) out.push(p);
      if((dp>=0)!==(dq>=0)) out.push(p.map((x,k)=>x+(q[k]-x)*dp/(dp-dq)));
    }); polygon=out;
  }
  return Math.abs(polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length];return s+p[0]*q[1]-p[1]*q[0];},0))/2;
}
function caps(mesh:ReturnType<typeof generate>,part:string,kind:Configuration,count:number) {
  const range=mesh.parts.find(p=>p.name===part)!;
  let total=0;
  for(const end of [0,1]) {
    const {p,n}=endpoint(kind,end),triangles:P[][]=[];
    const axis=n.findIndex(v=>Math.abs(v)===Math.max(...n.map(Math.abs)));
    for(let t=range.index;t<range.endIndex;t+=3) {
      const ids=Array.from(mesh.indices.slice(t,t+3)),pts=ids.map(i=>Array.from(mesh.vertices.slice(i*8,i*8+3)));
      if(!pts.every(v=>Math.abs(dot(sub(v,p),n))<3e-6)) continue;
      total++;
      expect(dot(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])),n)).toBeGreaterThan(1e-10);
      for(const i of ids) expect(Array.from(mesh.vertices.slice(i*8+4,i*8+7)).every((v,k)=>Math.abs(v-n[k])<2e-6)).toBe(true);
      triangles.push(pts.map(p=>p.filter((_,i)=>i!==axis)));
    }
    expect(triangles.length).toBe(count);
    for(let i=0;i<triangles.length;i++) for(let j=0;j<i;j++) expect(intersectionArea(triangles[i],triangles[j]),'overlapping cap interiors').toBeLessThan(1e-10);
  }
  expect(total).toBe(2*count);
}
const build=trackGeometry(name=>new URL(`../public/assets/${name}.gltf`,import.meta.url));
for(const configuration of ['straight','curve','loop'] as Configuration[]) for(const style of ['parametric','single','dual']) for(const part of ['rails','spine']) test(`closed exposed boundaries: ${style} ${configuration} ${part}`,async()=>{
  const mesh=style==='parametric'?generate({...defaults,configuration}):await build({...defaults,configuration,fixed:true,secondSpine:style==='dual'});
  closure(packed(mesh,part),part==='rails'||style==='dual'?2:1);
  caps(mesh,part,configuration,part==='rails'?(style==='parametric'?20:28):(style==='parametric'?2:style==='dual'?44:22));
});

test('oracle mutations: missing, reversed, duplicate, internal faces, displaced boundary and wrong normals',()=>{
  const mesh=generate({...defaults,configuration:'straight'});
  const triangles=packed(mesh,'spine');
  expect(()=>closure(triangles.slice(1),1)).toThrow();
  const reversed=structuredClone(triangles); reversed[0].reverse();
  expect(()=>closure(reversed,1)).toThrow();
  expect(()=>closure([...triangles,triangles[0]],1)).toThrow();
  const displaced=structuredClone(triangles); displaced[0][0][0]+=.001;
  expect(()=>closure(displaced,1)).toThrow();
  const internal=triangles.slice(0,2).map(t=>t.map(p=>[p[0],p[1],0]));
  expect(()=>closure([...triangles,...internal],1)).toThrow();
  const bad=structuredClone(mesh),part=bad.parts.find(p=>p.name==='spine')!;
  const last=bad.indices[part.endIndex-1]; bad.vertices[last*8+6]*=-1;
  expect(()=>caps(bad,'spine','straight',2)).toThrow();
});
test('coverage oracle rejects overlap plus gap despite conserved area and no duplicate triangles',()=>{
  const a=[[0,0],[1,0],[.5,1]],b=[[0,0],[1,0],[1,1]];
  const area=(t:P[])=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[1][1]-t[0][1])*(t[2][0]-t[0][0]))/2;
  expect(area(a)+area(b)).toBe(1); // same as the unit square, but not its cover
  expect(intersectionArea(a,b)).toBeGreaterThan(.3);
  expect(()=>expect(intersectionArea(a,b)).toBeLessThan(1e-10)).toThrow();
});

// A genuinely concave section with an extra collinear point plus a disconnected
// rectangle. Edge normals deliberately are NOT regenerated face normals.
const points:[number,number][]=[[0,0],[1,0],[2,0],[2,1],[1,1],[1,2],[0,2],[3,0],[4,0],[4,1],[3,1]];
const profile:Profile={points,contours:[[0,1,2,3,4,5,6],[7,8,9,10]].map(ids=>ids.map((from,i)=>{
  const to=ids[(i+1)%ids.length], a=points[from],b=points[to];
  const dx=b[0]-a[0],dy=b[1]-a[1],n:[number,number]=[dy+.2*dx,-dx+.2*dy]; const l=Math.hypot(...n);
  return {from,to,normals:[n.map(v=>v/l) as [number,number],n.map(v=>v/l) as [number,number]],material:0};
})),materials:[]};
test('concave, collinear and disconnected contours retain their exact boundary',()=>{
  const mesh=sweepProfile(profile,'straight',7);
  closure(Array.from({length:mesh.indices.length/3},(_,i)=>mesh.indices.slice(i*3,i*3+3).map(j=>mesh.positions[j])),2);
  for(const [i,edge] of profile.contours.flat().entries()) for(let station=0;station<=192;station++) for(let corner=0;corner<2;corner++)
    expect(mesh.normals[i*386+station*2+corner].every((v,k)=>v===[...edge.normals[corner],0][k])).toBe(true);
  const wallFaces=points.length*192*2;
  expect(mesh.materials.slice(wallFaces).every(m=>m===7)).toBe(true);
  const ends=mesh.indices.slice(wallFaces*3);
  const triangles=Array.from({length:ends.length/3},(_,i)=>ends.slice(i*3,i*3+3).map(j=>mesh.positions[j]));
  for(const z of [-6,6]) {
    const cap=triangles.filter(t=>t.every(p=>p[2]===z));
    expect(cap).toHaveLength(7);
    expect(cap.reduce((s,t)=>s+Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))/2,0)).toBe(4);
    for(let i=0;i<cap.length;i++) for(let j=0;j<i;j++) expect(intersectionArea(cap[i],cap[j])).toBeLessThan(1e-12);
  }
});
