import { frame, length, point, rotation, type Vec } from './track';
import type { SampledSection } from './sampled-section';

export const assemblyDefaults = { path: 'curve' as 'straight' | 'curve' | 'loop', separation: 1.2, spacing: .65, tie: 'assembly-tie-bar' as 'assembly-tie-bar' | 'assembly-tie-fork' };
export type Assembly = typeof assemblyDefaults;
/** App-local policy. Resolved rigid frames/placements are plain data, not a recipe schema. */
export function resolveAssembly(a: Assembly) {
  if (!['straight', 'curve', 'loop'].includes(a.path) || !['assembly-tie-bar', 'assembly-tie-fork'].includes(a.tie) || !Number.isFinite(a.separation) || a.separation < .6 || a.separation > 1.6 || !Number.isFinite(a.spacing) || a.spacing < .3 || a.spacing > 1.5) throw new Error('Invalid assembly');
  const total = length(a.path);
  const railFrames = [-1, 1].map(side => Array.from({length: 97}, (_, i) => {
    const f = frame(a.path, total * i / 96);
    return { ...f, s: total * i / 96, p: point(f, side * a.separation / 2, 0) };
  }));
  const ties = Array.from({length: Math.floor((total - 1e-6) / a.spacing) + 1}, (_, i) => {
    const f = frame(a.path, i * a.spacing);
    return { translation: f.p, rotation: rotation(f) };
  });
  const end = railFrames[1].at(-1)!;
  return { railFrames, tie: a.tie, ties, fitting: [{ translation: end.p, rotation: rotation(end) }] };
}
/** Operation-selected faceted walls and flat closure, using the unchanged sampled
 * section at each rigid frame. No profile appearance, bore or attachment inference. */
export function assemblyRails(section: SampledSection, rails: ReturnType<typeof resolveAssembly>['railFrames'], appearance?: (station: number) => readonly number[]) {
  const vertices: number[] = [], indices: number[] = [], color: number[] = [];
  function triangle(a: Vec, b: Vec, c: Vec, stations: number[]) {
    const u = b.map((v,i) => v-a[i]), v = c.map((v,i) => v-a[i]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const size = Math.hypot(...n);
    if (!Number.isFinite(size) || size <= 1e-12) throw new Error('Degenerate assembly surface');
    const first = vertices.length / 8;
    for (const [i,p] of [a,b,c].entries()) {
      vertices.push(...p, 0, ...n.map(v => v/size), 0);
      if (appearance) color.push(...appearance(stations[i]));
    }
    indices.push(first, first+1, first+2);
  }
  for (const frames of rails) {
    for (let i = 0; i < frames.length-1; i++) for (let j = 0; j < section.length; j++) {
      const a = point(frames[i], ...section[j]), b = point(frames[i], ...section[(j+1)%section.length]);
      const c = point(frames[i+1], ...section[(j+1)%section.length]), d = point(frames[i+1], ...section[j]);
      triangle(a,b,c,[frames[i].s,frames[i].s,frames[i+1].s]); triangle(a,c,d,[frames[i].s,frames[i+1].s,frames[i+1].s]);
    }
    for (const end of [0,1]) {
      const f = frames[end ? frames.length-1 : 0], p = section.map(s => point(f, ...s));
      for (let j = 1; j < p.length-1; j++) triangle(p[0], p[end ? j : j+1], p[end ? j+1 : j], [f.s,f.s,f.s]);
    }
  }
  return { name: 'Circular rails', vertices: new Float32Array(vertices), indices: new Uint32Array(indices), ...(appearance ? {color: new Float32Array(color)} : {}) };
}
