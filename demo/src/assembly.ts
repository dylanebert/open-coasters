import { frame as analyticFrame, length, rotation, type Vec } from './track';
import recorded from './loop-path.json';
import { adjustFrames, fixedDistances, framesAt, path, rotate, type Path, type Frame } from '../../construction/geometry';
import { sweepConvex, type Material } from '../../construction/sweep';
import { nativeSnapshot, snapshotBytes, type Construction } from '../../construction/native';
import type { SampledSection } from './sampled-section';

export const assemblyDefaults = { path: 'curve' as 'straight' | 'curve' | 'loop', separation: 1.2, spacing: .65, tie: 'assembly-tie-bar' as 'assembly-tie-bar' | 'assembly-tie-fork', witness: 'normal' as 'normal' | 'station' | 'supports' | 'switch' };
export const postRange = { min: 0, max: 12 };
export const postDefaults = { post1: 2, post2: 10 };
export type Assembly = typeof assemblyDefaults & { post1?: number; post2?: number };
/** Bounded consumer adapter. Analytic stations and recorded poses are data inputs,
 * not a second interpolation policy. Recorded physics/fixtures remain untouched. */
export function assemblyPath(kind: Assembly['path']): Path {
  if (kind === 'loop') {
    const apex = recorded.reduce((a,b) => b[2] > a[2] ? b : a)[1];
    const positions = recorded.map(r => [-r[1]+apex,r[2]+1.5,-r[3]-4.3]);
    const rotations = recorded.map(r => {
      const raw = r.slice(4), norm = Math.hypot(...raw), q = raw.map(x => x/norm);
      const x = rotate(q, [1,0,0]), y = rotate(q,[0,1,0]), z = rotate(q,[0,0,1]);
      return rotation({p:[0,0,0],x:[x[0],-x[1],x[2]], y:[-y[0],y[1],-y[2]], z:[z[0],-z[1],z[2]]});
    });
    return path({distances: recorded.map(r => r[0]), positions, rotations});
  }
  const distances = Array.from({length:97},(_,i) => length(kind)*i/96);
  const poses = distances.map(s => analyticFrame(kind,s));
  return path({distances, positions: poses.map(f => f.p), rotations: poses.map(rotation)});
}
export function resolveAssembly(a: Assembly) {
  if (!['straight', 'curve', 'loop'].includes(a.path) || !['assembly-tie-bar', 'assembly-tie-fork'].includes(a.tie) || !['normal','station','supports','switch'].includes(a.witness ?? 'normal') || !Number.isFinite(a.separation) || a.separation < .6 || a.separation > 1.6 || !Number.isFinite(a.spacing) || a.spacing < .3 || a.spacing > 1.5) throw new Error('Invalid assembly');
  for (const key of ['post1', 'post2'] as const) {
    const station = a[key] ?? postDefaults[key];
    if (!Number.isFinite(station) || station < postRange.min || station > postRange.max) throw new Error('Invalid support station');
  }
  const source = assemblyPath(a.path), total = source.distances.at(-1)!;
  // The rendering tessellation is explicit sampled data, also used by NormalTrack.
  const sampled = framesAt(source, Array.from({length:97},(_,i) => total*i/96));
  const nativePath = path({distances: Array.from({length:97},(_,i) => total*i/96),positions:sampled.map(f=>f.translation),rotations:sampled.map(f=>f.rotation)});
  const railFrames = [-1,1].map(side => adjustFrames(sampled,{translation:[side*a.separation/2,0,0],rotation:[0,0,0,1]}).map((f,i) => ({...basis(f),s:nativePath.distances[i]})));
  const ties = framesAt(nativePath,fixedDistances(total,a.spacing,0,[{start:0,end:total}],[]));
  return { path: nativePath, railFrames, tie:a.tie, ties };
}
function basis(f: Frame) { return {p:f.translation as Vec,x:rotate(f.rotation,[1,0,0]) as Vec,y:rotate(f.rotation,[0,1,0]) as Vec,z:rotate(f.rotation,[0,0,1]) as Vec}; }
const appearanceSnapshot = nativeSnapshot({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.06,.7,.78,1],metallicFactor:.7,roughnessFactor:.25}}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}],bufferViews:[{buffer:0,byteLength:36}],buffers:[{byteLength:36}]},[new Float32Array([0,0,0,1,0,0,0,1,0]).buffer]);
export const railAppearance: Material = {snapshot:appearanceSnapshot,material:0};
/** Thin renderer packing of generated native accessors; no placement or sweep rules.
 * Consumer force coloring is never written back into native snapshots/export. */
export function packRails(construction: Construction, stations: readonly number[], sectionSize: number, appearance?: (station:number)=>readonly number[]) {
  const vertices:number[] = [], indices:number[] = [], color:number[] = [];
  for (const placement of construction.placements) {
    const s = placement.content.snapshot, d = s.document;
    for (const [kind,p] of d.meshes[0].primitives.entries()) {
      const pa=d.accessors[p.attributes.POSITION], na=d.accessors[p.attributes.NORMAL];
      const pv=d.bufferViews[pa.bufferView], nv=d.bufferViews[na.bufferView];
      const pd=new DataView(snapshotBytes(s,pv.buffer).buffer), nd=new DataView(snapshotBytes(s,nv.buffer).buffer);
      for(let i=0;i<pa.count;i++) {
        const at=(pv.byteOffset??0)+(pa.byteOffset??0)+i*12, nt=(nv.byteOffset??0)+(na.byteOffset??0)+i*12;
        indices.push(vertices.length/8);
        vertices.push(pd.getFloat32(at,true),pd.getFloat32(at+4,true),pd.getFloat32(at+8,true),0,nd.getFloat32(nt,true),nd.getFloat32(nt+4,true),nd.getFloat32(nt+8,true),0);
        if(appearance) {
          // Native sweep wall order a,b,c / a,c,d; caps alternate start/end triangles.
          const station=kind===0 ? Math.floor(i/(sectionSize*6))+([0,0,1,0,1,1][i%6]) : (Math.floor(i/3)%2 ? stations.length-1 : 0);
          color.push(...appearance(stations[station]));
        }
      }
    }
  }
  return {name:'Circular rails',vertices:new Float32Array(vertices),indices:new Uint32Array(indices),...(appearance?{color:new Float32Array(color)}:{})};
}
/** Compatibility entry for geometry fixtures; the live consumer executes NormalTrack. */
export function assemblyRails(section: SampledSection, rails: ReturnType<typeof resolveAssembly>['railFrames'], appearance?: (station:number)=>readonly number[]) {
  const placements=rails.flatMap(r=>sweepConvex(section,r.map(f=>({translation:f.p,rotation:rotation(f)})),railAppearance,railAppearance).placements);
  return packRails({placements},rails[0].map(f=>f.s),section.length,appearance);
}
