import { join, offsetFrames, sampleFrames, type Span } from '../../construction/geometry';
import { contentValue, nativeSnapshot, readNative, snapshotBytes } from '../../construction/native';
import { sweep } from '../../construction/sweep';
import { profile } from '../../examples/sweep-rail';
import { path } from '../../visualizer/model';
import { defaultSpacing, defaultTrackEnd, guideTies, linearRgba, wallColors } from './guide-recipe';
export { defaultSpacing, defaultTrackEnd, linearRgba } from './guide-recipe';

export async function loadTrackInputs() {
  const source = await readNative(new URL('../../demo/public/assets/blitz-tie.gltf', import.meta.url));
  const tie = contentValue({ snapshot: source });
  const doc = structuredClone(source.document);
  (doc.materials ??= [])[0] = {
    name: 'Metal', pbrMetallicRoughness: {
      baseColorFactor: linearRgba(wallColors.light), metallicFactor: 0, roughnessFactor: 0.8,
    },
  };
  const metal = { material: 0, snapshot: nativeSnapshot(doc, doc.buffers.map((_, i) => snapshotBytes(source, i))) };
  return { tie, path, profile, metal };
}

type Inputs = Awaited<ReturnType<typeof loadTrackInputs>>;

export function repeatedTies({ tie }: Inputs, spacing = defaultSpacing) {
  return guideTies(tie, spacing);
}

export function firstRail({ path, profile, metal }: Inputs, trackEnd = defaultTrackEnd) {
  const stations = path.distances.filter(s => s <= trackEnd);
  const frames = sampleFrames(path, stations);
  const railFrames = offsetFrames(frames, {
    translation: [-0.60, 0, 0],
    rotation: [0, 0, 0, 1],
  });
  return { rail: sweep(profile, railFrames, metal), near: railFrames[0]!.translation };
}

export function joinedTrack({ tie, path, profile, metal }: Inputs,
  spacing = defaultSpacing, trackEnd = defaultTrackEnd, excluded?: readonly Span[]) {
  const stations = [...path.distances.filter(s => s < trackEnd), trackEnd];
  const frames = sampleFrames(path, stations);
  const leftFrames = offsetFrames(frames, {
    translation: [-0.60, 0, 0],
    rotation: [0, 0, 0, 1],
  });
  const rightFrames = offsetFrames(frames, {
    translation: [0.60, 0, 0],
    rotation: [0, 0, 0, 1],
  });
  const leftRail = sweep(profile, leftFrames, metal);
  const rightRail = sweep(profile, rightFrames, metal);
  const ties = guideTies(tie, spacing, trackEnd, excluded);
  return join([leftRail, rightRail, ties]);
}
