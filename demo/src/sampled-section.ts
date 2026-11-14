import type { GltfJson } from '@dylanebert/shallot/gltf';
import { sampledSection } from '../../construction/section';
export { sampledSection, type SampledSection } from '../../construction/section';
export async function loadSampledSection(url: URL) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Section fetch failed');
  const json: GltfJson = await response.json();
  const buffers = await Promise.all((json.buffers ?? []).map(async b => {
    if (!b.uri) throw new Error('Section buffer URI required');
    const r = await fetch(new URL(b.uri, response.url || url));
    if (!r.ok) throw new Error('Section buffer fetch failed');
    return r.arrayBuffer();
  }));
  return sampledSection(json, buffers);
}
