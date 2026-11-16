import { readFileSync } from 'node:fs';
import { palettes, axisColors, cameraConfiguration, cameraTransform, project } from './plate';
export { palettes, cameraConfiguration, cameraTransform, project };
export type Point = readonly [number, number, number];
export const sourceUrl = new URL('../../assets/blitz-profile/ModernSpine_1.obj',import.meta.url);
// Bounded illustration reader: directed triangle edges lying on each archived end.
export function contour(text=readFileSync(sourceUrl,'utf8')) {
  const lines=text.trim().split('\n');
  const vertices=lines.filter(l=>l.startsWith('v ')).map(l=>l.split(/\s+/).slice(1).map(Number) as unknown as Point);
  const faces=lines.filter(l=>l.startsWith('f ')).map(l=>l.split(/\s+/).slice(1).map(v=>Number(v.split('/')[0])-1));
  const ends=[-.05,.05].map(z=>faces.flatMap(f=>f.flatMap((a,i)=>{
    const b=f[(i+1)%3]!;
    return vertices[a]![2]===z && vertices[b]![2]===z ? [[a,b]] : [];
  })));
  const low=ends[0]!, high=ends[1]!;
  if(low.length!==24||high.length!==24) throw Error('Expected 24 directed edges on each end');
  const points: Point[]=[]; let current=low[0]![0]!;
  for(let i=0;i<24;i++) {
    if(points.some(p=>p===vertices[current])) throw Error('Early contour closure');
    points.push(vertices[current]!);
    const next=low.filter(e=>e[0]===current);
    if(next.length!==1) throw Error('Branch or open contour');
    current=next[0]![1]!;
  }
  if(current!==low[0]![0]) throw Error('Open contour');
  for(let i=0;i<24;i++) {
    const a=points[i]!,b=points[(i+1)%24]!;
    if(!high.some(([u,v])=>vertices[u!]!.slice(0,2).every((n,j)=>n===b[j])&&vertices[v!]!.slice(0,2).every((n,j)=>n===a[j]))) throw Error('Mismatched ends');
  }
  const xy=points.map(([x,y])=>[x,y,0] as Point);
  if(xy.reduce((s,a,i)=>{const b=xy[(i+1)%24]!;return s+a[0]*b[1]-a[1]*b[0];},0)<=0) throw Error('Not CCW');
  return xy;
}
export function profilePlate() {
  return {width:900,height:900,size:.53,mode:'orthographic',camera:[0,-.34,2] as Point,target:[0,-.34,0] as Point,origin:[0,0,0] as Point,axes:[[.17,0,0],[0,.17,0]] as Point[]} as const;
}
// Two thin triangles per directed edge, never a contour-interior triangulation.
export function strokes(points=contour()) {
  const vertices:number[]=[],indices:number[]=[];
  const half=1.15*2*profilePlate().size/profilePlate().height;
  for(let i=0;i<points.length;i++) {
    const a=points[i]!,b=points[(i+1)%points.length]!,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l*half,ny=dx/l*half,base=vertices.length/8;
    for(const [x,y] of [[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]]) vertices.push(x!,y!,0,0,0,1,0,0);
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export const profileView=profilePlate;
export function overlay(theme:keyof typeof palettes) {
  const p=profileView(),o=project([0,0,0],p),axes=profilePlate().axes.map(a=>project(a,p)),{ink}=palettes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs>${axisColors.slice(0,2).map((c,i)=>`<marker id="a${i}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="${c}"/></marker>`).join('')}</defs><g fill="none" stroke-width="2">${axes.map((a,i)=>`<path d="M${o}L${a}" stroke="${axisColors[i]}" marker-end="url(#a${i})"/>`).join('')}<circle cx="${o[0]}" cy="${o[1]}" r="9" stroke="${axisColors[2]}"/></g><circle cx="${o[0]}" cy="${o[1]}" r="2.5" fill="${axisColors[2]}"/><g fill="${ink}">${contour().map(v=>{const a=project(v,p);return `<circle cx="${a[0]}" cy="${a[1]}" r="3"/>`;}).join('')}</g><g fill="${ink}" font-family="sans-serif" font-size="23" dominant-baseline="middle"><text x="${axes[0]![0]!+22}" y="${o[1]}">+X</text><text x="${o[0]+22}" y="${axes[1]![1]!+8}">+Y</text><text x="${o[0]-24}" y="${o[1]+28}" text-anchor="end">O</text><text x="${o[0]+22}" y="${o[1]+28}">+Z</text></g></svg>`;
}
