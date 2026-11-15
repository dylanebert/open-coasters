import diagnosticSource from '../../construction/witness/resolved-supports.gltf?raw';
import normal from '../../construction/normal-track.json?raw';
import support from '../../construction/plane-supports.json?raw';
import { normalTrack, stationGap } from '../../construction/normal-track';
import { supportRegistry, planeId } from '../../construction/plane-supports';
import { parseDocument } from '../../construction/kernel';
import { framesAt, ids, join, nominal } from '../../construction/geometry';
import { nativeSnapshot, type Construction, type Content } from '../../construction/native';
import { postDefaults, assemblyDefaults, resolveAssembly, railAppearance, type Assembly } from './assembly';
import type { SampledSection } from './sampled-section';
const diagnosticDocument=JSON.parse(diagnosticSource);
// Reuse the authored diagnostic bytes, selecting one identity post, not a contributed asset kind.
diagnosticDocument.nodes=[{mesh:0}]; diagnosticDocument.scenes=[{nodes:[0]}];
export const diagnosticPost=nativeSnapshot(diagnosticDocument,diagnosticDocument.buffers.map((b: {uri:string})=>Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0))));
/** Explicitly executes the installed support library only for that selected witness.
 * Native reading is separate. No catch-and-bake or recipe fallback. */
export function constructDemo(a: Assembly, section: SampledSection, tie: Content, post: Content) {
  const witness=a.witness??assemblyDefaults.witness;
  const resolved=resolveAssembly({...a,path:witness==='supports'||witness==='station'?'straight':a.path});
  const parameters={path:resolved.path,section,tieContent:tie,separation:a.separation,spacing:a.spacing,wall:railAppearance,cap:railAppearance};
  let construction: Construction;
  if(witness==='station') {
    const start=a.gapStart ?? 4.2, end=a.gapEnd ?? 7.8;
    construction=stationGap({...parameters,excluded:start===end?[]:[{start,end}]},normal,[]);
  } else if(witness==='supports') {
    const supports=supportRegistry().evaluate(parseDocument(support),{inputs:{
      attachments:{type:{list:nominal(ids.frame)},value:framesAt(resolved.path,[a.post1 ?? postDefaults.post1,a.post2 ?? postDefaults.post2])},
      terrain:{type:nominal(planeId),value:{point:[0,0,0],normal:[0,1,0]}},
      post:{type:nominal(ids.content),value:post},
    }}).construction as Construction;
    construction=join([normalTrack(parameters,normal),supports]);
  } else construction=normalTrack(parameters,normal);
  const sources=new Map([[tie.snapshot,a.tie],[post.snapshot,'diagnostic-box-post']]);
  const rails={placements:construction.placements.filter(p=>!sources.has(p.content.snapshot))};
  const parts=[...sources].map(([snapshot,name])=>({name,placements:construction.placements.filter(p=>p.content.snapshot===snapshot).map(p=>p.frame)}));
  return {construction,rails,parts,stations:resolved.path.distances};
}
