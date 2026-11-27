import { offsetFrames, sampleFrames } from '../construction/geometry';
import type { Content } from '../construction/native';
import { sampledSection } from '../construction/section';
import { defaultSpacing, defaultTrackEnd, guideTies, tieGap } from '../site/src/guide-recipe';
import { centerline, courseColor } from './centerline';
import { path } from './model';
import { railEnd } from './rail-end';
import { project, view } from './view';

export async function guidePreview(panel: string, tie: Content) {
  const sweep = panel === 'swept-rail';
  const gap = panel === 'tie-gap';
  const joined = panel === 'joined-track' || gap;
  const sectionURL = new URL('../demo/assets/assembly-section.gltf', document.baseURI);
  const profile = sweep || joined ? await loadSection(sectionURL) : undefined;
  const near = offsetFrames(sampleFrames(path, [0]), { translation: [-.60, 0, 0], rotation: [0, 0, 0, 1] })[0]!;
  return {
    ties: sweep ? undefined : tie,
    course: joined ? undefined : { mesh: centerline(), color: courseColor },
    emitter: profile && ((world: Parameters<typeof railEnd>[0]) => railEnd(world, profile, joined)),
    label: sweep ? project(near.translation as [number, number, number], view) : undefined,
    evaluate(spacing = defaultSpacing, end = defaultTrackEnd, gapEnd?: number) {
      if (gap) return { construction: guideTies(tie, defaultSpacing, defaultTrackEnd, tieGap(gapEnd)),
        distance: defaultSpacing, end: defaultTrackEnd, pose: undefined };
      return { construction: sweep ? { placements: [] } : guideTies(tie, spacing, joined ? end : undefined),
        distance: sweep ? end : spacing, end, pose: undefined };
    },
  };
}

async function loadSection(url: URL) {
  const fetchAsset = async (url: URL) => {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Section asset unavailable: ${response.status}`);
    return response;
  };
  const document = await (await fetchAsset(url)).json();
  return sampledSection(document, await Promise.all(document.buffers.map(async ({ uri }: { uri: string }) =>
    (await fetchAsset(new URL(uri, url))).arrayBuffer())));
}
