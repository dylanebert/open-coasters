import { parseDocument } from './kernel';
import { ids, nominal, list, join, instance, type Path, type Span, type Frame } from './geometry';
import type { Content, Construction } from './native';
import type { SampledSection } from './section';
import { sweepRegistry, sectionId, materialId, type Material } from './sweep';
export type NormalTrackParameters = {
    path: Path; section: SampledSection; tieContent: Content; separation: number; spacing: number; wall: Material; cap: Material;
    phase?: number; excluded?: readonly Span[]; tieLocalFrame?: Frame;
};
/** Ordinary style parameters first. Source is the original inspectable normal-track.json text. */
export function normalTrack(parameters: NormalTrackParameters, source: string): Construction {
    const types = { path: nominal(ids.path), section: nominal(sectionId), tieContent: nominal(ids.content), separation: nominal(ids.number), spacing: nominal(ids.number), wall: nominal(materialId), cap: nominal(materialId), phase: nominal(ids.number), excluded: list(nominal(ids.span)), tieLocalFrame: nominal(ids.frame) };
    const inputs = Object.fromEntries(Object.entries(parameters).map(([name, value]) => { if (!(name in types)) throw Error(`unknown style parameter ${name}`); return [name, { type: types[name as keyof typeof types], value }]; }));
    return sweepRegistry().evaluate(parseDocument(source), { inputs }).construction as Construction;
}
/** Gaps filter the original phase sequence; explicit custom parts own their frames and content. */
export function stationGap(parameters: NormalTrackParameters, source: string, custom: readonly { content: Content; frames: readonly Frame[] }[]): Construction {
    return join([normalTrack(parameters, source), ...custom.map(p => instance(p.content, p.frames))]);
}
