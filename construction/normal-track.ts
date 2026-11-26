import { mapList } from './list';
import { frame, fullSpan, instance, join, number, offsetFrames, path, railOffsets, type Path, type Span, type Frame } from './geometry';
import type { Content, Construction } from './native';
import type { ConvexSection } from './section';
import { sweep, type Material } from './sweep';
import { repeat } from './repeat';

export type NormalTrackParameters = {
    path: Path; section: ConvexSection; tieContent: Content; separation: number; spacing: number; material: Material;
    startOffset?: number; excluded?: readonly Span[]; tieLocalFrame?: Frame;
};

export function normalTrack({ path: source, section, tieContent, separation, spacing, material,
    startOffset, excluded, tieLocalFrame }: NormalTrackParameters): Construction {
    number(spacing); // Required here, even though repeat has its own spacing default.
    const checked = path(source);
    const frames = checked.positions.map((translation, i) => frame({ translation, rotation: checked.rotations[i] }));
    const { left, right } = railOffsets(separation);
    return join([
        sweep(section, offsetFrames(frames, left), material),
        sweep(section, offsetFrames(frames, right), material),
        repeat(tieContent, { path: checked, spacing, startOffset, excluded, localFrame: tieLocalFrame,
            allowed: fullSpan(checked.distances[checked.distances.length - 1]) }),
    ]);
}

/** Gaps filter the original repeat sequence; explicit custom parts own their frames and content. */
export function stationGap(parameters: NormalTrackParameters, custom: readonly { content: Content; frames: readonly Frame[] }[]): Construction {
    const parts = mapList(custom, 'custom parts', p => instance(p.content, p.frames));
    return join([normalTrack(parameters), ...parts]);
}
