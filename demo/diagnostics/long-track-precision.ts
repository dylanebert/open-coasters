import { expect } from 'bun:test';
import { Meshes, type World } from '@dylanebert/shallot';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { octDecodeNormal } from '@dylanebert/shallot/utils';
import { readMesh } from '../src/gpu-probe';
import type { Profile } from '../src/profile';
import { sweepIntervals, sweepProfile } from '../src/profile-sweep';
import { nativePoint, posePoint } from '../src/track-deformation-oracle';
import { spanLength, worldPoint, type Span } from './long-track-span';

const f32 = Math.fround;
export const normError = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
// Half an f32 ULP at each of two independent operations: storing the
// origin and adding the decoded local position. The sweep instances are
// translation-only (asserted on the submitted transform rows below).
const halfUlp = (v: number) => v === 0 ? 0 : 2**(Math.floor(Math.log2(Math.abs(v)))-24);
export const worldAllowance = (origin: number, result: number) => halfUlp(origin)+halfUlp(result);
export const near = (actual: number, expected: number, tol: number, label: string) => {
  if (!(Math.abs(actual-expected)<=tol)) throw Error(`${label}: ${actual} vs ${expected} ± ${tol}`);
};
export async function inspectSweep(w: World, span: Span, revision: number, profile: Profile, handle: MeshHandle, row: Float32Array, end: boolean) {
  expect(Array.from(row)).toEqual([...span.origin.map(f32),0,0,0,0,1,1,1,1,0]);
  const mesh = w.resource(Meshes).get(handle)!;
  const {points: _, ...raw} = await readMesh(w,mesh); // also checks indexed main/depth stream agreement
  const want = sweepProfile(profile,'curve',0,s=>span.at(revision,s*(span.length/spanLength)),span.caps);
  const {indices,main,quant} = raw;
  expect(new Uint32Array(indices,mesh.indexBase*4,mesh.indexCount)).toEqual(Uint32Array.from(want.indices));
  const words = new Uint32Array(main), q = new DataView(quant), bounds = mesh.bounds!;
  expect(words.length).toBe(want.positions.length*4);
  expect(bounds[3]).toBeLessThan(8);
  const radius = Math.max(...profile.points.map(p=>Math.hypot(...p)))+.001;
  const stockGrid = [spanLength+2*radius,2*radius,spanLength+2*radius].map(x=>f32(x)/65535);
  const scale = stockGrid.map((stock,j)=>{
    const v = q.getFloat32(16+j*4,true);
    expect(v/65535).toBeLessThanOrEqual(stock);
    return v;
  });
  let localError=0, worldError=0, normalError=0;
  const seam: {p: number[]; n: number[]; quantError:number[]; rounding:number[]}[] = [];
  const stride = 2*(sweepIntervals+1), edges = profile.contours.flat().length;
  const center = bounds.slice(0,3).map((v,a)=>f32(f32(v)+row[a]));
  for (let i=0; i<want.positions.length; i++) {
    const a=words[i*4], b=words[i*4+1];
    if (b>>>16) throw Error('unexpected quant row');
    const local = [a&65535,a>>>16,b&65535].map((word,j)=>{
      const lo=q.getFloat32(j*4,true), p=f32(lo+f32(f32(word/65535)*scale[j]));
      const ideal=want.positions[i][j];
      const eps=8*2**-23*Math.max(1,Math.abs(lo),scale[j]);
      if (ideal<lo-halfUlp(lo) || ideal>lo+scale[j]+halfUlp(lo)+halfUlp(scale[j])) throw Error('quantization clipped a vertex');
      near(p,ideal,scale[j]/65535+eps,'local position');
      localError=Math.max(localError,Math.abs(p-ideal));
      return p;
    });
    const p = local.map((v,j)=>f32(row[j]+v)), ideal = worldPoint(span,want.positions[i]);
    const decoded = octDecodeNormal(words[i*4+2]), n = [decoded.x,decoded.y,decoded.z];
    for(let j=0; j<3; j++) {
      near(p[j],ideal[j],Math.abs(local[j]-want.positions[i][j])+worldAllowance(span.origin[j],p[j])+1e-12,'world position');
      worldError=Math.max(worldError,Math.abs(p[j]-ideal[j]));
    }
    const err = normError(n,want.normals[i]);
    near(err,0,.00012,'authored transported normal');
    normalError=Math.max(normalError,err);
    near(normError(p,center),0,bounds[3],'submitted world culling sphere');
    if (i<edges*stride && Math.floor(i%stride/2)===(end?sweepIntervals:0)) seam.push({p,n,
      quantError:local.map((v,j)=>Math.abs(v-want.positions[i][j])),
      rounding:p.map((v,j)=>worldAllowance(span.origin[j],v)),
    });
  }
  expect(seam).toHaveLength(2*edges);
  return {raw,seam,localError,worldError,normalError};
}

const cross = ([x,y,z]:readonly number[],[a,b,c]:readonly number[]) => [y*c-z*b,z*a-x*c,x*b-y*a];
function tiePoint(row: Float32Array, p: readonly number[]) {
  const q=Array.from(row.subarray(4,7)), qw=row[7];
  const v=p.map((x,i)=>x*row[8+i]), u=cross(q,v), t=cross(q,u);
  return v.map((x,i)=>f32(row[i]+x+2*(qw*u[i]+t[i])));
}

export function inspectNativeTie(row: Float32Array, points: number[][],
  source: {indices:Uint32Array; vertices:Float32Array}, matrix:Float32Array,
  pose:Parameters<typeof posePoint>[0], radius:number) {
  const want = (p:readonly number[])=>posePoint(pose,nativePoint(matrix,p[0],p[1],p[2]));
  let tieError=0;
  const origin=want([0,0,0]);
  for(const p of [[0,0,0],[1,0,0],[0,1,0],[0,0,1]]) {
    const ideal=want(p), got=tiePoint(row,p);
    for(let a=0;a<3;a++) near(got[a],ideal[a],worldAllowance(origin[a],got[a])+4e-6,'native rigid placement');
  }
  expect(points).toHaveLength(source.indices.length);
  let farthest=0, depth=0;
  for(let k=0;k<source.indices.length;k++) {
    const v=source.indices[k]*8, p=source.vertices.subarray(v,v+3);
    const z=Math.abs(nativePoint(matrix,p[0],p[1],p[2])[2]);
    if(z>depth){depth=z;farthest=k;}
  }
  expect(depth).toBeGreaterThan(.001);
  const v=source.indices[farthest]*8;
  const ideal=want(Array.from(source.vertices.subarray(v,v+3))), got=tiePoint(row,points[farthest]);
  for(let a=0;a<3;a++) {
    near(got[a],ideal[a],worldAllowance(origin[a],got[a])+4e-6+2*radius/65535,'native submitted corner');
    tieError=Math.max(tieError,Math.abs(got[a]-ideal[a]));
  }
  return tieError;
}
