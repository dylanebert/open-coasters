import type { Vec } from '../src/track';
import { bump, chord, sag, spanLength, type Span } from './long-track-span';

export const metres = 1000;
const count = Math.ceil(metres / spanLength);
export const length = metres / count;
const scale = length / spanLength, advance = chord * scale, lift = sag * scale;

// Uniform similarity copies of the tested arc fixture, all oriented along -Z.
// Boundaries are authored at the same station/frame; this is not a general joiner.
export const route: Span[] = Array.from({length:count}, (_, i) => ({
  start: metres*i/count, end: metres*(i+1)/count, length,
  origin: [0,1.5,i===0 ? 0 : -advance*i], caps: [i===0,i===count-1],
  at(revision, s) {
    const f = bump(revision, s === length ? spanLength : s/length*spanLength);
    return {...f,p:f.p.map(x=>x*scale) as Vec};
  },
  range: radius => ({center:[lift/2,-.1,-advance/2],half:[radius+lift/2,radius,advance/2]}),
}));

export const middle = Math.floor(count/2);
export const targetAt = (index: number) => -advance*(index+.5);
