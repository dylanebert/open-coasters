import { frame, length, ties, type Parameters, type generate } from "./track";

export type V = number[];
export type Triangle = V[];
export const sub = (a: V, b: V) => a.map((x, i) => x - b[i]);
export const dot = (a: V, b: V) => a.reduce((s, x, i) => s + x * b[i], 0);
export const cross = (a: V, b: V) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const norm = (a: V) => Math.hypot(...a);
export const normal = (t: Triangle) => {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
  return n.map(x => x / norm(n));
};
export const mix = (a: V, b: V, t: number) => a.map((x, i) => x + t * (b[i] - x));
export function triangles(mesh: ReturnType<typeof generate>, name: "rails" | "spine" | "ties") {
  const part = mesh.parts.find(p => p.name === name)!;
  return Array.from({ length: (part.endIndex - part.index) / 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => {
      const v = mesh.indices[part.index + i * 3 + j] * 8;
      return Array.from(mesh.vertices.subarray(v, v + 3));
    }));
}
function edgeDistance(p: V, a: V, b: V) {
  const d = sub(b, a);
  return norm(sub(p, mix(a, b, Math.max(0, Math.min(1, dot(sub(p, a), d) / dot(d, d))))));
}
export function barycentric(p: V, t: Triangle) {
  const u = sub(t[1], t[0]), v = sub(t[2], t[0]), w = sub(p, t[0]);
  const uu = dot(u,u), uv = dot(u,v), vv = dot(v,v), wu = dot(w,u), wv = dot(w,v);
  const d = uu*vv-uv*uv, b = (wu*vv-wv*uv)/d, c = (wv*uu-wu*uv)/d;
  return [1-b-c,b,c];
}
export function triangleDistance(p: V, t: Triangle) {
  const n = normal(t), d = dot(sub(p,t[0]),n), q = p.map((x,i) => x-d*n[i]);
  if (Math.min(...barycentric(q,t)) >= -1e-9) return Math.abs(d);
  return Math.min(...t.map((a,i) => edgeDistance(p,a,t[(i+1)%3])));
}
export function groups(mesh: ReturnType<typeof generate>, p: Parameters) {
  const stations = ties(p), result: Triangle[][] = stations.map(() => []);
  for (const t of triangles(mesh, "ties")) {
    const center = [0,1,2].map(k => t.reduce((s,v) => s+v[k],0)/3);
    let owner = 0, best = Infinity;
    for (let i=0;i<stations.length;i++) {
      const d = norm(sub(center,stations[i].p));
      if (d<best) { best=d; owner=i; }
    }
    result[owner].push(t);
  }
  return result;
}
// Actual barycentric point on one of the TWO emitted facet triangles. The
// diagonal is relevant on the nonplanar loop: bilinear frame interpolation is
// deliberately not the contact oracle.
export function railPoint(rails: Triangle[], p: Parameters, side: number, facet: number, s: number, u: number) {
  const station = Math.min(191, Math.floor(s / length(p.configuration) * 192));
  const t = s / length(p.configuration) * 192 - station;
  const first = u >= t;
  const tri = rails[side*192*24 + station*24 + facet*2 + (first ? 0 : 1)];
  const weights = first ? [1-u,u-t,t] : [1-t,u,t-u];
  return [0,1,2].map(k => tri.reduce((sum,v,i) => sum+v[k]*weights[i],0));
}
function planeCut(t: Triangle, n: V, origin: V) {
  const d = t.map(v => dot(sub(v,origin),n)), points: V[] = [];
  for (let i=0;i<3;i++) {
    const j=(i+1)%3;
    if (Math.abs(d[i])<1e-7) points.push(t[i]);
    if (d[i]*d[j]<0) points.push(mix(t[i],t[j],d[i]/(d[i]-d[j])));
  }
  return points;
}
// A transverse surface crossing has a segment in the relative interior of
// BOTH triangles. Edge-only contact is not such a crossing. Coplanar contact
// is handled separately, including its orientation and permitted rail facet.
export function crossing(a: Triangle, b: Triangle) {
  const na=normal(a), nb=normal(b), axis=cross(na,nb), size=norm(axis);
  if (size<1e-6) return null;
  // Float32 clipping of the same plane can tilt a small triangle's normal.
  // Require an actual two-sided crossing beyond the existing 2 micrometer
  // positional contact tolerance, not merely nonparallel computed normals.
  for (const [t,n,origin] of [[a,nb,b[0]],[b,na,a[0]]] as const) {
    const d=t.map(v=>dot(sub(v,origin),n));
    if (Math.min(...d)>=-2e-6 || Math.max(...d)<=2e-6) return null;
  }
  const aa=planeCut(a,nb,b[0]), bb=planeCut(b,na,a[0]);
  if (aa.length<2 || bb.length<2) return null;
  const direction=axis.map(x=>x/size);
  const range=(points: V[]) => points.map(p=>dot(p,direction)).sort((x,y)=>x-y);
  const ar=range(aa), br=range(bb), lo=Math.max(ar[0],br[0]), hi=Math.min(ar.at(-1)!,br.at(-1)!);
  if (hi-lo<2e-6) return null;
  const origin=aa[0], along=(lo+hi)/2-dot(origin,direction);
  const midpoint=origin.map((x,i)=>x+along*direction[i]);
  if (Math.min(...barycentric(midpoint,a))<2e-5 || Math.min(...barycentric(midpoint,b))<2e-5) return null;
  return midpoint;
}
export function localBounds(ts: Triangle[], p: Parameters, station: number) {
  const f=frame(p.configuration,station*p.spacing);
  return [f.x,f.y,f.z].map(axis => {
    const values=ts.flatMap(t=>t.map(v=>dot(sub(v,f.p),axis)));
    return [Math.min(...values),Math.max(...values)];
  });
}
