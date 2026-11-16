import { readFileSync } from 'node:fs';
import { CameraMode, lookAtRotation } from '@dylanebert/shallot';

export const palettes = {
  light: { bg: '#f7f3ec', ink: '#2a231e' },
  dark: { bg: '#141210', ink: '#f0e6d6' },
};
export const axisColors = ['#cc241d', '#6b9d65', '#458588'] as const;
type Vec = readonly [number, number, number];
const dot = (a: Vec, b: Vec) => a.reduce((s,v,i)=>s+v*b[i]!,0);
const cross = (a: Vec,b: Vec): Vec => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (v: Vec): Vec => v.map(x=>x/Math.hypot(...v)) as unknown as Vec;
export function plate() {
  return { asset: new URL('../../demo/public/assets/blitz-tie.gltf', import.meta.url),
    instances: 1, mode: 'orthographic', size: .46, width: 1200, height: 650,
    camera: [1.1,.85,2.2] as Vec, target: [0,0,0] as Vec,
    origin: [0,0,0] as Vec, axes: [[.72,0,0],[0,.26,0],[0,0,.30]] as Vec[] } as const;
}
export function cameraConfiguration(p: Pick<ReturnType<typeof plate>, 'size'>=plate()) {
  return { mode: CameraMode.Orthographic, size:p.size, near:.1, far:10 };
}
export function cameraTransform(p: Pick<ReturnType<typeof plate>, 'camera' | 'target'>=plate()) {
  return { translation:[...p.camera], rotation:lookAtRotation(...p.camera,...p.target,0,1,0) };
}
export function source() {
  const p=plate(); const json=JSON.parse(readFileSync(p.asset,'utf8'));
  const bytes=readFileSync(new URL(json.buffers[0].uri,p.asset));
  const accessor=json.accessors[0], view=json.bufferViews[accessor.bufferView];
  const positions=Array.from({length:accessor.count},(_,i)=>Array.from({length:3},(_,j)=>bytes.readFloatLE((view.byteOffset??0)+(accessor.byteOffset??0)+i*12+j*4)));
  return {json,positions};
}
export function project(v: Vec, p: Pick<ReturnType<typeof plate>, 'camera' | 'target' | 'width' | 'height' | 'size'>=plate()) {
  const back=unit(p.camera.map((v,i)=>v-p.target[i]!) as unknown as Vec);
  const right=unit(cross([0,1,0],back)), up=cross(back,right);
  const relative=v.map((v,i)=>v-p.target[i]!) as unknown as Vec;
  return [p.width/2+dot(relative,right)*p.height/(2*p.size),p.height/2-dot(relative,up)*p.height/(2*p.size)];
}
export function annotationGeometry(p=plate()) {
  const origin=project(p.origin,p), axes=p.axes.map(v=>project(v,p));
  const labels=axes.map(a=>{
    const dx=a[0]!-origin[0]!,dy=a[1]!-origin[1]!,length=Math.hypot(dx,dy);
    return {x:a[0]!+24*dx/length,y:a[1]!+24*dy/length,
      anchor:Math.abs(dx)<1 ? 'middle' : dx>0 ? 'start' : 'end'};
  });
  return {origin, axes, labels, originLabel:{x:origin[0]!,y:origin[1]!+65}};
}
export function annotations(p=plate(), ink: string=palettes.light.ink, background: string=palettes.light.bg) {
  const {origin:o,axes,labels,originLabel}=annotationGeometry(p);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}"><defs>${axisColors.map((color,i)=>`<marker id="arrow-${i}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="${color}"/></marker>`).join('')}</defs><g stroke="${background}" fill="none" stroke-width="5"><circle cx="${o[0]}" cy="${o[1]}" r="5"/></g><g stroke="${ink}" fill="none" stroke-width="2">${axes.map((a,i)=>`<path d="M${o}L${a}" stroke="${axisColors[i]}" marker-end="url(#arrow-${i})"/>`).join('')}<circle cx="${o[0]}" cy="${o[1]}" r="5" fill="${ink}"/></g><g fill="${ink}" font-family="sans-serif" font-size="23">${labels.map((a,i)=>`<text x="${a.x}" y="${a.y}" text-anchor="${a.anchor}" dominant-baseline="middle">+${'XYZ'[i]}</text>`).join('')}<text x="${originLabel.x}" y="${originLabel.y}" text-anchor="middle" dominant-baseline="middle">O</text></g></svg>`;
}
