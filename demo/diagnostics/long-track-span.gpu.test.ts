import { expect, test } from 'bun:test';
import { Materials, Meshes, MeshInstance, MeshMaterial, StandardMaterial, Transform, type Plugin, type World } from '@dylanebert/shallot';
import { Orbit, OrbitPlugin } from '@dylanebert/shallot/extras';
import { GridPlugin, Grid } from '@dylanebert/shallot-grid';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { attachTexture, captureTexture, globalTransformTable } from '@dylanebert/shallot/rendering';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { observeTrackWork, readGpuBuffer, readMesh } from '../src/gpu-probe';
import { staticInstanceSnapshot } from '../src/instance';
import { cacheAsset, Live, place } from '../src/live';
import { loadProfile } from '../src/profile';
import { sweepIntervals } from '../src/profile-sweep';
import { initializeView, Scene } from '../src/scene';
import { prepareTrackSpan, TrackDeformationPlugin } from '../src/track-deformation-gpu';
import { asset, sectionAssets } from '../src/track-deformation-oracle';
import { revisions, spans, tiePoses, tieStations, worldPoint } from './long-track-span';

import { inspectNativeTie, inspectSweep, normError } from './long-track-precision';

const tieName = 'ModernTie_Med';
const role = (i: number) => `span-${i}-ties`;
const tiesAt = (w: World, i: number) => w.resource(Live).roles.get(role(i))!.rows.map(r=>r.entities);
const target = {width:640,height:400};

type SpanState = ReturnType<typeof prepareTrackSpan>;
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
              tieError=Math.max(tieError,inspectNativeTie(row,points,source,instance.matrix,pose,mesh.bounds![3]));
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
