import { bankedCurveFrame, length } from './track';

export const restCurvature = 1 / 8;
export const peakCurvature = 1 / 6;
export const bendStart = 1;
export const bendPeak = 4;
export const bendEnd = 7;

// A single smooth pulse: 1 s at rest, 3 s in, 3 s out, then exact rest.
export function replayCurvature(seconds: number) {
  if (seconds <= bendStart || seconds >= bendEnd) return restCurvature;
  const amount = Math.sin(Math.PI * (seconds - bendStart) / (bendEnd - bendStart)) ** 2;
  return restCurvature + (peakCurvature - restCurvature) * amount;
}
export const replayLength = length('curve');
export const replayFrame = (curvature: number) => (s: number) => bankedCurveFrame(s, curvature);
