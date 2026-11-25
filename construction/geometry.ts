import { mapList } from './list';
import { contentValue, constructionValue, type Content, type Construction } from './native';
/** A rigid pose: XYZ translation in metres and unit XYZW rotation, without scale. */
export type Frame = { readonly translation: readonly number[]; readonly rotation: readonly number[] };
/** At least two poses with supplied stations in metres, strictly increasing from zero. */
export type Path = { readonly distances: readonly number[]; readonly positions: readonly (readonly number[])[]; readonly rotations: readonly (readonly number[])[] };
/** Half-open interval [start, end), with 0 ≤ start < end. */
export type Span = { start: number; end: number };
function exact(v: any, names: string[]) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== names.length || names.some(k => !Object.hasOwn(v, k))) throw Error('invalid value members'); }
export function number(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('finite number required'); return v; }
function vector(v: unknown, n: number): number[] {
    if (!Array.isArray(v) || v.length !== n) throw Error(`expected ${n} components`);
    const components: number[] = [];
    for (let i = 0; i < n; i++) components.push(number(Object.hasOwn(v, i) ? v[i] : undefined));
    return components;
}
/** Accept norms within 1e-12 of one, normalize and make the first nonzero WXYZ component positive. */
export function quaternion(v: unknown): number[] {
    const q = vector(v, 4), norm = Math.hypot(...q);
    if (Math.abs(norm - 1) > 1e-12) throw Error('unit quaternion required');
    const sign = [q[3], q[0], q[1], q[2]].find(x => x !== 0)! < 0 ? -1 : 1;
    return q.map(x => (x / norm * sign) || 0);
}
export function frame(v: any): Frame { exact(v, ['translation', 'rotation']); return Object.freeze({ translation: Object.freeze(vector(v.translation, 3)), rotation: Object.freeze(quaternion(v.rotation)) }); }
export function path(v: any): Path {
    exact(v, ['distances', 'positions', 'rotations']);
    const distances = mapList(v.distances, 'path distances', number);
    if (distances.length < 2 || distances[0] !== 0 || distances.some((x: number, i: number) => i > 0 && x <= distances[i - 1]) || v.positions.length !== distances.length || v.rotations.length !== distances.length) throw Error('invalid path stations');
    return Object.freeze({ distances: Object.freeze(distances), positions: Object.freeze(mapList(v.positions, 'path positions', p => Object.freeze(vector(p, 3)))), rotations: Object.freeze(mapList(v.rotations, 'path rotations', q => Object.freeze(quaternion(q)))) });
}
export function span(v: any): Span { exact(v, ['start', 'end']); const start = number(v.start), end = number(v.end); if (start < 0 || end <= start) throw Error('invalid span'); return Object.freeze({ start, end }); }
/** Generate binary64 startOffset + k * spacing (separate multiply and add),
 * starting at k=0 with 0 ≤ startOffset < spacing. Below length, keep candidates
 * in the union of allowed spans unless excluded. Compare endpoints exactly;
 * filtering does not reset phase. Refuse on nonprogress, overflow or exhaustion
 * of the host candidate budget, without returning a shortened distance list. */
export function repeatDistances(length: number, spacing: number, startOffset: number, allowed: readonly Span[], excluded: readonly Span[], candidateBudget = 1_000_000): readonly number[] {
    if (!Number.isSafeInteger(candidateBudget) || candidateBudget < 1) throw new RangeError('invalid host candidate-work budget');
    [length, spacing, startOffset].forEach(number);
    if (length <= 0 || spacing <= 0 || startOffset < 0 || startOffset >= spacing) throw Error('invalid repetition parameters');
    const checkedSpan = (value: Span) => {
        const s = span(value);
        if (s.end > length) throw Error('span outside length');
        return s;
    };
    const allow = mapList(allowed, 'allowed spans', checkedSpan);
    const exclude = mapList(excluded, 'excluded spans', checkedSpan);
    const inside = (s: number, spans: readonly Span[]) => spans.some(p => s >= p.start && s < p.end);
    const out: number[] = []; let previous = -Infinity;
    for (let k = 0; ; k++) {
        if (!Number.isSafeInteger(k)) throw new RangeError('integer counter overflow');
        const product = k * spacing;
        const s = startOffset + product;
        if (!Number.isFinite(product) || !Number.isFinite(s)) throw new RangeError('nonfinite repetition');
        if (s >= length) break;
        if (k >= candidateBudget) throw new RangeError('host candidate-work budget exhausted');
        if (s <= previous) throw new RangeError('repetition failed to progress');
        previous = s;
        if (inside(s, allow) && !inside(s, exclude)) out.push(s);
    }
    return Object.freeze(out);
}
export function rotate(q: readonly number[], p: readonly number[]): number[] {
    const [x, y, z, w] = q, [a, b, c] = p;
    const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
    return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
export function compose(a: Frame, b: Frame): Frame {
    return composeChecked(frame(a), frame(b));
}
function composeChecked(a: Frame, b: Frame): Frame {
    const [x, y, z, w] = a.rotation, [X, Y, Z, W] = b.rotation;
    return frame({ translation: rotate(a.rotation, b.translation).map((v, i) => v + a.translation[i]), rotation: [w * X + x * W + y * Z - z * Y, w * Y - x * Z + y * W + z * X, w * Z + x * Y - y * X + z * W, w * W - x * X - y * Y - z * Z] });
}
/** Sample on the closed station domain, preserving recorded poses at exact stations.
 * Interpolate XYZ linearly and rotation by shortest-arc SLERP; retain the canonical
 * second quaternion on a zero dot and use normalized linear weights only when
 * the clamped dot rounds to one. */
export function sampleFrames(source: Path, distances: readonly number[]): readonly Frame[] {
    const p = path(source), last = p.distances.at(-1)!;
    return Object.freeze(mapList(distances, 'sample distances', s => {
        number(s); if (s < 0 || s > last) throw Error('distance outside path');
        const exact = p.distances.indexOf(s);
        if (exact >= 0) return frame({ translation: p.positions[exact], rotation: p.rotations[exact] });
        const hi = p.distances.findIndex(x => x > s), lo = hi - 1;
        const t = (s - p.distances[lo]) / (p.distances[hi] - p.distances[lo]);
        const a = p.rotations[lo], raw = p.rotations[hi];
        let dot = a.reduce((sum, x, i) => sum + x * raw[i], 0);
        const b = dot < 0 ? raw.map(x => -x) : raw; if (dot < 0) dot = -dot;
        const d = Math.max(0, Math.min(1, dot));
        // Only a rounded dot of one uses the normalized small-angle limit.
        let q: readonly number[] = a.map((x, i) => (1 - t) * x + t * b[i]);
        if (d !== 1) { const theta = Math.acos(d), den = Math.sin(theta); q = a.map((x, i) => (Math.sin((1 - t) * theta) * x + Math.sin(t * theta) * b[i]) / den); }
        return frame({ translation: p.positions[lo].map((x, i) => x + t * (p.positions[hi][i] - x)), rotation: quaternion(q) });
    }));
}
/** Compose path frame × local frame before applying the authored hierarchy. */
export function offsetFrames(frames: readonly Frame[], local: Frame): readonly Frame[] { const b = frame(local); return Object.freeze(mapList(frames, 'offset frames', f => composeChecked(frame(f), b))); }
/** Place whole selected native content without changing its scale, origin or hierarchy. */
export function instance(content: Content, frames: readonly Frame[]): Construction {
    const placements = mapList(frames, 'instance frames', f => ({ content, frame: frame(f) }));
    if (placements.length === 0) contentValue(content);
    return constructionValue({ placements });
}
/** Concatenate placements in input order, keeping duplicates and snapshot identities. */
export function join(constructions: readonly Construction[]): Construction { return constructionValue({ placements: mapList(constructions, 'constructions', c => constructionValue(c).placements).flat() }); }
export function fullSpan(length: number): readonly Span[] { number(length); if (length <= 0) throw Error('positive length required'); return Object.freeze([span({ start: 0, end: length })]); }
/** Track frames use +X right, +Y up and −Z forward. Offset each rail by half the separation. */
export function railOffsets(separation: number): { left: Frame; right: Frame } { number(separation); if (separation <= 0) throw Error('positive separation required'); return Object.freeze({ left: frame({ translation: [-separation/2, 0, 0], rotation: [0,0,0,1] }), right: frame({ translation: [separation/2, 0, 0], rotation: [0,0,0,1] }) }); }
