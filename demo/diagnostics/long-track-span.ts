import { sweepIntervals, type SweepCaps } from '../src/profile-sweep';
import { defaults, rotation, type Vec } from '../src/track';
import { replayLength as spanLength } from '../src/track-deformation';

export { spanLength };
export const spacing = defaults.spacing;
export const routeStart = 5000 - 2 * spanLength;
export const interval = spanLength / sweepIntervals;
export const revisions = [0, Math.PI / 8, -Math.PI / 8];
const quarter = spanLength / 4, angle = .06, k = angle / quarter;
const chord = 4 * Math.sin(angle) / k;
export const sag = 2 * (1 - Math.cos(angle)) / k;
const ends = [0, angle, 0, -angle, 0];
const axisX: Vec = [-1,0,0], axisY: Vec = [0,1,0], axisZ: Vec = [0,0,-1];
const boundary = (z: number) => ({p: [0,0,z] as Vec, x: axisX, y: axisY, z: axisZ});

// Integrate the unit tangent over four equal-length circular arcs. Rolling
// that planar locus about its chord preserves arc length, not just the sample
// parameter. Project fixed world up into the section, not rolled bump up.
function bump(roll: number, s: number) {
  if (s === 0 || s === spanLength) return boundary(s === 0 ? 0 : -chord);
  const i = Math.floor(s / quarter);
  const a = ends[i], curvature = Math.sign(ends[i+1]-a)*k;
  const t = a + curvature*(s-i*quarter);
  const advance = i*chord/4 + (Math.sin(t)-Math.sin(a))/curvature;
  const lift = [0,sag/2,sag,sag/2][i] + (Math.cos(a)-Math.cos(t))/curvature;
  const c = Math.cos(roll), r = Math.sin(roll);
  const z: Vec = [Math.sin(t)*c, Math.sin(t)*r, -Math.cos(t)];
  const h = Math.hypot(z[2],z[0]);
  const x: Vec = [z[2]/h, 0, -z[0]/h];
  const y: Vec = [z[1]*x[2], z[2]*x[0]-z[0]*x[2], -z[1]*x[0]];
  return {p: [lift*c,lift*r,-advance] as Vec, x, y, z};
}

function span(index: number, z: number, extent: number, at: typeof bump, caps: SweepCaps) {
  const origin: Vec = [0,1.5,z];
  const start = routeStart + index*spanLength, end = routeStart + (index+1)*spanLength;
  return {
    origin, start, end, at, caps, length: spanLength,
    // Shared transverse grid. The longitudinal end poses are quant extrema:
    // walls advance monotonically in Z (even at the maximum section radius,
    // the frame's curvature displacement is much smaller than the advance).
    range: (radius: number) => ({center: [sag/2,-.1,-extent/2] as Vec,
      half: [radius+sag/2,radius,extent/2] as Vec}),
  };
}
export const spans = [span(0,-4974,chord,bump,[true,false]),
  span(1,-4974-chord,spanLength,(_,s)=>boundary(-s),[false,true])];
export type Span = typeof spans[number];
export const worldPoint = (span: Span, local: readonly number[]) => local.map((p,i)=>p+span.origin[i]) as Vec;

export function tieStations(span: Span) {
  const stations: number[] = [];
  for (let i=Math.ceil(span.start/spacing); i*spacing<span.end; i++) stations.push(i*spacing);
  return stations;
}
export function tiePoses(span: Span, revision: number) {
  return tieStations(span).map(s=>{
    const f=span.at(revision,s-span.start);
    return {translation:worldPoint(span,f.p), rotation:rotation(f)};
  });
}