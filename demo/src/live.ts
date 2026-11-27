import {
  Camera, Materials, Meshes, MeshInstance, MeshMaterial, StandardMaterial, Transform,
  type Plugin, type World, type Resource,
} from '@dylanebert/shallot';
import type { MaterialHandle } from '@dylanebert/shallot/standard/rendering';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { composeMat4, decomposeMat4, multiplyMat4 } from '@dylanebert/shallot/utils';
import { resetInterpolation } from '@dylanebert/shallot/transform';
import { Orbit, OrbitPlugin } from '@dylanebert/shallot/extras';
import { Grid, GridPlugin } from '@dylanebert/shallot-grid';
import { frameTrack, frameTrackCenter, initializeView, Scene } from './scene';
import { normalForce, forceColor } from './loop-force';
import { assemblyDefaults, assemblyPath, gapDefaults, postDefaults, validateAssembly, type Assembly } from './assembly';
import { changesSubject } from './selection';
import { diagnosticPost } from './construction-demo';
import { readNative, nativeURL, type ImmutableNativeSnapshot } from '../../construction/native';
import { sampleFrames, path, rotate, type Frame, type Path } from '../../construction/geometry';
import { supportPoses } from '../../construction/plane-supports';
import { repeatFrames } from '../../construction/repeat';
import { loadSampledSection, type ConvexSection } from './sampled-section';
import { placements } from './instance';
import { ties, rotation, point, type Parameters } from './track';
import { loadProfile } from './profile';
import { sweepIntervals } from './profile-sweep';
import { replayCurvature, replayFrame, replayLength, restCurvature } from './track-deformation';
import { prepareTrackDeformation, TrackDeformation, TrackDeformationPlugin } from './track-deformation-gpu';
import { trackGeometry, modernTies } from './modern-track';
import { linearColor, defaultPaint, type Paint, type Example } from './configuration';
import { initializeRailGeometry, RailGpu, RailGpuPlugin } from './rail-gpu';

export type Selection={
  parameters:Parameters; isolated:boolean; example?:'track'|'assembly'; subject?:Example;
  assembly?:Assembly; asset:'blitz-tie'|'wheel-carrier'; paint?:Paint; appearance?:'material'|'normal-force';
};
type Placement={translation:readonly number[];rotation?:readonly number[]};
type Bounds={low:number[];high:number[]};
type Asset={data:Awaited<ReturnType<typeof loadGltf>>;handles:MeshHandle[];primitives:{mesh:number;matrix:Float32Array;material:MaterialHandle}[]};
type Row={entities:number[];pose:Placement};
type Role={name:string;key:string;rows:Row[]};
type TrackVariant={parts:{name:'rails'|'spine'|'ties';mesh:MeshHandle}[];vertices:Float32Array};
type State={
  previous?:Selection;assets:Map<string,Asset>;paints:Record<keyof Paint,MaterialHandle>;
  paint?:Paint;railMaterial:MaterialHandle;forceMaterial:MaterialHandle;section:ConvexSection;
  paths:Path[];frames:(readonly Frame[])[];roles:Map<string,Role>;
  tracks:Map<string,TrackVariant>;railEntity?:number;trackEntities:number[];
};
export const Live:Resource<State>={create:()=>({assets:new Map(),roles:new Map()} as State)};
const kinds=['straight','curve','loop'] as const;
const variantKey=(p:Parameters)=>`${p.configuration}:${!!p.fixed}:${!!p.secondSpine}`;
function include(bounds:Bounds,p:readonly number[]) {
  for(let a=0;a<3;a++){bounds.low[a]=Math.min(bounds.low[a],p[a]);bounds.high[a]=Math.max(bounds.high[a],p[a]);}
}
function emptyBounds():Bounds{return {low:[Infinity,Infinity,Infinity],high:[-Infinity,-Infinity,-Infinity]};}
function frameBounds(world:World,{low,high}:Bounds,aspect:number) {
  const camera=world.resource(Scene).camera,orbit=world.storage(Orbit);
  const center=low.map((v,a)=>(v+high[a])/2),radius=Math.hypot(...high.map((v,a)=>(v-low[a])/2));
  const vertical=world.storage(Camera).fov.get(camera)*Math.PI/360;
  const halfAngle=Math.atan(Math.tan(vertical)*Math.min(1,aspect));
  orbit.pan.set(camera,center[0],center[1],center[2]);
  orbit.distance.set(camera,Math.max(orbit.minDistance.get(camera),radius*1.1/Math.sin(halfAngle)));
}
function paint(world:World,colors:Paint) {
  const s=world.resource(Live);
  for(const part of ['rails','ties','spine'] as const)
    if(s.paint?.[part]!==colors[part])world.resource(Materials).update(s.paints[part],{baseColor:linearColor(colors[part])});
  s.paint={...colors};
}
function trs(matrix:Float32Array,node:string) {
  const t=decomposeMat4(matrix),rebuilt=composeMat4(t[0],t[1],t[2],t[3],t[4],t[5],t[6],t[7],t[8],t[9]);
  if(matrix.some((v,i)=>!Number.isFinite(v)||Math.abs(v-rebuilt[i])>1e-5*Math.max(1,Math.abs(v))))throw Error(`Static instance ${node}: non-TRS transform`);
  return t;
}
export async function cacheAsset(world:World,name:string,url:URL,supplied?:ImmutableNativeSnapshot) {
  const snapshot=supplied??await readNative(url),data=await loadGltf(nativeURL(snapshot.document));
  if(data.unsupported.length)throw Error(`Unsupported glTF: ${data.unsupported.join(', ')}`);
  // Display-only contact adaptation: the loaded bar underside is y=-.18,
  // at the flat path's y=1.5. The diagnostic source remains an identity
  // 1.5m box; do not feed these display vertices back to its classifier.
  // 2um covers eight f32 epsilons at 1.5m plus the packed endpoint error.
  if(name==='diagnostic-box-post')for(const mesh of data.meshes)
    for(let i=1;i<mesh.vertices.length;i+=8)mesh.vertices[i]-=.180002;
  const materials=new Map<string,MaterialHandle>();
  const primitives=data.instances.map(instance=>{
    const mesh=data.meshes[instance.mesh],source=data.materials[mesh.material],t=trs(instance.matrix,String(instance.node));
    const inverted=t[7]*t[8]*t[9]<0,key=`${mesh.material}:${inverted}`;
    if(!materials.has(key))materials.set(key,world.resource(Materials).add(StandardMaterial({baseColor:source?.color??[1,1,1,1],metallic:source?.metallic??1,perceptualRoughness:source?.roughness??1,emissive:source?.emissive??[0,0,0],doubleSided:source?.doubleSided??false,unlit:source?.unlit??false}),{cullMode:source?.doubleSided?'none':inverted?'front':'back'}));
    return {...instance,material:materials.get(key)!};
  });
  world.resource(Live).assets.set(name,{data,primitives,handles:data.meshes.map(mesh=>world.resource(Meshes).add(mesh))});
}
function samePose(a:Placement,b:Placement) {
  return a.translation.every((v,i)=>v===b.translation[i])&&(a.rotation??[0,0,0,1]).every((v,i)=>v===(b.rotation??[0,0,0,1])[i]);
}
function setPose(world:World,entity:number,matrix:Float32Array) {
  const t=trs(matrix,'composed'),store=world.storage(Transform);
  store.translation.set(entity,t[0],t[1],t[2]);store.rotation.set(entity,t[3],t[4],t[5],t[6]);store.scale.set(entity,t[7],t[8],t[9]);
  resetInterpolation(world,entity);
}
function removeRole(world:World,key:string) {
  const s=world.resource(Live),role=s.roles.get(key);
  if(role)for(const row of role.rows)for(const entity of row.entities)world.destroy(entity);
  s.roles.delete(key);
}
export function place(world:World,roleKey:string,name:string,poses:readonly Placement[],key:string,override?:MaterialHandle,bounds?:Bounds) {
  const s=world.resource(Live),asset=s.assets.get(name)!;
  let role=s.roles.get(roleKey);
  if(role?.name!==name){removeRole(world,roleKey);role={name,key:'',rows:[]};s.roles.set(roleKey,role);}
  if(role.key===key&&!bounds)return;
  while(role.rows.length>poses.length)for(const entity of role.rows.pop()!.entities)world.destroy(entity);
  for(let i=0;i<poses.length;i++) {
    const pose=poses[i],matrix=composeMat4(...pose.translation as [number,number,number],...(pose.rotation??[0,0,0,1]) as [number,number,number,number],1,1,1);
    let row=role.rows[i],changed=!row||!samePose(row.pose,pose);
    if(!row){row={entities:[],pose};role.rows.push(row);}
    for(let j=0;j<asset.primitives.length;j++) {
      const primitive=asset.primitives[j],composed=multiplyMat4(matrix,primitive.matrix);
      if(bounds) {
        const vertices=asset.data.meshes[primitive.mesh].vertices;
        for(let k=0;k<vertices.length;k+=8)include(bounds,[0,1,2].map(a=>composed[a]*vertices[k]+composed[a+4]*vertices[k+1]+composed[a+8]*vertices[k+2]+composed[a+12]));
      }
      let entity=row.entities[j];
      if(entity===undefined){entity=world.create();row.entities.push(entity);world.add(entity,Transform);world.add(entity,MeshInstance,{mesh:asset.handles[primitive.mesh]});changed=true;}
      if(changed)setPose(world,entity,composed);
      const material=override??primitive.material;
      if(!world.has(entity,MeshMaterial))world.add(entity,MeshMaterial,material);
      else if(world.storage(MeshMaterial).material.get(entity)!==material.material||world.storage(MeshMaterial).type.get(entity)!==material.type)world.add(entity,MeshMaterial,material);
    }
    row.pose={translation:[...pose.translation],rotation:pose.rotation?[...pose.rotation]:undefined};
  }
  role.key=key;
}
function clearTrackEntities(world:World) {
  const s=world.resource(Live);for(const e of s.trackEntities)world.destroy(e);s.trackEntities=[];
}
function bindTrack(world:World,parts:TrackVariant['parts']) {
  const s=world.resource(Live);
  while(s.trackEntities.length>parts.length)world.destroy(s.trackEntities.pop()!);
  for(let i=0;i<parts.length;i++) {
    const part=parts[i];let entity=s.trackEntities[i];
    if(entity===undefined){entity=world.create();s.trackEntities.push(entity);world.add(entity,Transform);world.add(entity,MeshInstance,{mesh:part.mesh});world.add(entity,MeshMaterial,s.paints[part.name]);}
    else if(world.storage(MeshInstance).mesh.get(entity)!==part.mesh)world.storage(MeshInstance).mesh.set(entity,part.mesh);
  }
}
function railBounds(s:State,index:number,separation:number,bounds:Bounds) {
  for(const f of s.frames[index])for(const side of [-1,1])for(const xy of s.section) {
    const offset=rotate(f.rotation,[xy[0]+side*separation/2,xy[1],0]);
    include(bounds,f.translation.map((v,a)=>v+offset[a]));
  }
}
function publishInstances(world:World) {
  const s=world.resource(Live),refs=world.resource(Scene);
  refs.instances=[...(s.railEntity===undefined?[]:[[s.railEntity]]),...s.trackEntities.map(e=>[e]),...[...s.roles.values()].flatMap(r=>r.rows.map(row=>row.entities))];
}
function updateScene(world:World,selection:Selection,aspect:number) {
  const s=world.resource(Live),previous=s.previous,newSubject=changesSubject(previous,selection);
  if(!selection.isolated)paint(world,selection.paint??defaultPaint);
  const assembly=selection.example==='assembly'&&!selection.isolated;
  const wantedRoles=new Set<string>();
  if(assembly) {
    const a:Assembly=selection.assembly??assemblyDefaults;validateAssembly(a);
    const witness=a.witness??assemblyDefaults.witness;
    const kind=witness==='supports'?'straight':a.path,index=kinds.indexOf(kind),source=s.paths[index],total=source.distances.at(-1)!;
    const gpu=world.resource(RailGpu);gpu.path=index;gpu.separation=a.separation;gpu.colored=selection.appearance==='normal-force'&&kind==='loop';
    clearTrackEntities(world);
    if(s.railEntity===undefined){s.railEntity=world.create();world.add(s.railEntity,Transform);world.add(s.railEntity,MeshInstance,{mesh:gpu.handle});}
    const material=gpu.colored?s.forceMaterial:s.railMaterial;
    if(!world.has(s.railEntity,MeshMaterial))world.add(s.railEntity,MeshMaterial,material);
    else if(world.storage(MeshMaterial).material.get(s.railEntity)!==material.material||world.storage(MeshMaterial).type.get(s.railEntity)!==material.type)world.add(s.railEntity,MeshMaterial,material);
    const bounds=newSubject?emptyBounds():undefined;if(bounds)railBounds(s,index,a.separation,bounds);
    const start=a.gapStart??gapDefaults.start,end=a.gapEnd??gapDefaults.end;
    const tieKey=`${index}:${a.spacing}:${witness==='station'?`${start}:${end}`:''}:${a.tie}`;
    wantedRoles.add('ties');
    if(s.roles.get('ties')?.key!==tieKey||bounds) {
      const excluded=witness==='station'&&start!==end?[{start,end}]:[];
      const poses=repeatFrames({path:source,spacing:a.spacing,allowed:[{start:0,end:total}],excluded});
      place(world,'ties',a.tie,poses,tieKey,undefined,bounds);
    }
    if(witness==='supports') {
      wantedRoles.add('posts');const distances=[a.post1??postDefaults.post1,a.post2??postDefaults.post2],key=distances.join(':');
      if(s.roles.get('posts')?.key!==key||bounds) {
        const attachments=sampleFrames(source,distances);
        const poses=supportPoses(attachments,{point:[0,0,0],normal:[0,1,0]});
        place(world,'posts','diagnostic-box-post',poses,key,undefined,bounds);
      }
    }
    if(bounds)frameBounds(world,bounds,aspect);
  } else {
    if(s.railEntity!==undefined){world.destroy(s.railEntity);s.railEntity=undefined;}
    if(selection.isolated) {
      clearTrackEntities(world);wantedRoles.add('witness');
      place(world,'witness',selection.asset,placements,selection.asset);
      if(newSubject){const camera=world.resource(Scene).camera;world.storage(Orbit).pan.set(camera,0,0,0);world.storage(Orbit).distance.set(camera,8);}
    } else {
      const p=selection.parameters,variant=s.tracks.get(variantKey(p));
      if(!variant)throw Error('Unsupported prepared track variant');
      if(!previous||previous.isolated||previous.example==='assembly'||variantKey(previous.parameters)!==variantKey(p)) bindTrack(world,variant.parts);
      if(newSubject)frameTrack(world,p,variant.vertices);
      for(const name of modernTies(p)) {
        wantedRoles.add(name);const key=`${p.configuration}:${p.spacing}`;
        if(s.roles.get(name)?.key!==key)place(world,name,name,ties(p).map(f=>({translation:f.p,rotation:rotation(f)})),key,s.paints.ties);
      }
    }
  }
  for(const key of s.roles.keys())if(!wantedRoles.has(key))removeRole(world,key);
  publishInstances(world);
  s.previous={...selection,parameters:{...selection.parameters},assembly:selection.assembly?{...selection.assembly}:undefined};
}
/** A small adapter facade; all scene/content/producer state is world-local plain data. */
export function liveScene(initial:Selection,assetUrl:(name:string)=>URL,aspect=()=>1,replay=false) {
  let world:World;
  const poseReplayTies = (curvature: number) => {
    const s=world.resource(Live);
    place(world,'ModernTie_Med','ModernTie_Med',ties(initial.parameters,replayFrame(curvature))
      .map(f=>({translation:f.p,rotation:rotation(f)})),String(curvature),s.paints.ties);
  };
  const plugin:Plugin={name:'LiveScene',dependencies:[OrbitPlugin,GridPlugin,replay?TrackDeformationPlugin:RailGpuPlugin],async initialize(w){
    world=w;const s=w.resource(Live);
    Object.assign(s,{assets:new Map(),paints:{},roles:new Map(),tracks:new Map(),trackEntities:[],paths:[],frames:[]});
    initializeView(w,initial.isolated?undefined:initial.parameters);
    w.storage(Grid).opacity.set(w.resource(Scene).grid,.12);
    for(const part of ['rails','ties','spine'] as const)s.paints[part]=w.resource(Materials).add(StandardMaterial({baseColor:linearColor((initial.paint??defaultPaint)[part]),metallic:.4,perceptualRoughness:.35}));
    s.paint={...(initial.paint??defaultPaint)};
    if(replay) {
      await cacheAsset(w,'ModernTie_Med',assetUrl('ModernTie_Med'));
      const [rail,spine]=await Promise.all([loadProfile(assetUrl('ModernRail')),loadProfile(assetUrl('ModernSpine_1'))]);
      bindTrack(w,prepareTrackDeformation(w,rail,spine));
      // Same framing as the stock f32 sweep, without making a CPU vertex mesh.
      const bounds=emptyBounds(),at=replayFrame(restCurvature);
      for(let i=0;i<=sweepIntervals;i++) {
        const f=at(replayLength*i/sweepIntervals);
        for(const profile of [rail,spine])for(const xy of profile.points)include(bounds,point(f,...xy).map(Math.fround));
      }
      const center=bounds.low.map((low,a)=>(low+bounds.high[a])/2) as [number,number,number];
      frameTrackCenter(w,initial.parameters,center);
      poseReplayTies(restCurvature);
      publishInstances(w);
      return;
    }
    s.forceMaterial=w.resource(Materials).add(StandardMaterial({baseColor:[.8,.8,.8,1],metallic:.7,perceptualRoughness:.25}));
    s.railMaterial=w.resource(Materials).add(StandardMaterial({baseColor:[.06,.7,.78,1],metallic:.7,perceptualRoughness:.25}));
    s.section=await loadSampledSection(assetUrl('assembly-section'));
    for(const name of ['blitz-tie','wheel-carrier','ModernTie_Med','ModernTie_Dense','assembly-tie-bar','assembly-tie-fork'])await cacheAsset(w,name,assetUrl(name));
    await cacheAsset(w,'diagnostic-box-post',assetUrl('diagnostic-box-post'),diagnosticPost);
    for(const kind of kinds) {
      const source=assemblyPath(kind),total=source.distances.at(-1)!,distances=Array.from({length:97},(_,i)=>total*i/96),frames=sampleFrames(source,distances);
      s.frames.push(frames);s.paths.push(path({distances,positions:frames.map(f=>f.translation),rotations:frames.map(f=>f.rotation)}));
    }
    initializeRailGeometry(w,s.frames,s.section,s.paths.map(p=>p.distances.map(distance=>forceColor(normalForce(distance)))));
    const geometryFor=trackGeometry(assetUrl);
    for(const configuration of kinds)for(const secondSpine of [false,true]) {
      const p={...initial.parameters,configuration,fixed:true,secondSpine},mesh=await geometryFor(p);
      const parts=mesh.parts.filter(part=>part.index!==part.endIndex).map(part=>{
        const shared=secondSpine&&part.name==='rails'?s.tracks.get(variantKey({...p,secondSpine:false}))!.parts.find(p=>p.name==='rails')!.mesh:undefined;
        return {name:part.name,mesh:shared??w.resource(Meshes).add({name:`Track ${part.name}`,vertices:mesh.vertices.subarray(part.vertex*8,part.endVertex*8),indices:mesh.indices.slice(part.index,part.endIndex).map(i=>i-part.vertex)})};
      });
      s.tracks.set(variantKey(p),{parts,vertices:mesh.vertices});
    }
    updateScene(w,initial,aspect());
  }};
  return {plugin,async update(selection:Selection){updateScene(world,selection,aspect());},
    replayAt: replay ? (seconds:number) => {
      const retained=world.resource(TrackDeformation).retained!;
      const curvature=replayCurvature(seconds);
      if(curvature===retained.revision)return;
      poseReplayTies(curvature);
      retained.revision=curvature;
    } : undefined,
  };
}
