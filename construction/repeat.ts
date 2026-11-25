import { instance, offsetFrames, path, repeatDistances, sampleFrames, type Frame, type Path, type Span } from './geometry';
import type { Content, Construction } from './native';

type RepeatOptions = {
    path: Path;
    spacing?: number;
    startOffset?: number;
    allowed: readonly Span[];
    excluded?: readonly Span[];
    localFrame?: Frame;
};

export function repeatFrames({ path: source, spacing = 1, startOffset = 0, allowed, excluded = [], localFrame }: RepeatOptions): readonly Frame[] {
    const checked = path(source);
    const distances = repeatDistances(checked.distances[checked.distances.length - 1], spacing, startOffset, allowed, excluded);
    const frames = sampleFrames(checked, distances);
    return localFrame === undefined ? frames : offsetFrames(frames, localFrame);
}

/** Place content at regular path distances. Spacing defaults to 1 m and
 * startOffset to 0 m; localFrame adjusts each pose independently of spacing.
 * Half-open allowed and excluded spans filter candidates without resetting
 * phase. The path endpoint is never a candidate. */
export function repeat(content: Content, options: RepeatOptions): Construction {
    const frames = repeatFrames(options);
    return instance(content, frames);
}
