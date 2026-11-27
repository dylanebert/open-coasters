import { repeat } from '../../construction/repeat';
import type { Content } from '../../construction/native';
import type { Span } from '../../construction/geometry';
import { bankedLength, path } from '../../visualizer/model';

export const defaultSpacing = .6;
export const defaultTrackEnd = bankedLength;
export const gapStart = 1.1;
export const defaultGapEnd = 2.2;
export const tieGap = (end = defaultGapEnd) => [{ start: gapStart, end }];
export const wallColors = { light: '#77756f', dark: '#aaa79c' };

export function linearRgba(hex: string): [number, number, number, number] {
  const linear = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  const [r, g, b] = [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return [r!, g!, b!, 1];
}

export function guideTies(tie: Content, spacing: number, trackEnd?: number, excluded?: readonly Span[]) {
  return repeat(tie, {
    path, spacing, startOffset: .15,
    allowed: [{ start: 0, end: trackEnd === undefined ? defaultTrackEnd : trackEnd - .06 }],
    ...(excluded ? { excluded } : {}),
  });
}
