import { expect, test } from 'bun:test';
import { Camera, createApp, DiagnosticsStore, Materials, Meshes, MeshInstance, MeshMaterial, StandardMaterial, Transform, type World } from '@dylanebert/shallot';
import { Orbit, OrbitPlugin, ProfilePlugin } from '@dylanebert/shallot/extras';
import { Grid, GridPlugin } from '@dylanebert/shallot-grid';
import { attachTexture, captureTexture, globalTransformTable } from '@dylanebert/shallot/rendering';
import { classifyAdapter } from '@dylanebert/shallot/runtime';
import { create, globals } from 'webgpu';
import { defaultPaint, linearColor } from '../src/configuration';
import { observeTrackWork, readMesh } from '../src/gpu-probe';
import { cacheAsset, Live, place } from '../src/live';
import { profileTopology, sweepIntervals } from '../src/profile-sweep';
import { initializeView, Scene } from '../src/scene';
import { point } from '../src/track';
import { prepareTrackSpan, TrackDeformationPlugin } from '../src/track-deformation-gpu';
import { asset, nativePoint, posePoint } from '../src/track-deformation-oracle';
import { loadWitness } from './long-track-capacity';
import { length, middle, route, targetAt } from './long-track-route';
import { revisions, tiePoses, tieStations, worldPoint } from './long-track-span';
import { dt, measure, step, warmup } from './track-timing';

const tie = 'ModernTie_Med', role = (i:number)=>`route-ties-${i}`;
const target = {width:1280,height:800}, near = .1, far = 1000, distance = 19;
const samples = 120;
type Rgba = Awaited<ReturnType<typeof captureTexture>>['rgba'];
function changed(a:Rgba,b:Rgba) {
  let pixels=0;
  for(let i=0;i<a.length;i+=4) {
    if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8) pixels++;
  }
  return pixels;
}

// Live bytes of explicit createBuffer calls, until explicit destroy. No GC,
// textures, internal Dawn resources, or driver allocation is inferred.
function trackBuffers(device: GPUDevice) {
  const create = device.createBuffer, write = device.queue.writeBuffer;
  let live=0, peak=0, calls=0, uploadBytes=0;
  let largest={label:'',bytes:0}, largestTrack={label:'',bytes:0};
  device.createBuffer=function(d) {
    if(d.size>device.limits.maxBufferSize) throw Error(`${d.label}: ${d.size} bytes > maxBufferSize ${device.limits.maxBufferSize}`);
    const buffer=create.call(this,d), destroy=buffer.destroy;
    const bytes=Number(d.size);
    peak=Math.max(peak,live+=bytes); calls++;
    const label=d.label??'(unlabeled)';
    if(bytes>largest.bytes) largest={label,bytes};
    if(label.startsWith('track:')&&bytes>largestTrack.bytes) largestTrack={label,bytes};
    let destroyed=false;
    buffer.destroy=function() {
      if(!destroyed) {live-=bytes; destroyed=true;}
      destroy.call(this);
    };
    return buffer;
  };
  device.queue.writeBuffer=function(...args: Parameters<GPUQueue['writeBuffer']>) {
    const [, ,data,offset=0,size]=args;
    const width=ArrayBuffer.isView(data)&&'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    uploadBytes+=size===undefined?data.byteLength-offset*width:size*width;
    return write.apply(this,args);
  };
  return {
    snapshot:()=>({calls,live,peak,largest,largestTrack,queueWriteBufferBytes:uploadBytes}),
    stop(){device.createBuffer=create;device.queue.writeBuffer=write;},
  };
}

async function readTransformRow(w:World, e:number) {
  const table=globalTransformTable(w), index=table.rowIndex(e);
  expect(index).toBeGreaterThanOrEqual(0);
  const {device}=w.gpu;
  const staging=device.createBuffer({size:48,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
    const encoder=device.createCommandEncoder();
    encoder.copyBufferToBuffer(table.buffer,index*48,staging,0,48);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    return Array.from(new Float32Array(staging.getMappedRange()));
  } finally {staging.destroy();}
}

async function run(device:GPUDevice, adapter:GPUAdapter) {
  const probe=trackBuffers(device);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let phase='setup', firstError:string|undefined;
  const error = (e:GPUUncapturedErrorEvent)=>{firstError??=`${phase}: ${e.error.message}`;};
  device.addEventListener('uncapturederror',error);
  const healthy=()=>{if(firstError) throw Error(firstError);};
  async function checked<T>(label:string, action:()=>Promise<T>) {
    phase=label;
    device.pushErrorScope('validation');
    try {return await action();}
    finally {
      const failure=await device.popErrorScope();
      if(failure) throw Error(`${label}: ${failure.message}`);
      healthy();
    }
  }
  try {
    const setup=performance.now(), rssStart=process.memoryUsage.rss();
    const {profiles, instancesPerTie}=await loadWitness();
    const parts=[profiles.rails,profiles.spine];
    app=await createApp({adapter,device,plugins:[ProfilePlugin,{
      name:'one-kilometre-witness',dependencies:[TrackDeformationPlugin,OrbitPlugin,GridPlugin],
      async initialize(w) {
        initializeView(w);
        w.storage(Grid).opacity.set(w.resource(Scene).grid,0);
      },
    }]});
    const w=app.world, camera=w.resource(Scene).camera;
    w.storage(Camera).near.set(camera,near);
    w.storage(Camera).far.set(camera,far);
    attachTexture(w,camera,target);
    const orbit=w.storage(Orbit);
    function view(index:number) {
      orbit.distance.set(camera,distance);
      orbit.pan.set(camera,0,1.5,targetAt(index));
    }
    const capture=async ()=>(await captureTexture(w,camera)).rgba;
    view(0);
    await checked('empty frame',()=>step(w));
    const empty=await capture(), setupMs=performance.now()-setup;
    const beforeBuild=probe.snapshot();
    const materials=w.resource(Materials);
    let paint: ReturnType<typeof materials.add>[];
    function update(i:number, revision:number) {
      place(w,role(i),tie,tiePoses(route[i],revision),String(revision),paint[2]);
    }
    const states: ReturnType<typeof prepareTrackSpan>[] = [], strips:number[][]=[];
    let buildStart=0, prepared=0, submitted=0, completed=0;
    await checked('empty-to-resident build / first complete frame',async()=>{
      buildStart=performance.now();
      paint=(['rails','spine','ties'] as const).map(p=>materials.add(StandardMaterial({
        baseColor:linearColor(defaultPaint[p]),metallic:.4,perceptualRoughness:.35,
      })));
      await cacheAsset(w,tie,asset(tie));
      for(const [i,span] of route.entries()) {
        phase=`build span ${i}`;
        const state=prepareTrackSpan(w,profiles.rails,profiles.spine,0,span);
        states.push(state);
        strips.push(state.parts.map((part,j)=>{
          const e=w.create();
          w.add(e,Transform,{translation:span.origin});
          w.add(e,MeshInstance,{mesh:part.mesh});
          w.add(e,MeshMaterial,paint[j]);
          return e;
        }));
        update(i,0);
      }
      prepared=performance.now();
      phase='first complete frame';
      w.step(dt);
      submitted=performance.now();
      if(!w.frameFence) throw Error('No first complete frame fence');
      await w.frameFence;
      completed=performance.now();
    });
    const buildBuffers=probe.snapshot(), rssAfterBuild=process.memoryUsage.rss();
    probe.stop();
    const diagnostic=w.resource(DiagnosticsStore);
    expect(diagnostic.get('render/timestamp_query')?.value()).toBe(1);
    expect(diagnostic.get('render/standard:color/indirect')!.value()).toBeGreaterThan(0);
    const firstPixels=changed(empty,await capture());
    expect(firstPixels).toBeGreaterThan(100);
    const meshes=w.resource(Meshes), live=w.resource(Live), instances=w.storage(MeshInstance);
    const native=live.assets.get(tie)!;
    const ties=route.map((span,i)=>{
      const rows=live.roles.get(role(i))!.rows;
      expect(rows.length).toBe(tieStations(span).length);
      for(const row of rows) {
        expect(row.entities.length).toBe(instancesPerTie);
        expect(row.entities.map(e=>instances.mesh.get(e))).toEqual(native.primitives.map(p=>native.handles[p.mesh]));
      }
      return rows.flatMap(row=>row.entities);
    });
    expect(new Set(ties.flat()).size).toBe(ties.flat().length);
    let indices=0, vertices=0;
    const stripHandles=states.map((s,i)=>s.parts.map((p,j)=>{
      expect(s.submitted).toBe(0);
      expect(instances.mesh.get(strips[i][j])).toBe(p.mesh);
      const profile=parts[j], edges=profile.contours.flat().length;
      expect(p.count).toBe(edges*(2*(sweepIntervals+1)+Number(route[i].caps[0])+Number(route[i].caps[1])));
      const count=meshes.get(p.mesh)!.indexCount;
      expect(count).toBe(profileTopology(profile,0,()=>{},route[i].caps).indices.length);
      indices+=count; vertices+=p.count;
      return p.mesh;
    }));
    console.log('first verified draw', {setupWithEmptyFrameMs:setupMs, prepareWithUploadCallsMs:prepared-buildStart,
      stepSubmissionMs:submitted-prepared, afterSubmitThroughFenceMs:completed-submitted, emptyToFenceMs:completed-buildStart,
      queueWriteBufferRouteDeltaBytes:buildBuffers.queueWriteBufferBytes-beforeBuild.queueWriteBufferBytes,
      beforeBuild, buildBuffers, rssStart, rssAfterBuild, firstPixels, vertices, indices, tieInstances:ties.flat().length});

    const last=route.length-1;
    // Fixed continuous sweep of the same orbit target, front to end inclusive.
    const travel=(i:number)=>view(last*i/(samples-1));
    const edit=(revision:number)=>{states[middle].revision=revision;update(middle,revision);};
    const warm=async (move:(i:number)=>void)=>{
      for(let i=0;i<warmup;i++) {move(i);await step(w);}
    };
    await warm(i=>view(last*i/(warmup-1)));
    const held=await checked('held camera motion',()=>measure(w,samples,undefined,i=>{
      phase=`held frame ${i}`;
      travel(i);
    }));
    expect(states.every(s=>s.submitted===0)).toBe(true);

    const workTargets=states.map((state,i)=>({state,handles:stripHandles[i],meshEntities:strips[i],ties:ties[i]}));
    const zeroWork={dispatches:0,frameBytes:0,meshBytes:0,tieMeshBytes:0,tieBytes:0};
    const assertNoTrackWork=(work: typeof zeroWork[], frame: number)=>{
      expect(work).toHaveLength(route.length);
      for(const [i,entry] of work.entries()) {
        if(Object.entries(entry).some(([,bytes])=>bytes!==0)) throw Error(`camera frame ${frame}, span ${i}: ${JSON.stringify(entry)}`);
      }
    };
    const traversal=observeTrackWork(w,workTargets);
    try {
      await checked('untimed held traversal',async()=>{
        for(let i=0;i<samples;i++) {
          phase=`untimed held frame ${i}`;
          travel(i);
          await step(w);
          assertNoTrackWork(traversal.work,i); // Cumulative across all targets.
        }
      });
    } finally {traversal.restore();}
    console.log('untimed held traversal: zero tracked work at every camera target and span', {
      cameraTargets:samples, observedSpans:traversal.work.length,
    });

    // Negative control: re-upload a resident basis, without changing geometry.
    // Use a non-spot camera target and the same observer and assertion.
    const injectedFrame=37, injectedSpan=17;
    const injection=observeTrackWork(w,workTargets);
    try {
      await checked(`untimed redundant-write control at camera frame ${injectedFrame}`,async()=>{
        travel(injectedFrame);
        const {frames,basis}=states[injectedSpan];
        w.gpu.device.queue.writeBuffer(frames,0,basis);
        await step(w);
        expect(injection.work[injectedSpan]).toEqual({...zeroWork,frameBytes:basis.byteLength});
        expect(()=>assertNoTrackWork(injection.work,injectedFrame)).toThrow(`camera frame ${injectedFrame}, span ${injectedSpan}:`);
        console.log('redundant-write control rejected', {cameraFrame:injectedFrame,span:injectedSpan,frameBytes:basis.byteLength});
      });
    } finally {injection.restore();}
    view(middle);
    // Strictly changing roll about the chord; every station at either end
    // retains its frame, while both the sweep and the native ties move inside.
    const revision=(i:number)=>Math.PI/8*(2*i/(samples+warmup-1)-1);
    await warm(i=>edit(revision(i)));
    const moving=await checked('fixed camera edits',()=>measure(w,samples,{
      edit(i){phase=`edit frame ${i}`;edit(revision(i+warmup));},
      verifySubmission(i){expect(states[middle].submitted).toBe(revision(i+warmup));healthy();},
    }));
    expect(states.every((s,i)=>i===middle||s.submitted===0)).toBe(true);
    console.log('warm windows (ms, nearest-rank)',Bun.inspect({target,warmup,dt,held,moving}, {depth:Infinity}));

    async function submittedPlacement(i:number,rev:number) {
      const span=route[i], stations=tieStations(span), t=Math.floor(stations.length/2);
      const rail=meshes.get(stripHandles[i][0])!;
      const pose=await readTransformRow(w,strips[i][0]);
      expect(pose).toEqual([...span.origin.map(Math.fround),0,0,0,0,1,1,1,1,0]);
      const row=await readTransformRow(w,ties[i][t*instancesPerTie]);
      const f=span.at(rev,stations[t]-span.start);
      const want=posePoint({...f,p:worldPoint(span,f.p)},nativePoint(native.primitives[0].matrix,0,0,0));
      for(let i=0;i<3;i++) expect(Math.abs(row[i]-want[i])).toBeLessThan(.00008);
      const stream=await readMesh(w,rail);
      const xy=profiles.rails.points[profiles.rails.contours[0][0].from];
      const vertex=2*(sweepIntervals/2);
      const k=new Uint32Array(stream.indices).indexOf(vertex);
      expect(k).toBeGreaterThanOrEqual(0);
      const actual=stream.points[k], expected=point(span.at(rev,length/2),...xy);
      for(let i=0;i<3;i++) expect(Math.abs(actual[i]-expected[i])).toBeLessThan(.00021);
      return {row,vertex:actual};
    }
    const spot=async (label:string, change:()=>void, dirty:boolean)=>{
      const observer=observeTrackWork(w,workTargets);
      try {
        change(); await checked(label,()=>step(w));
        for(const [i,work] of observer.work.entries()) expect(work,`span ${i}`).toEqual({
          dispatches:dirty&&i===middle?2:0,frameBytes:dirty&&i===middle?(sweepIntervals+1)*64:0,
          meshBytes:0,tieMeshBytes:0,tieBytes:dirty&&i===middle?ties[i].length*48:0,
        });
        return observer.work[middle];
      } finally {observer.restore();}
    };
    const holdWork=await spot('moving-camera hold spot',()=>view(1),false);
    const rev=states[middle].revision;
    await spot('fixed-camera hold spot',()=>view(middle),false);
    const before=await submittedPlacement(middle,rev), heldImage=await capture();
    const editWork=await spot('interior edit spot',()=>edit(revisions[2]),true);
    const after=await submittedPlacement(middle,revisions[2]);
    expect(after.row).not.toEqual(before.row);
    expect(after.vertex).not.toEqual(before.vertex);
    const editPixels=changed(heldImage,await capture());
    expect(editPixels).toBeGreaterThan(100);

    // Remove one local group at a time, keeping the rest of the route and
    // camera unchanged. This tests actual contribution, not command count.
    const coverage=[];
    for(const i of [0,middle,last]) {
      view(i); await checked(`visibility ${i}`,()=>step(w));
      if(i!==middle) await submittedPlacement(i,0);
      const full=await capture(), counts=[];
      for(const group of [[strips[i][0]],[strips[i][1]],ties[i]]) {
        const handles=group.map(e=>instances.mesh.get(e));
        for(const e of group) w.remove(e,MeshInstance);
        await checked(`visibility omission ${i}/${counts.length}`,()=>step(w));
        const pixels=changed(full,await capture());
        expect(pixels).toBeGreaterThan(100);
        counts.push(pixels);
        group.forEach((e,j)=>w.add(e,MeshInstance,{mesh:handles[j]}));
      }
      coverage.push({span:i,panZ:targetAt(i),railsSpineTiesRgbDeltaPixels:counts});
    }
    console.log('untimed work and visibility (RGB delta > 8)', Bun.inspect({holdWork,editWork,before,after,editPixels,
      coverage,camera:{distance,near,far,yaw:orbit.yaw.get(camera),pitch:orbit.pitch.get(camera),
        verticalFov:w.storage(Camera).fov.get(camera)}}, {depth:Infinity}));
  } finally {
    probe.stop();
    device.removeEventListener('uncapturederror',error);
    app?.dispose();
  }
}

test('native Vulkan: submit and time the 1 km retained route', async () => {
  if(process.env.TRACK_METRES!=='1000') throw Error('Run explicitly with TRACK_METRES=1000 on a native Vulkan device');
  const previous=Object.getOwnPropertyDescriptors(globalThis), gpu=Object.getOwnPropertyDescriptor(navigator,'gpu');
  let device:GPUDevice|undefined;
  try {
    Object.assign(globalThis,globals);
    const dawn=create(['backend=vulkan','disable-dawn-features=timestamp_quantization']);
    Object.defineProperty(navigator,'gpu',{configurable:true,value:dawn});
    const adapter=await dawn.requestAdapter({powerPreference:'high-performance'});
    const verdict=classifyAdapter({present:!!adapter,info:adapter?.info});
    if(!adapter||verdict.class!=='real'||adapter.info.isFallbackAdapter||adapter.info.device==='null-backend')
      throw Error(`Native Vulkan adapter required: ${verdict.reason??verdict.identity}`);
    device=await adapter.requestDevice({requiredFeatures:['timestamp-query','indirect-first-instance']});
    console.log({adapter:verdict.identity,description:adapter.info.description,limits:{maxBufferSize:device.limits.maxBufferSize,
      maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,maxComputeWorkgroupsPerDimension:device.limits.maxComputeWorkgroupsPerDimension,
      maxStorageBuffersPerShaderStage:device.limits.maxStorageBuffersPerShaderStage}});
    await run(device,adapter);
  } finally {
    try {if(device){device.destroy();await device.lost;}}
    finally {
      if(gpu) Object.defineProperty(navigator,'gpu',gpu); else Reflect.deleteProperty(navigator,'gpu');
      for(const name of Object.keys(globals)) {
        if(previous[name]) Object.defineProperty(globalThis,name,previous[name]); else Reflect.deleteProperty(globalThis,name);
      }
    }
  }
}, 43_000);
