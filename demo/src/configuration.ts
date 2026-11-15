import { defaults, type Parameters } from "./track";
import { assemblyDefaults } from './assembly';
import type { Selection } from './live';

export const numericRanges = {
  spacing: { min: .3, max: 1.5, step: .05 },
  separation: { min: .6, max: 1.6, step: .05 },
} as const;


export type Paint = { rails: string; ties: string; spine: string };
export const exampleOptions = [
  ['ties', 'Repeated ties'], ['station', 'Gap in repeated ties'],
  ['supports', 'Explicitly placed supports'], ['assembly', 'Rail offsets / separation'],
  ['track', 'Contributed Blitz assembly'],
] as const;
export type Example = typeof exampleOptions[number][0] | 'witness';
type Path = Parameters['configuration'];
export type Configuration = {
  selected: Example;
  values: {
    ties: { path: Path; spacing: number };
    station: { spacing: number; start: number; end: number };
    supports: { post1: number; post2: number };
    assembly: { path: Path; separation: number };
    track: { path: Path; secondSpine: boolean };
    witness: { asset: 'blitz-tie' | 'wheel-carrier' };
  };
};
export const defaultPaint: Paint = { rails: '#50d3dd', ties: '#389faa', spine: '#339da5' };
export const initialConfiguration: Configuration = {
  selected: 'ties',
  values: {
    ties: { path: 'curve', spacing: .65 },
    station: { spacing: .65, start: 4.2, end: 7.8 },
    supports: { post1: 2, post2: 10 },
    assembly: { path: 'curve', separation: 1.2 },
    track: { path: 'straight', secondSpine: false },
    witness: { asset: 'wheel-carrier' },
  },
};
export function selectedExample(c: Configuration): Example { return c.selected; }
export function selectExample(c: Configuration, value: string): Configuration {
  return value === 'witness' || exampleOptions.some(([key]) => key === value)
    ? { ...c, selected: value as Example } : c;
}
export type History = { past: Configuration[]; present: Configuration; future: Configuration[]; origin?: Configuration };
const same = (a: Configuration, b: Configuration) => JSON.stringify(a) === JSON.stringify(b);
export function history(present: Configuration): History { return { past: [], present, future: [] }; }
/** Preview retains the first snapshot of an interaction, not each intermediate value. */
export function preview(h: History, present: Configuration): History {
  return { ...h, origin: h.origin ?? h.present, present };
}
export function commit(h: History): History {
  if (!h.origin) return h;
  return same(h.origin, h.present)
    ? { past: h.past, present: h.present, future: h.future }
    : { past: [...h.past, h.origin], present: h.present, future: [] };
}
export function undo(h: History): History {
  h = commit(h);
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  h = commit(h);
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
/** Native color inputs are sRGB; StandardMaterial baseColor is linear. */
export function linearColor(hex: string): [number, number, number, number] {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [...channels.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 1] as [number, number, number, number];
}
export function effective(c: Configuration): Selection & { paint: Paint } {
  const { selected, values: v } = c;
  const parameters = { ...defaults, fixed: true, configuration: selected === 'track' ? v.track.path : 'straight' as const, secondSpine: selected === 'track' && v.track.secondSpine, separation: 1.2, width: .533333, depth: .533333 };
  const base = { parameters, paint: defaultPaint, asset: v.witness.asset, isolated: selected === 'witness' };
  if (selected === 'witness' || selected === 'track') return { ...base, example: 'track' };
  const assembly = { ...assemblyDefaults };
  if (selected === 'ties') Object.assign(assembly, v.ties);
  if (selected === 'assembly') Object.assign(assembly, v.assembly);
  if (selected === 'station') Object.assign(assembly, { path: 'straight', witness: 'station', spacing: v.station.spacing, gapStart: v.station.start, gapEnd: v.station.end });
  if (selected === 'supports') Object.assign(assembly, { path: 'straight', witness: 'supports', ...v.supports });
  return { ...base, example: 'assembly', assembly, subject: selected };
}
