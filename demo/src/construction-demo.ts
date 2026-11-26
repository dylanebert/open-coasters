import diagnosticSource from '../../construction/witness/resolved-supports.gltf?raw';
import { normalTrack, stationGap } from '../../construction/normal-track';
import { planeSupports } from '../../construction/plane-supports';
import { sampleFrames, join } from '../../construction/geometry';
import { nativeSnapshot, type Construction, type Content } from '../../construction/native';
import { postDefaults, gapDefaults, assemblyDefaults, resolveAssembly, railAppearance, type Assembly } from './assembly';
import type { ConvexSection } from './sampled-section';
const diagnosticDocument=JSON.parse(diagnosticSource);
// Reuse the authored diagnostic bytes, selecting one identity post, not a contributed asset kind.
diagnosticDocument.nodes=[{mesh:0}]; diagnosticDocument.scenes=[{nodes:[0]}];
export const diagnosticPost=nativeSnapshot(diagnosticDocument,diagnosticDocument.buffers.map((b: {uri:string})=>Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0))));
/** Explicitly invokes the native support recipe only for that selected witness.
 * Native reading is separate. No catch-and-bake or recipe fallback. */
export function constructDemo(a: Assembly, section: ConvexSection, tie: Content, post: Content) {
  const witness=a.witness??assemblyDefaults.witness;
  const resolved=resolveAssembly({...a,path:witness==='supports'?'straight':a.path});
  const parameters={path:resolved.path,section,tieContent:tie,separation:a.separation,spacing:a.spacing,material:railAppearance};
  let construction: Construction;
  if(witness==='station') {
    const start=a.gapStart ?? gapDefaults.start, end=a.gapEnd ?? gapDefaults.end;
    construction=stationGap({...parameters,excluded:start===end?[]:[{start,end}]},[]);
  } else if(witness==='supports') {
    const attachments=sampleFrames(resolved.path,[a.post1 ?? postDefaults.post1,a.post2 ?? postDefaults.post2]);
    const supports=planeSupports(attachments,{point:[0,0,0],normal:[0,1,0]},post);
    construction=join([normalTrack(parameters),supports]);
  } else construction=normalTrack(parameters);
  const sources=new Map([[tie.snapshot,a.tie],[post.snapshot,'diagnostic-box-post']]);
  const rails={placements:construction.placements.filter(p=>!sources.has(p.content.snapshot))};
  const parts=[...sources].map(([snapshot,name])=>({name,placements:construction.placements.filter(p=>p.content.snapshot===snapshot).map(p=>p.frame)}));
  return {construction,rails,parts,stations:resolved.path.distances};
}
