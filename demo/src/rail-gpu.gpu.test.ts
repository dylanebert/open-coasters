import { beforeAll, afterAll, expect, test } from 'bun:test';
import { MeshInstance, MeshMaterial, StandardMaterial, Camera, DirectionalLight, Materials, Meshes, StandardRenderer, Transform, lookAtRotation, type Plugin } from '@dylanebert/shallot';
import { DepthPrepass, Views, attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { openGpuApp } from '@dylanebert/shallot/testing/gpu';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { decodePos } from '@dylanebert/shallot/mesh';
import { octDecodeNormal } from '@dylanebert/shallot/utils';
import { MeshPreprocessSystem } from '@dylanebert/shallot/standard/rendering';
import { sampleFrames, path, offsetFrames, type Frame } from '../../construction/geometry';
import { sampledSection } from '../../construction/section';
import { forceColor } from './loop-force';
import { sweep } from '../../construction/sweep';
import { nativeSnapshot } from '../../construction/native';
import { railGpu, RailGpu, RailEmitSystem } from './rail-gpu';

const evidence=process.env.RAIL_GPU_EVIDENCE;
async function save(name:string, data:string | Uint8Array | Uint8ClampedArray | Uint32Array) {
    if(evidence) await Bun.write(`${evidence.replace(/\/$/,'')}/${name}`,data);
}
let lowImage:Uint8ClampedArray;
let app: Awaited<ReturnType<typeof openGpuApp>>, camera=0, railEntity=0;
let frames:readonly Frame[], section:ReturnType<typeof sampledSection>;
let disposalApp:Awaited<ReturnType<typeof openGpuApp>>;
const warnings:string[]=[];
const warn=console.warn;
// Y-axis arc, constant local Z bank: independent analytic basis below.
const bank=.37, angle=.8, radius=8;
const positions:number[][]=[], rotations:number[][]=[];
for(let i=0;i<97;i++) {
    const t=angle*i/96, sy=-Math.sin(t/2), cy=Math.cos(t/2), sz=Math.sin(bank/2), cz=Math.cos(bank/2);
    positions.push([radius*(1-Math.cos(t)),0,-radius*Math.sin(t)]);
    rotations.push([sy*sz,sy*cz,cy*sz,cy*cz]);
}
const sampled=path({distances:Array.from({length:97},(_,i)=>radius*angle*i/96),positions,rotations});
const colors=positions.map((_,i)=>forceColor(2+3*i/96));
let material: {snapshot:ReturnType<typeof nativeSnapshot>;material:number};
const cpuReferences=new Map<number,number[]>();

beforeAll(async()=>{
    console.warn=(...args)=>{warnings.push(args.map(String).join(' '));warn(...args);};
    const json=await Bun.file(new URL('../public/assets/assembly-section.gltf',import.meta.url)).json();
    const bytes=await Bun.file(new URL('../public/assets/assembly-section.bin',import.meta.url)).arrayBuffer();
    // Affine edit of the fixture only: unequal radii, asymmetric origin, same directed cycle.
    const xyz=new Float32Array(bytes,0,48);
    for(let j=0;j<16;j++){xyz[j*3]=xyz[j*3]*1.7+.013;xyz[j*3+1]=xyz[j*3+1]*.8-.021;}
    section=sampledSection(json,[bytes]); frames=sampleFrames(sampled,sampled.distances);
    const doc=await Bun.file(new URL('../../construction/witness/resolved-ties.gltf',import.meta.url)).json();
    const raw=new Float32Array([.1,.2,.4,.4,.2,.4,.1,.5,.4]);
    doc.buffers=[{byteLength:raw.byteLength}]; doc.materials=[{pbrMetallicRoughness:{baseColorFactor:[.8,.4,.1,1]}}];
    material={snapshot:nativeSnapshot(doc,[new Uint8Array(raw.buffer)]),material:0};
    for(const separation of [.6,1.1,1.6,.85])cpuReferences.set(separation,cpu(separation));
    expect(section.length).toBe(16);
    const scene:Plugin={name:'rail-proof-view',dependencies:[railGpu(frames,section,colors)],initialize(w){
        w.resource(RailGpu).colored=true;
        railEntity=w.create();w.add(railEntity,Transform);w.add(railEntity,MeshInstance,{mesh:w.resource(RailGpu).handle});
        w.add(railEntity,MeshMaterial,w.resource(Materials).add(StandardMaterial({baseColor:[.8,.4,.1,1]})));
        camera=w.create(); w.add(camera,Camera,{clearColor:0x121212}); w.add(camera,StandardRenderer); w.add(camera,DepthPrepass);
        w.add(camera,Transform,{translation:[10,8,12],rotation:lookAtRotation(10,8,12,1,0,3)});
        const sun=w.create(); w.add(sun,Transform,{rotation:lookAtRotation(0,0,0,1,-1,-1)});
        w.add(sun,DirectionalLight,{illuminance:6000,shadowMapsEnabled:1});
    }};
    app=await openGpuApp({plugins:[scene]});
    disposalApp=await openGpuApp({plugins:[railGpu(frames,section)]});
    attachTexture(app.world,camera,{width:128,height:96});
    app.world.step(0); lowImage=(await captureTexture(app.world,camera)).rgba.slice(); await app.world.frameFence;
    expect(app.world.resource(Views).get(camera)?.depth).toBeTruthy();
    await save('image-low-control.rgba',lowImage);
    await save('device.json',JSON.stringify({runtime:Bun.version,adapter:app.world.gpu.adapter,limits:Object.fromEntries(Object.getOwnPropertyNames(Object.getPrototypeOf(app.world.gpu.device.limits)).filter(k=>k!=='constructor').map(k=>[k,(app.world.gpu.device.limits as any)[k]]))},null,2));
},TIMEOUT.startup);
afterAll(async()=>{
    try {
        if(!app) return;
        await app.world.gpu.device.queue.onSubmittedWorkDone();
        const s=app.world.resource(RailGpu);
        const owned=[...s.buffers,app.world.gpu.root.unwrap(s.mesh.quant!)];
        const destroyed=new Map<GPUBuffer,number>();
        for(const buffer of owned) {const destroy=buffer.destroy.bind(buffer);buffer.destroy=()=>{destroyed.set(buffer,(destroyed.get(buffer)??0)+1);destroy();};}
        app.dispose();
        expect(owned.map(b=>destroyed.get(b))).toEqual(owned.map(()=>1));
    } finally {disposalApp?.dispose();console.warn=warn;}
});

function cpu(separation:number) {
    const out:number[]=[];
    for(const sign of [-1,1]) {
        const shifted=offsetFrames(frames,{translation:[sign*separation/2,0,0],rotation:[0,0,0,1]});
        const result=sweep(section,shifted,material);
        const snap=result.placements[0].content.snapshot;
        const bytes=Buffer.from(snap.buffers[0],'base64');
        // Native sweep has wall POSITION/NORMAL then cap POSITION/NORMAL.
        for(const id of [0,2]) {
            const a=snap.document.accessors[id], v=snap.document.bufferViews[a.bufferView];
            out.push(...new Float32Array(bytes.buffer,bytes.byteOffset+v.byteOffset,a.count*3));
        }
    }
    return out;
}
function normal(a:number[],b:number[],c:number[]) {
    const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);
    return n.map(x=>x/l);
}
async function read(buffer:GPUBuffer) {
    const {device}=app.world.gpu;
    const staging=device.createBuffer({size:buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
        const encoder=device.createCommandEncoder(); encoder.copyBufferToBuffer(buffer,0,staging,0,buffer.size); device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ); return new Uint32Array(staging.getMappedRange().slice(0));
    } finally {staging.destroy();}
}
test('retained banked rails: low/interior/high, shared f32 sweep, analytic oracle, streams and shadows',async()=>{
    const w=app.world,s=w.resource(RailGpu), mesh=s.mesh, buffers=[...s.buffers], registry=[...w.resource(Meshes)];
    expect(s.dispatches).toBe(1);
    expect(buffers.length).toBe(8); // plus the independently retained MeshQuant allocation
    expect(mesh.indexBase).toBe(0);
    const quant=(await mesh.quant!.read())[0];
    const quantError=Math.max(quant.posScale.x,quant.posScale.y,quant.posScale.z)/65535;
    const materialRow=w.storage(MeshMaterial).material.get(railEntity), entity=railEntity;
    const summary:any[]=[];
    let previous:Uint32Array|undefined, previousImage:Uint8ClampedArray|undefined;
    for(const separation of [.6,1.1,1.6]) {
        s.separation=separation;
        let allocations=0;
        const create=w.gpu.device.createBuffer.bind(w.gpu.device);
        w.gpu.device.createBuffer=(...args)=>{allocations++;return create(...args);};
        try {w.step(0);} finally {w.gpu.device.createBuffer=create;}
        expect(allocations).toBe(0);
        const image=await captureTexture(w,camera); await w.frameFence;
        expect(w.resource(Views).get(camera)?.depth).toBeTruthy();
        const changedFromLow=image.rgba.reduce((n,v,i)=>n+Number(v!==lowImage[i]),0);
        const changedFromPrevious=previousImage ? image.rgba.reduce((n,v,i)=>n+Number(v!==previousImage![i]),0) : 0;
        if(separation===.6) expect(changedFromLow).toBe(0);
        else {expect(changedFromLow).toBeGreaterThan(0); expect(changedFromPrevious).toBeGreaterThan(0);}
        await save(`image-${separation}.rgba`,image.rgba);
        previousImage=image.rgba.slice();
        const actual=await read(buffers[0]), position=await read(buffers[1]), indices=await read(buffers[2]);
        await save(`main-${separation}.bin`,actual);
        await save(`position-${separation}.bin`,position);
        await save(`indices-${separation}.bin`,indices);
        expect(actual.length/4).toBe(mesh.indexCount*3/2);
        expect(mesh.indexCount).toBe(2*((96*16*2)+(14*2))*3);
        const reference=cpuReferences.get(separation)!, decoded:number[][]=[];
        let maxPosition=0,maxNormal=0,maxQuantNormal=0,topologyErrors=0,streamErrors=0,boundsErrors=0,analyticError=0,quantizationError=0;
        for(let i=0;i<indices.length;i++) {
            if(indices[i]!==i || (actual[i*4+1]>>>16)!==0) topologyErrors++;
            if(position[i*2]!==actual[i*4] || position[i*2+1]!==actual[i*4+1]) streamErrors++;
            const p=decodePos(actual[i*4],actual[i*4+1],quant), a=[p.x,p.y,p.z]; decoded.push(a);
            for(let axis=0;axis<3;axis++) {
                maxPosition=Math.max(maxPosition,Math.abs(a[axis]-reference[i*3+axis]));
                quantizationError=Math.max(quantizationError,Math.abs(a[axis]-reference[i*3+axis]));
            }
            const center=mesh.bounds!; if(Math.hypot(...a.map((v,j)=>v-center[j]))>center[3]+quantError*2) boundsErrors++;
        }
        for(let i=0;i<indices.length;i+=3) {
            // Independent shared sweep f32 coordinates, not the producer's own
            // diagnostic output. A coordinate perturbation <=3e-6 per axis gives
            // edge perturbation e=2*sqrt(3)*3e-6 and cross perturbation
            // e*(|u|+|v|)+e^2. Normalization costs at most twice that / |u x v|.
            const a=reference.slice(i*3,i*3+3),b=reference.slice((i+1)*3,(i+1)*3+3),c=reference.slice((i+2)*3,(i+2)*3+3);
            const u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);
            const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
            const e=2*Math.sqrt(3)*3e-6;
            const normalBound=2*(e*(Math.hypot(...u)+Math.hypot(...v))+e*e)/area+.0001;
            const n=normal(a,b,c), q=normal(decoded[i],decoded[i+1],decoded[i+2]);
            if(actual[i*4+2]!==actual[(i+1)*4+2] || actual[i*4+2]!==actual[(i+2)*4+2]) topologyErrors++;
            const packed=octDecodeNormal(actual[i*4+2]);
            const emitted=[packed.x,packed.y,packed.z];
            const error=Math.hypot(...n.map((v,k)=>v-emitted[k]));
            expect(error).toBeLessThan(normalBound);
            maxNormal=Math.max(maxNormal,error);
            maxQuantNormal=Math.max(maxQuantNormal,Math.hypot(...q.map((v,k)=>v-emitted[k])));
        }
        // Corners in independently authored arc coordinates; the CCW section
        // faces back at the start and forward at the end. Walls keep the a–c diagonal.
        let index=0, colorError=0, worstSignedDot=1;
        for(const side of [-1,1]) {
            const point=(s:number,j:number)=>{
                const t=angle*s/96, phi=j*Math.PI/8;
                const x=.102*Math.cos(phi)+.013+side*separation/2, y=.048*Math.sin(phi)-.021;
                const bx=Math.cos(bank)*x-Math.sin(bank)*y, by=Math.sin(bank)*x+Math.cos(bank)*y;
                return [radius*(1-Math.cos(t))+Math.cos(t)*bx,by,-radius*Math.sin(t)+Math.sin(t)*bx];
            };
            const face=(refs:readonly (readonly [number,number])[],outward?:number[])=>{
                const corners=refs.map(([s,j])=>point(s,j));
                const emitted=octDecodeNormal(actual[index*4+2]);
                const n=outward??normal(corners[0],corners[1],corners[2]);
                worstSignedDot=Math.min(worstSignedDot,n[0]*emitted.x+n[1]*emitted.y+n[2]*emitted.z);
                refs.forEach(([s],k)=>{
                    analyticError=Math.max(analyticError,...corners[k].map((v,a)=>Math.abs(v-decoded[index][a])));
                    const at=mesh.indexCount*4+index*2, rg=actual[at],ba=actual[at+1];
                    [rg&65535,rg>>>16,ba&65535,ba>>>16].forEach((v,c)=>{
                        colorError=Math.max(colorError,Math.abs(v/65535-colors[s][c]));
                    });
                    index++;
                });
            };
            for(let s=0;s<96;s++) for(let j=0;j<16;j++) {
                const k=(j+1)%16;
                face([[s,j],[s+1,k],[s,k]]);face([[s,j],[s+1,j],[s+1,k]]);
            }
            for(let j=1;j<15;j++) {
                face([[0,0],[0,j],[0,j+1]],[0,0,1]);
                face([[96,0],[96,j+1],[96,j]],[Math.sin(angle),0,-Math.cos(angle)]);
            }
        }
        expect(index).toBe(mesh.indexCount);
        expect(worstSignedDot).toBeGreaterThan(.99999);
        expect(colorError).toBeLessThan(1/65535);
        expect(topologyErrors+streamErrors+boundsErrors).toBe(0);
        expect(analyticError).toBeLessThan(quantError+3e-6);
        expect(maxPosition).toBeLessThan(quantError+3e-6);
        expect(quantizationError).toBeLessThan(quantError+3e-6);

        if(previous) {
            expect(actual).not.toEqual(previous);
            const stale=decodePos(previous[0],previous[1],quant);
            expect(Math.hypot(stale.x-reference[0],stale.y-reference[1],stale.z-reference[2])).toBeGreaterThan(.1);
        }
        // Wrong-separation/stale oracle must exceed the position acceptance limit.
        const wrong=cpuReferences.get(separation===.6?1.6:.6)!;
        expect(Math.max(...decoded[0].map((v,k)=>Math.abs(v-wrong[k])))).toBeGreaterThan(.1);
        expect(image.rgba.some((v,i)=>i%4!==3 && v!==image.rgba[i%4])).toBe(true);
        expect(s.buffers.every((b,i)=>b===buffers[i])).toBe(true); expect(s.mesh).toBe(mesh);
        expect(railEntity).toBe(entity); expect(w.storage(MeshMaterial).material.get(entity)).toBe(materialRow);
        expect([...w.resource(Meshes)]).toEqual(registry);
        summary.push({separation,depthPrepass:true,changedFromLow,changedFromPrevious,maxPosition,maxNormal,maxQuantNormal,quantError,quantizationError,ownedBuffers:buffers.length+1}); previous=actual;
    }
    const count=s.dispatches; w.step(0); await w.frameFence; expect(s.dispatches).toBe(count);
    expect(warnings).toEqual([]);
    await save('results.json',JSON.stringify(summary,null,2));
},TIMEOUT.gpu);

test('aborted draw does not commit a rail output marker; retry emits the pending parameters',async()=>{
    const w=app.world,s=w.resource(RailGpu),before=await read(s.buffers[0]),count=s.dispatches,submitted=s.submitted;
    const abort={name:'abort-after-rail-emit',group:'draw' as const,after:[RailEmitSystem],before:[MeshPreprocessSystem],update(){throw Error('deliberately aborted qualification draw');}};
    s.separation=.85;w.addSystem(abort);
    try {expect(()=>w.step(0)).toThrow('deliberately aborted qualification draw');} finally {w.removeSystem(abort);}
    expect(s.dispatches).toBe(count);expect(s.submitted).toBe(submitted);
    expect(await read(s.buffers[0])).toEqual(before);
    w.step(0);await w.frameFence;
    expect(s.dispatches).toBe(count+1);expect(s.submitted).toEqual([.85,0,true]);
    const actual=await read(s.buffers[0]),quant=(await s.mesh.quant!.read())[0],reference=cpuReferences.get(.85)!;
    for(let i=0;i<s.mesh.indexCount;i++) {
        const p=decodePos(actual[i*4],actual[i*4+1],quant);
        expect(Math.max(Math.abs(p.x-reference[i*3]),Math.abs(p.y-reference[i*3+1]),Math.abs(p.z-reference[i*3+2]))).toBeLessThan(Math.max(quant.posScale.x,quant.posScale.y,quant.posScale.z)/65535+3e-6);
    }
},TIMEOUT.gpu);

test('immediate disposal after a submitted dirty draw owns every producer allocation exactly once',async()=>{
    const w=disposalApp.world,s=w.resource(RailGpu),device=w.gpu.device;
    const buffers=[...s.buffers,w.gpu.root.unwrap(s.mesh.quant!)],destroyed=new Map<GPUBuffer,number>();
    for(const b of buffers){const destroy=b.destroy.bind(b);b.destroy=()=>{destroyed.set(b,(destroyed.get(b)??0)+1);destroy();};}
    device.pushErrorScope('validation');
    s.separation=1.4;w.step(0);expect(s.dispatches).toBe(1);
    // Intentionally no frameFence/sync before disposal: queued work is in flight.
    disposalApp.dispose();
    await device.queue.onSubmittedWorkDone();
    expect(buffers.map(b=>destroyed.get(b))).toEqual(buffers.map(()=>1));
    expect(await device.popErrorScope()).toBeNull();
},TIMEOUT.gpu);
