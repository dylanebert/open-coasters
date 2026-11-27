import { expect, test } from 'bun:test';
import { Materials, Meshes, MeshInstance, MeshMaterial, StandardMaterial, Transform, type Plugin, type World } from '@dylanebert/shallot';
import { Orbit, OrbitPlugin } from '@dylanebert/shallot/extras';
import { GridPlugin, Grid } from '@dylanebert/shallot-grid';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { attachTexture, captureTexture, globalTransformTable } from '@dylanebert/shallot/rendering';
import { octDecodeNormal } from '@dylanebert/shallot/utils';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { observeTrackWork, readGpuBuffer, readMesh } from '../src/gpu-probe';
import { staticInstanceSnapshot } from '../src/instance';
import { cacheAsset, Live, place } from '../src/live';
import { loadProfile, type Profile } from '../src/profile';
import { sweepIntervals, sweepProfile } from '../src/profile-sweep';
import { initializeView, Scene } from '../src/scene';
import { prepareTrackSpan, TrackDeformationPlugin } from '../src/track-deformation-gpu';
import { asset, nativePoint, posePoint, sectionAssets } from '../src/track-deformation-oracle';
import { revisions, spans, spanLength, tiePoses, tieStations, worldPoint, type Span } from './long-track-span';

const f32 = Math.fround;
const normError = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
// Half an f32 ULP at each of two independent operations: storing the
// origin and adding the decoded local position. The sweep instances are
// translation-only (asserted on the submitted transform rows below).
const halfUlp = (v: number) => v === 0 ? 0 : 2**(Math.floor(Math.log2(Math.abs(v)))-24);
const worldAllowance = (origin: number, result: number) => halfUlp(origin)+halfUlp(result);
const near = (actual: number, expected: number, tol: number, label: string) => {
  if (!(Math.abs(actual-expected)<=tol)) throw Error(`${label}: ${actual} vs ${expected} ± ${tol}`);
};
const tieName = 'ModernTie_Med';
const role = (i: number) => `span-${i}-ties`;
const tiesAt = (w: World, i: number) => w.resource(Live).roles.get(role(i))!.rows.map(r=>r.entities);
const target = {width:640,height:400};

type SpanState = ReturnType<typeof prepareTrackSpan>;
async function inspectSweep(w: World, span: Span, revision: number, profile: Profile, handle: SpanState['parts'][number]['mesh'], row: Float32Array, end: boolean) {
  expect(Array.from(row)).toEqual([...span.origin.map(f32),0,0,0,0,1,1,1,1,0]);
  const mesh = w.resource(Meshes).get(handle)!;
  const {points: _, ...raw} = await readMesh(w,mesh); // also checks indexed main/depth stream agreement
  const want = sweepProfile(profile,'curve',0,s=>span.at(revision,s),span.caps);
  const {indices,main,quant} = raw;
  expect(new Uint32Array(indices,mesh.indexBase*4,mesh.indexCount)).toEqual(Uint32Array.from(want.indices));
  const words = new Uint32Array(main), q = new DataView(quant), bounds = mesh.bounds!;
  expect(words.length).toBe(want.positions.length*4);
  expect(bounds[3]).toBeLessThan(8);
  const radius = Math.max(...profile.points.map(p=>Math.hypot(...p)))+.001;
  const stockGrid = [spanLength+2*radius,2*radius,spanLength+2*radius].map(x=>f32(x)/65535);
  const scale = stockGrid.map((stock,j)=>{
    const v = q.getFloat32(16+j*4,true);
    expect(v/65535).toBeLessThanOrEqual(stock);
    return v;
  });
  let localError=0, worldError=0, normalError=0;
  const seam: {p: number[]; n: number[]}[] = [];
  const stride = 2*(sweepIntervals+1), edges = profile.contours.flat().length;
  const center = bounds.slice(0,3).map((v,a)=>f32(f32(v)+row[a]));
  for (let i=0; i<want.positions.length; i++) {
    const a=words[i*4], b=words[i*4+1];
    if (b>>>16) throw Error('unexpected quant row');
    const local = [a&65535,a>>>16,b&65535].map((word,j)=>{
      const lo=q.getFloat32(j*4,true), p=f32(lo+f32(f32(word/65535)*scale[j]));
      const ideal=want.positions[i][j];
      const eps=8*2**-23*Math.max(1,Math.abs(lo),scale[j]);
      if (ideal<lo-halfUlp(lo) || ideal>lo+scale[j]+halfUlp(lo)+halfUlp(scale[j])) throw Error('quantization clipped a vertex');
      near(p,ideal,scale[j]/65535+eps,'local position');
      localError=Math.max(localError,Math.abs(p-ideal));
      return p;
    });
    const p = local.map((v,j)=>f32(row[j]+v)), ideal = worldPoint(span,want.positions[i]);
    const decoded = octDecodeNormal(words[i*4+2]), n = [decoded.x,decoded.y,decoded.z];
    for(let j=0; j<3; j++) {
      near(p[j],ideal[j],Math.abs(local[j]-want.positions[i][j])+worldAllowance(span.origin[j],p[j])+1e-12,'world position');
      worldError=Math.max(worldError,Math.abs(p[j]-ideal[j]));
    }
    const err = normError(n,want.normals[i]);
    near(err,0,.00012,'authored transported normal');
    normalError=Math.max(normalError,err);
    near(normError(p,center),0,bounds[3],'submitted world culling sphere');
    if (i<edges*stride && Math.floor(i%stride/2)===(end?sweepIntervals:0)) seam.push({p,n});
  }
  expect(seam).toHaveLength(2*edges);
  return {raw,seam,localError,worldError,normalError};
}

const cross = ([x,y,z]:readonly number[],[a,b,c]:readonly number[]) => [y*c-z*b,z*a-x*c,x*b-y*a];
function tiePoint(row: Float32Array, p: readonly number[]) {
  const q=Array.from(row.subarray(4,7)), qw=row[7];
  const v=p.map((x,i)=>x*row[8+i]), u=cross(q,v), t=cross(q,u);
  return v.map((x,i)=>f32(row[i]+x+2*(qw*u[i]+t[i])));
}

function visible(rgba: Awaited<ReturnType<typeof captureTexture>>['rgba']) {
  const counts = [0,0,0];
  for(let i=0; i<rgba.length; i+=4) for(let c=0;c<3;c++)
    if(rgba[i+c]>rgba[i+(c+1)%3]+50 && rgba[i+c]>rgba[i+(c+2)%3]+50) counts[c]++;
  return counts;
}

test('far submitted spans: directed seam, native placement, visibility and span-local traffic', async () => {
  const profiles = await Promise.all(sectionAssets.map(n=>loadProfile(asset(n))));
  const native = await loadGltf(await staticInstanceSnapshot(asset(tieName)));
  const states: SpanState[] = [], entities: number[][] = [];
  const samples = [0,0];
  let tieMaterial: Parameters<typeof place>[5];
  function updateTies(world: World, i: number, revision: number) {
    place(world,role(i),tieName,tiePoses(spans[i],revision),String(revision),tieMaterial);
  }
  const plugin: Plugin = {name:'far-spans',dependencies:[TrackDeformationPlugin,OrbitPlugin,GridPlugin],async initialize(w) {
    initializeView(w);
    w.storage(Grid).opacity.set(w.resource(Scene).grid,0);
    const camera = w.resource(Scene).camera;
    w.storage(Orbit).pan.set(camera,0,1.5,spans[1].origin[2]);
    w.storage(Orbit).distance.set(camera,28);
    // Unlit part IDs distinguish both far meshes from native ties/background.
    const materials = w.resource(Materials);
    tieMaterial = materials.add(StandardMaterial({baseColor:[0,0,1,1],unlit:true}));
    await cacheAsset(w,tieName,asset(tieName));
    for(let i=0; i<2; i++) {
      const span = spans[i], s = prepareTrackSpan(w,profiles[0],profiles[1],0,{
        ...span, at(revision,s) {samples[i]++; return span.at(revision,s);},
      });
      states.push(s);
      const material = materials.add(StandardMaterial({baseColor:i===0?[1,0,0,1]:[0,1,0,1],unlit:true}));
      entities.push(s.parts.map(part=>{
        const e=w.create();
        w.add(e,Transform,{translation:span.origin});
        w.add(e,MeshInstance,{mesh:part.mesh});
        w.add(e,MeshMaterial,material);
        return e;
      }));
      updateTies(w,i,0);
    }
  }};
  const app = await openGpuApp({plugins:[plugin]});
  try {
    const w = app.world, camera = w.resource(Scene).camera, table = globalTransformTable(w);
    attachTexture(w,camera,target);
    const tieEntities = spans.map((_,i)=>tiesAt(w,i).map(e=>[...e]));
    const observer = observeTrackWork(w,states.map((state,i)=>({state,handles:state.parts.map(p=>p.mesh),
      meshEntities:entities[i],ties:tieEntities[i].flat()})));
    let previous: {sweeps: Awaited<ReturnType<typeof inspectSweep>>[][]; ties: number[][][]} | undefined;
    let nativePoints: number[][][] | undefined;
    try {
      for(const [tick,revision] of [0,revisions[1],revisions[1],revisions[2],revisions[2]].entries()) {
        const dirty = !previous || states[0].revision!==revision;
        if(dirty && previous) {
          states[0].revision=revision;
          updateTies(w,0,revision);
        }
        for(const work of observer.work) Object.assign(work,{dispatches:0,frameBytes:0,meshBytes:0,tieMeshBytes:0,tieBytes:0});
        samples.fill(0);
        w.step(1/60); await w.frameFence;
        for(let i=0;i<2;i++) {
          const work=observer.work[i], spanDirty=tick===0 || (i===0 && dirty);
          expect(samples[i]).toBe(spanDirty?sweepIntervals+1:0);
          expect(work.dispatches).toBe(spanDirty?2:0);
          expect(work.frameBytes).toBe(spanDirty?(sweepIntervals+1)*64:0);
          expect(work.meshBytes).toBe(tick===0?entities[i].length*48:0);
          expect(work.tieMeshBytes).toBe(0);
          if(spanDirty) expect(work.tieBytes).toBe(tieEntities[i].flat().length*48);
          else expect(work.tieBytes).toBe(0);
        }
        const rows = new Float32Array(await readGpuBuffer(w,table.buffer));
        const rowAt = (e: number) => {
          const index=table.rowIndex(e);
          if(index<0) throw Error(`unsubmitted entity ${e}`);
          return rows.subarray(index*12,index*12+12);
        };
        const handleAt = (e: number) => w.storage(MeshInstance).mesh.get(e) as MeshHandle;
        const meshAt = (e: number) => w.resource(Meshes).get(handleAt(e))!;
        nativePoints ??= await Promise.all(tieEntities[0][0].map(e=>readMesh(w,meshAt(e)).then(m=>m.points)));
        const sweeps=[], ties=[];
        let tieError=0;
        for(let i=0;i<2;i++) {
          const span=spans[i], rev=i===0?revision:0;
          const result=await Promise.all(states[i].parts.map((p,j)=>{
            const e=entities[i][j];
            expect(handleAt(e)).toBe(p.mesh);
            return inspectSweep(w,span,rev,profiles[j],p.mesh,rowAt(e),i===0);
          }));
          sweeps.push(result);
          expect(tiesAt(w,i)).toEqual(tieEntities[i]);
          const matrices: number[][] = [];
          const stations=tieStations(span);
          expect(tieEntities[i]).toHaveLength(stations.length);
          for(let t=0;t<stations.length;t++) {
            const f = span.at(rev,stations[t]-span.start), pose={...f,p:worldPoint(span,f.p)};
            expect(tieEntities[i][t]).toHaveLength(native.instances.length);
            for(let j=0;j<native.instances.length;j++) {
              const e=tieEntities[i][t][j], row=rowAt(e), instance=native.instances[j], source=native.meshes[instance.mesh];
              const mesh=meshAt(e), points=nativePoints[j];
              expect(mesh).toBe(meshAt(tieEntities[0][0][j]));
              matrices.push(Array.from(row));
              const want = (p: readonly number[])=>posePoint(pose,nativePoint(instance.matrix,p[0],p[1],p[2]));
              const origin=want([0,0,0]);
              for(const p of [[0,0,0],[1,0,0],[0,1,0],[0,0,1]]) {
                const ideal=want(p), got=tiePoint(row,p);
                for(let a=0;a<3;a++) near(got[a],ideal[a],worldAllowance(origin[a],got[a])+4e-6,'native rigid placement');
              }
              expect(points).toHaveLength(source.indices.length);
              let farthest=0, depth=0;
              for(let k=0;k<source.indices.length;k++) {
                const v=source.indices[k]*8, p=source.vertices.subarray(v,v+3);
                const z=Math.abs(nativePoint(instance.matrix,p[0],p[1],p[2])[2]);
                if(z>depth){depth=z;farthest=k;}
              }
              expect(depth).toBeGreaterThan(.001);
              const v=source.indices[farthest]*8;
              const ideal=want(Array.from(source.vertices.subarray(v,v+3))), got=tiePoint(row,points[farthest]);
              for(let a=0;a<3;a++) {
                near(got[a],ideal[a],worldAllowance(origin[a],got[a])+4e-6+2*mesh.bounds![3]/65535,'native submitted corner');
                tieError=Math.max(tieError,Math.abs(got[a]-ideal[a]));
              }
            }
          }
          ties.push(matrices);
          if(previous) {
            for(let j=0;j<2;j++) {
              const old=previous.sweeps[i][j].raw, raw=result[j].raw;
              expect(raw.indices).toEqual(old.indices);
              expect(raw.quant).toEqual(old.quant);
              expect(result[j].seam).toEqual(previous.sweeps[i][j].seam);
              if(i===0 && dirty) expect(raw.main).not.toEqual(old.main);
              else {
                expect(raw.main).toEqual(old.main);
                expect(raw.position).toEqual(old.position);
              }
            }
            if(i===0 && dirty) expect(matrices).not.toEqual(previous.ties[i]);
            else expect(matrices).toEqual(previous.ties[i]);
          }
        }
        let seamError=0;
        for(let j=0;j<2;j++) {
          const a=sweeps[0][j], b=sweeps[1][j];
          for(let k=0;k<a.seam.length;k++) {
            expect(normError(a.seam[k].n,b.seam[k].n)).toBeLessThan(.00012);
            expect(a.seam[k].p).toEqual(b.seam[k].p);
            seamError=Math.max(seamError,normError(a.seam[k].p,b.seam[k].p));
          }
        }
        const pixels = visible((await captureTexture(w,camera)).rgba);
        for(const count of pixels) expect(count).toBeGreaterThan(100);
        const precision = sweeps.flat();
        console.log({tick,revision,work:observer.work,pixels,localMm:1000*Math.max(...precision.map(s=>s.localError)),
          worldMm:1000*Math.max(...precision.map(s=>s.worldError)),seamMm:1000*seamError,tieMm:1000*tieError,
          normal:Math.max(...precision.map(s=>s.normalError))});
        previous={sweeps,ties};
      }
    } finally {observer.restore();}
  } finally {app.dispose();}
},15_000);
