import type { Profile } from '../src/profile';
import { sweepIntervals, type SweepCaps } from '../src/profile-sweep';
import type { Vec } from '../src/track';
import { bump, chord, sag, spanLength, type Span } from './long-track-span';

const length = 1000 / Math.ceil(1000 / spanLength);
const scale = length / spanLength, advance = chord * scale, lift = sag * scale;

// Repeat the original 1 km fixture's 12.5 m arc at both lengths.
export function routeFixture(metres: 1000 | 5000) {
  const count = metres / length;
  const route: Span[] = Array.from({length:count}, (_, i) => ({
    start: metres*i/count, end: metres*(i+1)/count, length,
    origin: [0,1.5,i===0 ? 0 : -advance*i], caps: [i===0,i===count-1],
    at(revision, s) {
      const f = bump(revision, s === length ? spanLength : s/length*spanLength);
      return {...f,p:f.p.map(x=>x*scale) as Vec};
    },
    range: radius => ({center:[lift/2,-.1,-advance/2],half:[radius+lift/2,radius,advance/2]}),
  }));
  return {route, length, middle:Math.floor(count/2), targetAt:(index:number)=>-advance*(index+.5)};
}

export function stripCounts(profile: Profile, caps: SweepCaps) {
  // Supported authored contours have no duplicate or collinear corners;
  // the representative topology checks verify n-2 triangles per cap contour.
  const edges = profile.contours.reduce((n,c)=>n+c.length,0);
  const ends = Number(caps[0])+Number(caps[1]);
  return {vertices:edges*(2*(sweepIntervals+1)+ends),
    indices:6*edges*sweepIntervals+3*ends*(edges-2*profile.contours.length)};
}
