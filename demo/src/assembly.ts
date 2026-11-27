import { frame as analyticFrame, length, rotation, placeLoopPosition, type Vec } from './track';
import recorded from './loop-path.json';
import { offsetFrames, sampleFrames, path, rotate, type Path, type Frame } from '../../construction/geometry';
import { repeatFrames } from '../../construction/repeat';
import { sweep } from '../../construction/sweep';
import { snapshotBytes, type Construction } from '../../construction/native';
import { railAppearance } from './rail-material';
export { railAppearance } from './rail-material';
import type { ConvexSection } from './sampled-section';

export const assemblyDefaults = { path: 'curve' as 'straight' | 'curve' | 'loop', separation: 1.2, spacing: .65, tie: 'assembly-tie-bar' as 'assembly-tie-bar' | 'assembly-tie-fork', witness: 'normal' as 'normal' | 'station' | 'supports' };
export const straightDistanceRange = { min: 0, max: 12 };
export const postDefaults = { post1: 2, post2: 10 };
export const gapDefaults = { start: 4.2, end: 7.8 };
export type Assembly = typeof assemblyDefaults & { post1?: number; post2?: number; gapStart?: number; gapEnd?: number };
/** Bounded consumer adapter. Analytic stations and recorded poses are data inputs,
 * not a second interpolation policy. Recorded physics/fixtures remain untouched. */
export function assemblyPath(kind: Assembly['path']): Path {
  if (kind === 'loop') {
    const positions = recorded.map(r => placeLoopPosition(r.slice(1,4)));
    const rotations = recorded.map(r => {
      const raw = r.slice(4), norm = Math.hypot(...raw), q = raw.map(x => x/norm);
      const x = rotate(q, [1,0,0]), y = rotate(q,[0,1,0]), z = rotate(q,[0,0,1]);
      // Apply only the world half-turn; the recorded local −Z already travels forward.
      const world = ([x,y,z]: readonly number[]): Vec => [-x,y,-z];
      return rotation({p:[0,0,0],x:world(x),y:world(y),z:world(z)});
    });
    return path({distances: recorded.map(r => r[0]), positions, rotations});
  }
  const distances = Array.from({length:97},(_,i) => length(kind)*i/96);
  const poses = distances.map(s => analyticFrame(kind, s));
  return path({distances, positions: poses.map(f => f.p), rotations: poses.map(rotation)});
}
export function validateAssembly(a: Assembly) {
  if (!['straight', 'curve', 'loop'].includes(a.path) || !['assembly-tie-bar', 'assembly-tie-fork'].includes(a.tie) || !['normal','station','supports'].includes(a.witness ?? assemblyDefaults.witness) || !Number.isFinite(a.separation) || a.separation < .6 || a.separation > 1.6 || !Number.isFinite(a.spacing) || a.spacing < .3 || a.spacing > 1.5) throw new Error('Invalid assembly');
  for (const key of ['post1', 'post2'] as const) {
    const station = a[key] ?? postDefaults[key];
    if (!Number.isFinite(station) || station < straightDistanceRange.min || station > straightDistanceRange.max) throw new Error('Invalid support station');
  }
  const start = a.gapStart ?? gapDefaults.start, end = a.gapEnd ?? gapDefaults.end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < straightDistanceRange.min || end > length(a.path) || start > end) throw new Error('Invalid gap interval');
}
export function resolveAssembly(a: Assembly) {
  validateAssembly(a);
  const source = assemblyPath(a.path), total = source.distances.at(-1)!;
  // The rendering tessellation is explicit sampled data, also used by NormalTrack.
  const sampled = sampleFrames(source, Array.from({length:97},(_,i) => total*i/96));
  const nativePath = path({distances: Array.from({length:97},(_,i) => total*i/96),positions:sampled.map(f=>f.translation),rotations:sampled.map(f=>f.rotation)});
  const railFrames = [-1,1].map(side => offsetFrames(sampled,{translation:[side*a.separation/2,0,0],rotation:[0,0,0,1]}).map((f,i) => ({...basis(f),s:nativePath.distances[i]})));
  const ties = repeatFrames({path:nativePath,spacing:a.spacing,allowed:[{start:0,end:total}]});
  return { path: nativePath, railFrames, tie:a.tie, ties };
}
function basis(f: Frame) { return {p:f.translation as Vec,x:rotate(f.rotation,[1,0,0]) as Vec,y:rotate(f.rotation,[0,1,0]) as Vec,z:rotate(f.rotation,[0,0,1]) as Vec}; }
/** Pack NormalTrack's sweep accessors in their emitted corner order.
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
          // Sweep wall order a,c,b / a,d,c; caps alternate start/end triangles.
          const station=kind===0 ? Math.floor(i/(sectionSize*6))+([0,1,0,0,1,1][i%6]) : (Math.floor(i/3)%2 ? stations.length-1 : 0);
          color.push(...appearance(stations[station]));
        }
      }
    }
  }
  return {name:'Circular rails',vertices:new Float32Array(vertices),indices:new Uint32Array(indices),...(appearance?{color:new Float32Array(color)}:{})};
}
/** Native reference for assembly geometry fixtures; live rails emit on GPU. */
export function assemblyRails(section: ConvexSection, rails: ReturnType<typeof resolveAssembly>['railFrames'], appearance?: (station:number)=>readonly number[]) {
  const placements=rails.flatMap(r=>sweep(section,r.map(f=>({translation:f.p,rotation:rotation(f)})),railAppearance).placements);
  return packRails({placements},rails[0].map(f=>f.s),section.length,appearance);
}
