import { expect, test } from 'bun:test';
import { Meshes, MeshInstance, type World } from '@dylanebert/shallot';
import { Orbit } from '@dylanebert/shallot/extras';
import { loadGltf } from '@dylanebert/shallot/gltf';
import type { Mesh, MeshHandle } from '@dylanebert/shallot/mesh';
import { attachTexture, captureTexture, globalTransformTable } from '@dylanebert/shallot/rendering';
import { octDecodeNormal } from '@dylanebert/shallot/utils';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { effective, initialConfiguration } from './configuration';
import { readGpuBuffer, readMesh, trackWork } from './gpu-probe';
import { staticInstanceSnapshot } from './instance';
import { Live, liveScene } from './live';
import { loadProfile } from './profile';
import { sweepProfile, sweepIntervals } from './profile-sweep';
import { Scene } from './scene';
import { TrackDeformation } from './track-deformation-gpu';
import { arc, asset, nativePoint, posePoint, replaySamples, sectionAssets } from './track-deformation-oracle';

const initial = effective({...initialConfiguration, selected:'track', values:{...initialConfiguration.values,
  track:{path:'curve', secondSpine:false},
}});
const names = ['rails','spine'] as const;
const meshAt = (w:World, entity:number) => w.resource(Meshes).get(w.storage(MeshInstance).mesh.get(entity) as MeshHandle)!;
const camera = (w:World) => w.resource(Scene).camera;
function orbit(w:World) {
  const o=w.storage(Orbit), c=camera(w);
  return [o.yaw.get(c), o.pitch.get(c), o.distance.get(c), ...o.pan.read(c,new Float32Array(4))];
}
function xyzError(a:readonly number[], b:readonly number[]) {
  return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
}
const cross = ([x,y,z]:readonly number[],[a,b,c]:readonly number[]) => [y*c-z*b,z*a-x*c,x*b-y*a];
function renderPoint(row:Float32Array, p:readonly number[]) {
  const [qx,qy,qz,qw]=row.subarray(4,8), q=[qx,qy,qz];
  const v=p.map((x,i)=>x*row[8+i]);
  const u=cross(q,v), t=cross(q,u);
  return v.map((x,i)=>row[i]+x+2*(qw*u[i]+t[i]));
}
const compare = (a:readonly number[], b:readonly number[], tol:number, label:string) => expect(xyzError(a,b),label).toBeLessThan(tol);

async function submittedSweep(w:World, mesh:Mesh, profile:Awaited<ReturnType<typeof loadProfile>>, radius:number, label:string) {
  const expected=sweepProfile(profile,'curve',0,arc(radius));
  const raw=await readMesh(w,mesh).catch((error:unknown)=>{throw Error(`${label}: ${error}`);});
  const words=new Uint32Array(raw.main), position=new Uint32Array(raw.position);
  const ids=new Uint32Array(raw.indices,mesh.indexBase*4,mesh.indexCount);
  const q=new DataView(raw.quant), base=Math.min(...ids);
  expect(expected.positions.length, `${label} referenced vertices`).toBe(new Set(ids).size);
  expect(ids.length, `${label} index count`).toBe(expected.indices.length);
  for(let i=0; i<ids.length; i++) if(ids[i]-base!==expected.indices[i])
    throw Error(`${label} directed index ${i}: ${ids[i]-base} != ${expected.indices[i]}`);
  const caps=profile.contours.flat().length*(sweepIntervals+1)*2;
  let low=Infinity, maxPosition=0, maxNormal=0;
  const bounds=mesh.bounds!;
  // One grid quantum per coordinate, plus error from f32 position input,
  // local offsets, multiply/add and quant arithmetic. Normals are snorm16 oct.
  for(let i=0; i<expected.positions.length; i++) {
    const at=base+i, detail=`${label} ${i<caps?'wall':'cap'} vertex ${i}`;
    const a=words[at*4], b=words[at*4+1], row=(b>>>16)*48;
    expect(position[at*2], detail).toBe(a);
    expect(position[at*2+1], detail).toBe(b);
    const decoded=[a&65535,a>>>16,b&65535].map((v,j)=>{
      const lo=q.getFloat32(row+j*4,true), span=q.getFloat32(row+16+j*4,true), want=expected.positions[i][j];
      const tol=span/65535+8*2**-23*Math.max(1,Math.abs(lo),span);
      if(want<lo-1e-6 || want>lo+span+1e-6)throw Error(`${detail} axis ${j} outside quant bounds`);
      const got=lo+v/65535*span, err=Math.abs(got-want);
      expect(err, `${detail} position axis ${j}`).toBeLessThan(tol);
      maxPosition=Math.max(maxPosition,err);
      return got;
    });
    const n=octDecodeNormal(words[at*4+2]);
    const err=xyzError([n.x,n.y,n.z],expected.normals[i]);
    expect(err, `${detail} normal`).toBeLessThan(.00012);
    maxNormal=Math.max(maxNormal,err);
    expect(xyzError(decoded,bounds), `${detail} rendered bounds`).toBeLessThanOrEqual(bounds[3]+.0002);
    expect(xyzError(expected.positions[i],bounds), `${detail} CPU bounds`).toBeLessThanOrEqual(bounds[3]+1e-6);
    low=Math.min(low,decoded[1]);
  }
  expect(low, `${label} grid clearance`).toBeGreaterThan(0);
  return {raw, maxPosition, maxNormal, low};
}

type Native = Awaited<ReturnType<typeof loadGltf>>;
async function submittedTies(w:World, native:Native, radius:number, label:string) {
  const roles=w.resource(Live).roles;
  expect([...roles.keys()],label).toEqual(['ModernTie_Med']);
  const entities=w.resource(Scene).instances.slice(2);
  expect(entities,label).toHaveLength(20);
  expect(new Set(entities.flat()).size,label).toBe(20*native.instances.length);
  const table=globalTransformTable(w), rows=new Float32Array(await readGpuBuffer(w,table.buffer));
  const transforms:number[][]=[];
  const meshes=await Promise.all(entities[0].map(e=>readMesh(w,meshAt(w,e))));
  let low=Infinity;
  for(let i=0; i<20; i++) {
    let offPlane=false, tieLow=Infinity;
    const pose=arc(radius)(.65*i);
    expect(entities[i],`${label} tie ${i}`).toHaveLength(native.instances.length);
    for(let j=0; j<native.instances.length; j++) {
      const detail=`${label} ModernTie_Med ${i} primitive ${j}`;
      const instance=native.instances[j], source=native.meshes[instance.mesh], entity=entities[i][j];
      expect(meshAt(w,entity),detail).toBe(meshAt(w,entities[0][j]));
      const index=table.rowIndex(entity);
      expect(index,detail).toBeGreaterThanOrEqual(0);
      const row=rows.subarray(index*12,index*12+12);
      transforms.push(Array.from(row));
      const want=(p:readonly number[])=>posePoint(pose,nativePoint(instance.matrix,p[0],p[1],p[2]));
      for(const p of [[0,0,0],[1,0,0],[0,1,0],[0,0,1]]) {
        compare(renderPoint(row,p),want(p),4e-6,`${detail} transform of ${p}`);
      }
      const submitted=meshes[j].points;
      expect(submitted.length,detail).toBe(source.indices.length);
      let corner=-1, depth=1e-3;
      for(let k=0; k<source.indices.length; k++) {
        const id=source.indices[k]*8, p=source.vertices.subarray(id,id+3);
        const local=nativePoint(instance.matrix,p[0],p[1],p[2]);
        if(Math.abs(local[2])>depth){corner=k;depth=Math.abs(local[2]);}
        tieLow=Math.min(tieLow,renderPoint(row,submitted[k])[1]);
      }
      if(corner>=0) {
        const id=source.indices[corner]*8;
        compare(renderPoint(row,submitted[corner]),want(Array.from(source.vertices.subarray(id,id+3))),
          4e-6+2*meshAt(w,entity).bounds![3]/65535,`${detail} off-plane submitted native corner`);
        offPlane=true;
      }
    }
    expect(offPlane,`${label} ModernTie_Med ${i} off-plane tie coverage`).toBe(true);
    expect(tieLow,`${label} ModernTie_Med ${i} grid clearance`).toBeGreaterThan(0);
    low=Math.min(low,tieLow);
  }
  return {transforms,low};
}

const target={width:640,height:400};
type CaptureRgba = Awaited<ReturnType<typeof captureTexture>>['rgba'];

function changed(a:CaptureRgba,b:CaptureRgba) {
  let count=0;
  for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])))>8)count++;
  return count;
}

test('stock baseline then full submitted replay, rendered native ties and held work', async () => {
  const [profiles,native]=await Promise.all([
    Promise.all(sectionAssets.map(name=>loadProfile(asset(name)))),
    staticInstanceSnapshot(asset('ModernTie_Med')).then(loadGltf),
  ]);
  const ordinary=liveScene(initial,asset);
  const baselineApp=await openGpuApp({plugins:[ordinary.plugin]});
  let baseline!: CaptureRgba, baselineOrbit!: number[];
  try {
    const w=baselineApp.world;
    attachTexture(w,camera(w),target);
    w.step(1/60);await w.frameFence;
    expect(w.resource(TrackDeformation).retained).toBeUndefined();
    baselineOrbit=orbit(w);
    for(let i=0;i<2;i++)await submittedSweep(w,meshAt(w,w.resource(Live).trackEntities[i]),profiles[i],8,`ordinary rest ${names[i]}`);
    await submittedTies(w,native,8,'ordinary rest');
    baseline=(await captureTexture(w,camera(w))).rgba;
  } finally {baselineApp.dispose();}

  const live=liveScene(initial,asset,()=>1,true);
  const app=await openGpuApp({plugins:[live.plugin]});
  try {
    const w=app.world, retained=w.resource(TrackDeformation).retained!;
    attachTexture(w,camera(w),target);
    const scene=w.resource(Scene), state=w.resource(Live);
    const entities=scene.instances.map(group=>[...group]);
    const registered=[...w.resource(Meshes).entries()];
    const probe=trackWork(w);
    let rest: Awaited<ReturnType<typeof submittedSweep>>[] | undefined;
    let restTies: number[][] | undefined, restImage:CaptureRgba | undefined;
    try {
      for(const {name,time,radius} of replaySamples) {
        live.replayAt!(time);
        Object.assign(probe.work,{dispatches:0,frameBytes:0,meshBytes:0,tieMeshBytes:0,tieBytes:0});
        w.step(1/60);await w.frameFence;
        const dirty=time<=7;
        expect(probe.work.dispatches, name).toBe(dirty?2:0);
        expect(probe.work.frameBytes, name).toBe(dirty?(192+1)*16*4:0);
        expect(probe.work.meshBytes, name).toBe(0);
        expect(probe.work.tieMeshBytes, name).toBe(0);
        if(dirty)expect(probe.work.tieBytes,name).toBeGreaterThan(0);
        else expect(probe.work.tieBytes,name).toBe(0);
        expect(retained.submitted, name).toBeCloseTo(1/radius,12);
        expect(orbit(w),`${name} fixed stock camera`).toEqual(baselineOrbit);
        expect(scene.instances,`${name} entity identity`).toEqual(entities);
        expect([...w.resource(Meshes).entries()],`${name} mesh identity`).toEqual(registered);
        const sweep=[];
        for(let i=0;i<2;i++)sweep.push(await submittedSweep(w,meshAt(w,state.trackEntities[i]),profiles[i],radius,`${name} ${names[i]}`));
        const ties=await submittedTies(w,native,radius,name);
        const image=(await captureTexture(w,camera(w))).rgba;
        if(!rest) {
          rest=sweep;restTies=ties.transforms;restImage=image;
          expect(changed(image,baseline),`${name} vs stock rendered canvas`).toBeLessThan(640);
        } else {
          for(let i=0;i<2;i++){
            expect(sweep[i].raw.indices,`${name} ${names[i]} retained topology`).toEqual(rest[i].raw.indices);
            expect(sweep[i].raw.quant,`${name} ${names[i]} retained quant bounds`).toEqual(rest[i].raw.quant);
            if(radius===8) {
              expect(sweep[i].raw.main,`${name} ${names[i]} exact rest`).toEqual(rest[i].raw.main);
              expect(sweep[i].raw.position,`${name} ${names[i]} exact rest position stream`).toEqual(rest[i].raw.position);
            }
          }
          if(radius===8) {
            expect(ties.transforms,`${name} exact tie rest`).toEqual(restTies!);
            expect(changed(image,restImage!),`${name} exact rest canvas`).toBe(0);
          } else expect(changed(image,restImage!),`${name} moving canvas`).toBeGreaterThan(900);
        }
        console.log(name, {work:{...probe.work}, rails:sweep[0].maxPosition, spine:sweep[1].maxPosition,
          maxNormal:Math.max(...sweep.map(s=>s.maxNormal)), ground:Math.min(ties.low,...sweep.map(s=>s.low)), pixelsFromStock:changed(image,baseline)});
      }
    } finally {probe.restore();}
  } finally {app.dispose();}
}, 15_000);
