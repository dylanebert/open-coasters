import { defaults, type Parameters } from "./track";

export const numericRanges = {
  spacing: { min: .3, max: 1.5, step: .05 },
  separation: { min: .6, max: 1.6, step: .05 },
  width: { min: .15, max: .6, step: .01 },
  depth: { min: .15, max: .8, step: .05 },
} as const;

export type Paint = { rails: string; ties: string; spine: string };
export type Configuration = {
  parameters: Parameters;
  paint: Paint;
  isolated: boolean;
  asset: "blitz-tie" | "wheel-carrier";
};
export const initialConfiguration: Configuration = {
  parameters: { ...defaults },
  paint: { rails: "#50d3dd", ties: "#389faa", spine: "#339da5" },
  isolated: false,
  asset: "wheel-carrier",
};
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
export function effective(c: Configuration) {
  return { ...c, parameters: { ...c.parameters, separation: c.parameters.fixed ? 1 : c.parameters.separation } };
}
