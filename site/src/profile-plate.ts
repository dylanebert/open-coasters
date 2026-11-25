import polygon from './profile-polygon.json';
import { palettes, axisColors, cameraConfiguration, cameraTransform, project } from './plate';
export { palettes, cameraConfiguration, cameraTransform, project };
export type Point = readonly [number, number, number];
// This plate's explicit illustrative dodecagon, not a contributed-asset decoder.
export function contour(input=polygon): Point[] {
  const {points,edges,radius}=input;
  if(points.length!==12||edges.length!==12||radius!==.03) throw Error('Expected illustrative 12-sided 0.03m polygon');
  for(const [i,a] of points.entries()) {
    if(a.length!==3||!a.every(Number.isFinite)||a[2]!==0||Math.abs(Math.hypot(a[0]!,a[1]!)-radius)>1e-12) throw Error('Expected authored XY radius');
    if(edges[i]?.[0]!==i||edges[i]?.[1]!==(i+1)%12) throw Error('Broken directed cycle');
    const b=points[(i+1)%12]!;
    if(Math.abs(Math.hypot(b[0]!-a[0]!,b[1]!-a[1]!)-.015529142706151244)>1e-12) throw Error('Expected regular polygon edges');
  }
  const area=points.reduce((s,a,i)=>{const b=points[(i+1)%12]!;return s+a[0]!*b[1]!-a[1]!*b[0]!;},0);
  if(area<=0) throw Error('Expected CCW contour');
  return points.map(p=>[p[0]!,p[1]!,0]);
}
export function profilePlate() {
  return {width:1200,height:650,size:.046,mode:'orthographic',camera:[0,0,2] as Point,target:[0,0,0] as Point,origin:[0,0,0] as Point,axes:[[.037,0,0],[0,.037,0]] as Point[]} as const;
}
export const strokeHalfPixels=1.15;
// Two thin triangles per directed edge, never an interior triangulation.
export function strokes(points=contour()) {
  const vertices:number[]=[],indices:number[]=[];
  const half=strokeHalfPixels*2*profilePlate().size/profilePlate().height;
  for(let i=0;i<points.length;i++) {
    const a=points[i]!,b=points[(i+1)%points.length]!,dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l*half,ny=dx/l*half,base=vertices.length/8;
    for(const [x,y] of [[a[0]+nx,a[1]+ny],[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny]]) vertices.push(x!,y!,0,0,0,1,0,0);
    indices.push(base,base+1,base+2,base+3,base,base+2);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export const profileView=profilePlate;
// Native identity deliberately excludes labels, dots and SVG-only axis layout.
export function nativeInputs() {
  const {width,height,size,mode,camera,target,origin}=profilePlate();
  return {polygon,view:{width,height,size,mode,camera,target,origin},strokeHalfPixels,palettes};
}
export function annotationGeometry() {
  const p=profileView();
  return {origin:project(p.origin,p),vertices:contour().map(v=>project(v,p)),axes:p.axes.map(a=>({positive:project(a,p),negative:project([-a[0],-a[1],0],p)}))};
}
export function overlay(theme:keyof typeof palettes) {
  const {origin:o,axes,vertices}=annotationGeometry(),{ink}=palettes[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${profileView().width}" height="${profileView().height}"><defs>${axisColors.slice(0,2).map((c,i)=>`<marker id="a${i}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="${c}"/></marker>`).join('')}</defs><g fill="none" stroke-width="2">${axes.map((a,i)=>`<path d="M${a.negative}L${a.positive}" stroke="${axisColors[i]}" marker-end="url(#a${i})"/>`).join('')}<circle cx="${o[0]}" cy="${o[1]}" r="9" stroke="${axisColors[2]}"/></g><circle cx="${o[0]}" cy="${o[1]}" r="2.5" fill="${axisColors[2]}"/><g fill="${ink}">${vertices.map(a=>`<circle cx="${a[0]}" cy="${a[1]}" r="3"/>`).join('')}</g><g fill="${ink}" font-family="sans-serif" font-size="46" dominant-baseline="middle"><text x="${axes[0]!.positive[0]!+32}" y="${o[1]}">+X</text><text x="${o[0]+32}" y="${axes[1]!.positive[1]!}">+Y</text><text x="${o[0]-24}" y="${o[1]+48}" text-anchor="end">O</text><text x="${o[0]+24}" y="${o[1]+48}">+Z</text></g></svg>`;
}
