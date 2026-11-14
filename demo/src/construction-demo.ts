import diagnosticSource from '../../construction/witness/resolved-supports.gltf?raw';
import normal from '../../construction/normal-track.json?raw';
import support from '../../construction/plane-supports.json?raw';
import switched from '../../construction/static-switch.json?raw';
import { normalTrack, stationGap } from '../../construction/normal-track';
import { staticSwitch } from '../../construction/static-switch';
import { supportRegistry, planeId } from '../../construction/plane-supports';
import { parseDocument } from '../../construction/kernel';
import { frame, framesAt, ids, instance, join, nominal } from '../../construction/geometry';
import { nativeSnapshot, type Construction, type Content } from '../../construction/native';
import { postDefaults, assemblyDefaults, resolveAssembly, railAppearance, type Assembly } from './assembly';
import type { SampledSection } from './sampled-section';
const diagnosticDocument=JSON.parse(diagnosticSource);
// Reuse the authored diagnostic bytes, selecting one identity post, not a contributed asset kind.
diagnosticDocument.nodes=[{mesh:0}]; diagnosticDocument.scenes=[{nodes:[0]}];
export const diagnosticPost=nativeSnapshot(diagnosticDocument,diagnosticDocument.buffers.map((b: {uri:string})=>Uint8Array.from(atob(b.uri.split(',')[1]),c=>c.charCodeAt(0))));
const pose=(x:number,y:number,z:number)=>frame({translation:[x,y,z],rotation:[0,0,0,1]});
/** Explicitly executes the installed support library only for that selected witness.
 * Native reading is separate. No catch-and-bake or recipe fallback. */
export function constructDemo(a: Assembly, section: SampledSection, tie: Content, fitting: Content, post: Content) {
  const witness=a.witness??assemblyDefaults.witness;
  const resolved=resolveAssembly({...a,path:witness==='supports'||witness==='switch'?'straight':a.path});
  const parameters={path:resolved.path,section,tieContent:tie,separation:a.separation,spacing:a.spacing,wall:railAppearance,cap:railAppearance};
  let construction: Construction;
  if(witness==='station') {
    const total=resolved.path.distances.at(-1)!;
    construction=stationGap({...parameters,excluded:[{start:total*.35,end:total*.65}]},normal,[{content:fitting,frames:framesAt(resolved.path,[total*.35,total*.65])}]);
  } else if(witness==='supports') {
    const supports=supportRegistry().evaluate(parseDocument(support),{inputs:{
      attachments:{type:{list:nominal(ids.frame)},value:framesAt(resolved.path,[a.post1 ?? postDefaults.post1,a.post2 ?? postDefaults.post2])},
      terrain:{type:nominal(planeId),value:{point:[0,0,0],normal:[0,1,0]}},
      post:{type:nominal(ids.content),value:post},
    }}).construction as Construction;
    construction=join([normalTrack(parameters,normal),supports]);
  } else if(witness==='switch') {
    // Already owned parts, not a path junction generator. Shared approach appears once.
    construction=staticSwitch(switched,{approach:instance(tie,[pose(0,1.5,-2),pose(0,1.5,-1)]),left:instance(tie,[pose(-.5,1.5,0),pose(-1,1.5,1)]),right:instance(tie,[pose(.5,1.5,0),pose(1,1.5,1)]),custom:instance(fitting,[pose(0,1.5,0)])});
  } else construction=normalTrack(parameters,normal);
  const sources=new Map([[tie.snapshot,a.tie],[fitting.snapshot,'assembly-fitting'],[post.snapshot,'diagnostic-box-post']]);
  const rails={placements:construction.placements.filter(p=>!sources.has(p.content.snapshot))};
  const parts=[...sources].map(([snapshot,name])=>({name,placements:construction.placements.filter(p=>p.content.snapshot===snapshot).map(p=>p.frame)}));
  return {construction,rails,parts,stations:resolved.path.distances};
}
