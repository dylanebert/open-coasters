import { immutable, registry, type Primitive, type Type, type TypeDefinition } from './kernel';
import { contentValue, constructionValue, type Content, type Construction } from './native';
export type Frame = { readonly translation: readonly number[]; readonly rotation: readonly number[] };
export type Path = { readonly distances: readonly number[]; readonly positions: readonly (readonly number[])[]; readonly rotations: readonly (readonly number[])[] };
export type Span = { start: number; end: number };
export const ids = { number: 'cc.number@1', frame: 'cc.frame@1', span: 'cc.span@1', path: 'cc.sampled-frame-path@1', content: 'cc.content@1', construction: 'cc.construction@1' } as const;
export const nominal = (id: string): Type => ({ id });
export const list = (type: Type): Type => ({ list: type });
function exact(v: any, names: string[]) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== names.length || names.some(k => !Object.hasOwn(v, k))) throw Error('invalid value members'); }
export function number(v: unknown): number { if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('finite number required'); return v; }
function vector(v: unknown, n: number): number[] { if (!Array.isArray(v) || v.length !== n) throw Error(`expected ${n} components`); return v.map(number); }
export function quaternion(v: unknown): number[] {
    const q = vector(v, 4), norm = Math.hypot(...q);
    if (Math.abs(norm - 1) > 1e-12) throw Error('unit quaternion required');
    const sign = [q[3], q[0], q[1], q[2]].find(x => x !== 0)! < 0 ? -1 : 1;
    return q.map(x => (x / norm * sign) || 0);
}
export function frame(v: any): Frame { exact(v, ['translation', 'rotation']); return immutable({ translation: vector(v.translation, 3), rotation: quaternion(v.rotation) }); }
export function path(v: any): Path {
    exact(v, ['distances', 'positions', 'rotations']);
    if (!Array.isArray(v.distances) || !Array.isArray(v.positions) || !Array.isArray(v.rotations)) throw Error('path arrays required');
    const distances = v.distances.map(number);
    if (distances.length < 2 || distances[0] !== 0 || distances.some((x: number, i: number) => i > 0 && x <= distances[i - 1]) || v.positions.length !== distances.length || v.rotations.length !== distances.length) throw Error('invalid path stations');
    return immutable({ distances, positions: v.positions.map((p: unknown) => vector(p, 3)), rotations: v.rotations.map(quaternion) });
}
export function span(v: any): Span { exact(v, ['start', 'end']); const start = number(v.start), end = number(v.end); if (start < 0 || end <= start) throw Error('invalid span'); return immutable({ start, end }); }
/** Explicit host work budget: exhaustion is an atomic resource refusal, never a shortened distance list. */
export function fixedDistances(length: number, spacing: number, phase: number, allowed: readonly Span[], excluded: readonly Span[], candidateBudget = 1_000_000): readonly number[] {
    if (!Number.isSafeInteger(candidateBudget) || candidateBudget < 1) throw new RangeError('invalid host candidate-work budget');
    [length, spacing, phase].forEach(number);
    if (length <= 0 || spacing <= 0 || phase < 0 || phase >= spacing) throw Error('invalid repetition parameters');
    for (const s of [...allowed, ...excluded]) { span(s); if (s.end > length) throw Error('span outside length'); }
    const inside = (s: number, spans: readonly Span[]) => spans.some(p => s >= p.start && s < p.end);
    const out: number[] = []; let previous = -Infinity;
    for (let k = 0; ; k++) {
        if (!Number.isSafeInteger(k)) throw new RangeError('integer counter overflow');
        const product = k * spacing;
        const s = phase + product;
        if (!Number.isFinite(product) || !Number.isFinite(s)) throw new RangeError('nonfinite repetition');
        if (s >= length) break;
        if (k >= candidateBudget) throw new RangeError('host candidate-work budget exhausted');
        if (s <= previous) throw new RangeError('repetition failed to progress');
        previous = s;
        if (inside(s, allowed) && !inside(s, excluded)) out.push(s);
    }
    return Object.freeze(out);
}
export function rotate(q: readonly number[], p: readonly number[]): number[] {
    const [x, y, z, w] = q, [a, b, c] = p;
    const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
    return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
export function compose(a: Frame, b: Frame): Frame {
    const [x, y, z, w] = a.rotation, [X, Y, Z, W] = b.rotation;
    return frame({ translation: rotate(a.rotation, b.translation).map((v, i) => v + a.translation[i]), rotation: [w * X + x * W + y * Z - z * Y, w * Y - x * Z + y * W + z * X, w * Z + x * Y - y * X + z * W, w * W - x * X - y * Y - z * Z] });
}
export function framesAt(source: Path, distances: readonly number[]): readonly Frame[] {
    const p = path(source), last = p.distances.at(-1)!;
    return Object.freeze(distances.map(s => {
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
export function adjustFrames(frames: readonly Frame[], local: Frame): readonly Frame[] { const b = frame(local); return Object.freeze(frames.map(f => compose(frame(f), b))); }
export function instance(content: Content, frames: readonly Frame[]): Construction { return constructionValue({ placements: frames.map(f => ({ content, frame: frame(f) })) }); }
export function join(constructions: readonly Construction[]): Construction { return constructionValue({ placements: constructions.flatMap(c => constructionValue(c).placements) }); }
const N = nominal(ids.number), F = nominal(ids.frame), S = nominal(ids.span), P = nominal(ids.path), C = nominal(ids.content), R = nominal(ids.construction);
const literalType = (id: string, validate: (v: any) => unknown): TypeDefinition => ({ id, validate, decode: validate });
export const standardTypes: readonly TypeDefinition[] = immutable([
    literalType(ids.number, number), literalType(ids.frame, frame), literalType(ids.span, span), literalType(ids.path, path),
    { id: ids.content, validate: contentValue }, { id: ids.construction, validate: constructionValue },
]);
export function primitive(name: string, inputs: Record<string, Type>, outputs: Record<string, Type>, evaluate: (v: any) => Record<string, unknown>): Primitive {
    return immutable({ operation: `cc.${name}@1`, inputs: Object.entries(inputs).map(([name, type]) => ({ name, type })), outputs: Object.entries(outputs).map(([name, type]) => ({ name, type })), evaluate });
}
export function fullSpan(length: number): readonly Span[] { number(length); if (length <= 0) throw Error('positive length required'); return Object.freeze([span({ start: 0, end: length })]); }
export function railOffsets(separation: number): { left: Frame; right: Frame } { number(separation); if (separation <= 0) throw Error('positive separation required'); return Object.freeze({ left: frame({ translation: [-separation/2, 0, 0], rotation: [0,0,0,1] }), right: frame({ translation: [separation/2, 0, 0], rotation: [0,0,0,1] }) }); }
export const standardOperations: readonly Primitive[] = Object.freeze([
    primitive('fullSpan', { length: N }, { spans: list(S) }, v => ({ spans: fullSpan(v.length) })),
    primitive('railOffsets', { separation: N }, { left: F, right: F }, v => railOffsets(v.separation)),
    primitive('fixedDistances', { length: N, spacing: N, phase: N, allowed: list(S), excluded: list(S) }, { distances: list(N) }, v => ({ distances: fixedDistances(v.length, v.spacing, v.phase, v.allowed, v.excluded) })),
    primitive('framesAt', { path: P, distances: list(N) }, { frames: list(F) }, v => ({ frames: framesAt(v.path, v.distances) })),
    primitive('adjustFrames', { frames: list(F), localFrame: F }, { frames: list(F) }, v => ({ frames: adjustFrames(v.frames, v.localFrame) })),
    primitive('instance', { content: C, frames: list(F) }, { construction: R }, v => ({ construction: instance(v.content, v.frames) })),
    primitive('join', { constructions: list(R) }, { construction: R }, v => ({ construction: join(v.constructions) })),
    primitive('pathStations', { path: P }, { length: N, frames: list(F) }, v => ({ length: v.path.distances.at(-1), frames: v.path.positions.map((translation: number[], i: number) => frame({ translation, rotation: v.path.rotations[i] })) })),
]);
export const standardRegistry = () => registry(standardTypes, standardOperations);
