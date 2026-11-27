import { instance, offsetFrames, path, repeatDistances, sampleFrames, type Frame, type Path, type Span } from './geometry';
import type { Content, Construction } from './native';

type RepeatOptions = {
    path: Path;
    /** Positive spacing in metres; defaults to 1. */
    spacing?: number;
    /** First candidate distance in metres, 0 ≤ startOffset < spacing; defaults to 0. */
    startOffset?: number;
    /** Candidates must lie in at least one allowed half-open span within the path. */
    allowed: readonly Span[];
    /** These half-open spans within the path override allowed spans; defaults to none. */
    excluded?: readonly Span[];
    /** Optional adjustment in each sampled frame's local coordinates. */
    localFrame?: Frame;
};

export function repeatFrames({ path: source, spacing = 1, startOffset = 0, allowed, excluded = [], localFrame }: RepeatOptions): readonly Frame[] {
    const checked = path(source);
    const distances = repeatDistances(checked.distances[checked.distances.length - 1], spacing, startOffset, allowed, excluded);
    const frames = sampleFrames(checked, distances);
    return localFrame === undefined ? frames : offsetFrames(frames, localFrame);
}

/** Place content at regular path distances. Span filtering does not reset
 * phase, and the path endpoint is never a candidate. */
export function repeat(content: Content, options: RepeatOptions): Construction {
    const frames = repeatFrames(options);
    return instance(content, frames);
}
