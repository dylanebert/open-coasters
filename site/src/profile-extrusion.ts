import { readFileSync } from 'node:fs';
import { contour, strokes, palettes, type Point } from './profile-plate';
import { annotations, project, cameraConfiguration, cameraTransform, plate } from './plate';
import { contextPlate, tieOffsets, ghostColor } from './tie-context';
import { sha256 } from './profile-evidence';
export const railOrigin:Point=[-.5,.065,.75];
export const railEnd=-1.2;
export const oppositeOrigin:Point=[.5,.065,.75];
export function view(){return {...contextPlate(),origin:railOrigin,axes:[.52,.335,.33].map((extent,axis)=>railOrigin.map((value,i)=>value+(i===axis?extent:0)) as unknown as Point)};}
export function outline(){const m=strokes();return {...m,indices:new Uint32Array([...m.indices,...Array.from(m.indices).reverse()])};}
// Edge strips only: neither end is capped. Coordinates remain authored XY.
export function walls(points=contour(),end=railEnd-railOrigin[2]){
 if(!(end<0&&Number.isFinite(end)))throw Error('Expected negative rail extent');
 const vertices:number[]=[],indices:number[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i]!,b=points[(i+1)%points.length]!,base=vertices.length/8;
  for(const p of [a,b,[b[0],b[1],end],[a[0],a[1],end]])vertices.push(...p,0,0,1,0,0);
  indices.push(base,base+1,base+2,base,base+2,base+3,base+2,base+1,base,base+3,base+2,base);
 }
 return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export const wallColors={light:'#77756f',dark:'#aaa79c'};
const meshInput=(m:ReturnType<typeof walls>)=>({vertices:[...m.vertices],indices:[...m.indices]});
export function inputs(asset=plate().asset){
 const gltf=readFileSync(asset),json=JSON.parse(gltf.toString());
 const {asset: _location,...frame}=view();
 return {contour:contour(),walls:meshInput(walls()),outline:meshInput(outline()),railOrigin,oppositeOrigin,railEnd,
  ties:{source:'demo/public/assets/blitz-tie.gltf',gltf:sha256(gltf),buffers:json.buffers.map((b:{uri:string})=>({uri:b.uri,sha256:sha256(readFileSync(new URL(b.uri,asset)))})),placements:tieOffsets.map(z=>[0,0,z]),ghosted:true},
  foregroundRails:1,view:frame,camera:cameraConfiguration(view()),transform:cameraTransform(view()),palettes,wallColors,ghostColors:{light:ghostColor('light'),dark:ghostColor('dark')}};
}
export const identity=(data=inputs())=>sha256(JSON.stringify(data));
export function assertEvidence(e:{nativeIdentity:string;sha256:Record<string,string>},raw:Uint8Array,name:string){if(e.nativeIdentity!==identity())throw Error('Stale extrusion geometry/view');if(e.sha256[name]!==sha256(raw))throw Error('Raw extrusion hash mismatch');}
export function overlay(theme:keyof typeof palettes){return annotations(view(),palettes[theme].ink,palettes[theme].bg);}
export function registration(){const p=view();return {origin:project(p.origin,p),axes:p.axes.map(a=>project(a,p))};}
