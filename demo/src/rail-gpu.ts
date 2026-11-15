import { precompile, Meshes, type Plugin, type Resource, type World, type System } from '@dylanebert/shallot';
import { MeshPlugin, MeshQuant, encodePos, encodeUv, type Mesh, type MeshHandle } from '@dylanebert/shallot/mesh';
import { MeshPreprocessSystem, MeshRenderPlugin, StandardRenderingPlugin } from '@dylanebert/shallot/standard/rendering';
import { octEncodeNormal } from '@dylanebert/shallot/utils';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { frame, rotate, type Frame } from '../../construction/geometry';
import { sectionValue, type SampledSection } from '../../construction/section';

const layout=tgpu.bindGroupLayout({
    vertices:{storage:d.arrayOf(d.vec4u),access:'mutable'},
    position:{storage:d.arrayOf(d.vec2u),access:'mutable'},
    indices:{storage:d.arrayOf(d.u32),access:'mutable'},
    frames:{storage:d.arrayOf(d.vec4f)},
    section:{storage:d.arrayOf(d.vec2f)},
    triangles:{storage:d.arrayOf(d.vec4u)},
    parameter:{uniform:d.vec4f},
    quant:{storage:d.arrayOf(MeshQuant)},
    colors:{storage:d.arrayOf(d.vec4f)},
});
type Retained={
    mesh:Mesh; handle:MeshHandle; dispatches:number; separation:number; path:number; colored:boolean;
    submitted:readonly [number,number,boolean] | undefined;
    pipeline:GPUComputePipeline; group:GPUBindGroup; parameter:GPUBuffer;
    input:Float32Array; triangles:number; stations:number; paths:number; buffers:GPUBuffer[];
};
export const RailGpu:Resource<Retained>={create:()=>({} as Retained)};

/** Authoritative immutable frames and section in, standard renderer mesh out.
 * The caller owns entity/material policy and serializes parameter edits between frames.
 * All allocations belong exactly once to the world, including submitted work disposal.
 */
export function initializeRailGeometry(world:World, catalogue:readonly (readonly Frame[])[], sectionInput:SampledSection, sampledColors?:ReadonlyArray<ReadonlyArray<readonly number[]>> ) {
    const paths=catalogue.map(p=>p.map(frame)), section=sectionValue(sectionInput);
    const stations=paths[0]?.length ?? 0;
    if(stations<2 || paths.some(p=>p.length!==stations)) throw Error('matching sampled paths required');
    const n=section.length, refs:number[]=[];
    const tri=(a:number,b:number,c:number,rail:number)=>refs.push(a,b,c,rail);
    for(let rail=0;rail<2;rail++) {
        for(let i=0;i<stations-1;i++) for(let j=0;j<n;j++) {
            const k=(j+1)%n,a=i*n+j,b=i*n+k,c=(i+1)*n+k,e=(i+1)*n+j;
            tri(a,b,c,rail);tri(a,c,e,rail);
        }
        const end=(stations-1)*n;
        for(let j=1;j<n-1;j++){tri(0,j+1,j,rail);tri(end,end+j,end+j+1,rail);}
    }
    const radius=.8+Math.max(...section.map(p=>Math.hypot(...p)))+.001;
    const envelopes=paths.map(frames=>{
        const lo=[0,1,2].map(a=>Math.min(...frames.map(f=>f.translation[a]))-radius);
        const hi=[0,1,2].map(a=>Math.max(...frames.map(f=>f.translation[a]))+radius);
        return {lo,hi,scale:hi.map((v,i)=>v-lo[i])};
    });
    const lo=[0,1,2].map(a=>Math.min(...envelopes.map(e=>e.lo[a]))),hi=[0,1,2].map(a=>Math.max(...envelopes.map(e=>e.hi[a])));
    const quantValues=envelopes.map(e=>({posOffset:d.vec4f(e.lo[0],e.lo[1],e.lo[2],0),posScale:d.vec4f(e.scale[0],e.scale[1],e.scale[2],0),uvScale:d.vec2f(1,1),streams:refs.length/4*3}));
    const triangleCount=refs.length/4,count=triangleCount*3;
    const corner=tgpu.fn([d.u32,d.u32],d.vec3f)((ref,rail)=>{
        'use gpu';
        const station=d.u32(ref/d.u32(n))+d.u32(layout.$.parameter.y)*d.u32(stations);
        const xy=layout.$.section[ref%d.u32(n)];
        const origin=layout.$.frames[station*3].xyz;
        const x=layout.$.frames[station*3+1].xyz;
        const y=layout.$.frames[station*3+2].xyz;
        const offset=std.select(-.5,.5,rail===1)*layout.$.parameter.x;
        return origin.add(x.mul(xy.x+offset)).add(y.mul(xy.y));
    });
    const emit=tgpu.computeFn({workgroupSize:[64],in:{gid:d.builtin.globalInvocationId}})(input=>{
        'use gpu';
        const t=input.gid.x;
        if(t>=triangleCount) return;
        const r=layout.$.triangles[t];
        const a=corner(r.x,r.w);
        const b=corner(r.y,r.w);
        const c=corner(r.z,r.w);
        const normal=octEncodeNormal(std.normalize(std.cross(b.sub(a),c.sub(a))));
        const selector=d.u32(layout.$.parameter.y);
        const quant=layout.$.quant[selector];
        for(let j=d.u32(0);j<3;j++) {
            let p=d.vec3f(a);if(j===1)p=d.vec3f(b);if(j===2)p=d.vec3f(c);
            const index=t*3+j;
            const packed=encodePos(p,selector,quant);
            layout.$.vertices[index]=d.vec4u(packed.x,packed.y,normal,encodeUv(d.vec2f(0),quant));
            layout.$.position[index]=d.vec2u(packed);layout.$.indices[index]=index;
            let ref=r.x;if(j===1)ref=r.y;if(j===2)ref=r.z;
            let color=d.vec4f(1);
            if(layout.$.parameter.z>0)color=d.vec4f(layout.$.colors[selector*d.u32(stations)+d.u32(ref/d.u32(n))]);
            const rg=std.pack2x16unorm(color.xy);
            const ba=std.pack2x16unorm(color.zw);
            const at=d.u32(count)+d.u32(index/2);
            if(index%2===0){layout.$.vertices[at].x=rg;layout.$.vertices[at].y=ba;}
            else {layout.$.vertices[at].z=rg;layout.$.vertices[at].w=ba;}
        }
    }).$name('rail:emit');
    const {device,root}=world.gpu;
    const allocate=(size:number,usage:number,data?:ArrayBufferView)=>{
        const buffer=device.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST});world.own(buffer);
        if(data)device.queue.writeBuffer(buffer,0,data.buffer,data.byteOffset,data.byteLength);
        return buffer;
    };
    const read=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC;
    const vertices=allocate(count*24,read),position=allocate(count*8,read),indices=allocate(count*4,read|GPUBufferUsage.INDEX);
    const basis=new Float32Array(paths.flatMap(frames=>frames.flatMap(f=>[...f.translation,0,...rotate(f.rotation,[1,0,0]),0,...rotate(f.rotation,[0,1,0]),0])));
    const source=allocate(basis.byteLength,GPUBufferUsage.STORAGE,basis),xy=new Float32Array(section.flat());
    const shape=allocate(xy.byteLength,GPUBufferUsage.STORAGE,xy),topology=new Uint32Array(refs);
    const triangles=allocate(topology.byteLength,GPUBufferUsage.STORAGE,topology),parameter=allocate(16,GPUBufferUsage.UNIFORM);
    const quant=root.createBuffer(d.arrayOf(MeshQuant,paths.length),quantValues).$usage('storage');world.own(quant);
    const mesh:Mesh={name:'Circular rails',streams:{color:true},vertices:root.createBuffer(d.arrayOf(d.vec4u,count*3/2),vertices).$usage('storage'),position:root.createBuffer(d.arrayOf(d.vec2u,count),position).$usage('storage'),indices:root.createBuffer(d.arrayOf(d.u32,count),indices).$usage('storage','index'),quant,indexBase:0,indexCount:count,bounds:[...lo.map((v,i)=>(v+hi[i])/2),Math.hypot(...hi.map((v,i)=>v-lo[i]))/2] as [number,number,number,number]};
    const pipeline=root.unwrap(root.createComputePipeline({compute:emit}));precompile(world,'rail:emit',()=>[pipeline]);
    const buffers=[vertices,position,indices,source,shape,triangles,parameter];
    const colors=new Float32Array(paths.flatMap((_,i)=>Array.from({length:stations},(_,j)=>Array.from(sampledColors?.[i]?.[j] ?? [1,1,1,1])).flat()));
    const colorBuffer=allocate(colors.byteLength,GPUBufferUsage.STORAGE,colors);
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[...buffers,root.unwrap(quant),colorBuffer].map((buffer,binding)=>({binding,resource:{buffer}}))});
    Object.assign(world.resource(RailGpu),{mesh,handle:world.resource(Meshes).add(mesh),dispatches:0,separation:.6,path:0,colored:false,submitted:undefined,pipeline,group,parameter,input:new Float32Array(4),triangles:triangleCount,stations,paths:paths.length,buffers:[...buffers,colorBuffer]});
}
export const RailEmitSystem:System={name:'emit-rails',group:'draw',before:[MeshPreprocessSystem],update(world){
        const s=world.resource(RailGpu);
        if(!s.mesh)return;
        if(!Number.isFinite(s.separation)||s.separation<.6||s.separation>1.6||!Number.isInteger(s.path)||s.path<0||s.path>=s.paths)throw Error('invalid sampled rail parameters');
        if(s.submitted?.[0]===s.separation&&s.submitted[1]===s.path&&s.submitted[2]===s.colored)return;
        s.input[0]=s.separation;s.input[1]=s.path;s.input[2]=Number(s.colored);world.gpu.device.queue.writeBuffer(s.parameter,0,s.input);
        const pass=world.frameEncoder()!.beginComputePass({label:'rail:emit'});
        pass.setPipeline(s.pipeline);pass.setBindGroup(0,s.group);pass.dispatchWorkgroups(Math.ceil(s.triangles/64));pass.end();
        const submitted=[s.separation,s.path,s.colored] as const;
        world.onFrameSubmit(()=>{s.submitted=submitted;s.dispatches++;});
    }};
export const RailGpuPlugin:Plugin={
    name:'rail-gpu',gpu:{},dependencies:[MeshPlugin,MeshRenderPlugin,StandardRenderingPlugin],systems:[RailEmitSystem],
};
export function railGpu(frames:readonly Frame[],section:SampledSection):Plugin {
    return {name:'sampled-rail-input',dependencies:[RailGpuPlugin],initialize(world){initializeRailGeometry(world,[frames],section);}};
}
