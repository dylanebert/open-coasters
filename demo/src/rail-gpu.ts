import { precompile, Meshes, MeshInstance, MeshMaterial, Transform, type Plugin, type Resource, type World } from '@dylanebert/shallot';
import { MeshPlugin, MeshQuant, encodePos, encodeUv, type Mesh } from '@dylanebert/shallot/mesh';
import { MeshPreprocessSystem, MeshRenderPlugin, StandardRenderingPlugin, type MaterialHandle } from '@dylanebert/shallot/standard/rendering';
import { octEncodeNormal } from '@dylanebert/shallot/utils';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { frame, rotate, type Frame } from '../../construction/geometry';
import { sectionValue, type SampledSection } from '../../construction/section';

const layout = tgpu.bindGroupLayout({
    vertices: { storage: d.arrayOf(d.vec4u), access: 'mutable' },
    position: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
    indices: { storage: d.arrayOf(d.u32), access: 'mutable' },
    frames: { storage: d.arrayOf(d.vec4f) },
    section: { storage: d.arrayOf(d.vec2f) },
    triangles: { storage: d.arrayOf(d.vec4u) },
    separation: { uniform: d.vec4f },
    // First-proof witness: exact pre-quantization f32 triangle positions.
    emitted: { storage: d.arrayOf(d.vec4f), access: 'mutable' },
});

type Retained = {
    mesh: Mesh; entity: number; dispatches: number; separation: number; emitted: number;
    pipeline: GPUComputePipeline; group: GPUBindGroup; parameter: GPUBuffer;
    input: Float32Array; triangles: number; buffers: GPUBuffer[];
};
export const RailGpu: Resource<Retained> = { create: () => ({} as Retained) };
/** One retained open pair. Inputs are copied/validated once; only separation changes.
 * Queue writes and dispatches are serialized by the owning world's frame submission.
 * No individual disposal: all backing buffers belong to that world's lifetime.
 */
export function railGpu(framesInput: readonly Frame[], sectionInput: SampledSection, material: (world: World) => MaterialHandle): Plugin {
    const frames = framesInput.map(frame), section = sectionValue(sectionInput);
    if (frames.length < 2) throw Error('two stations required');
    const n = section.length, refs: number[] = [];
    const tri = (a: number, b: number, c: number, rail: number) => refs.push(a,b,c,rail);
    for (let rail = 0; rail < 2; rail++) {
        for (let i = 0; i < frames.length-1; i++) for (let j = 0; j < n; j++) {
            const k = (j+1)%n, a=i*n+j, b=i*n+k, c=(i+1)*n+k, e=(i+1)*n+j;
            tri(a,b,c,rail); tri(a,c,e,rail);
        }
        const end=(frames.length-1)*n;
        for(let j=1;j<n-1;j++) { tri(0,j+1,j,rail); tri(end,end+j,end+j+1,rail); }
    }
    const triangleCount=refs.length/4, count=triangleCount*3;
    const radius = .8 + Math.max(...section.map(p => Math.hypot(...p)));
    const lo=[0,1,2].map(a => Math.min(...frames.map(f=>f.translation[a]))-radius-.001);
    const hi=[0,1,2].map(a => Math.max(...frames.map(f=>f.translation[a]))+radius+.001);
    const scale=hi.map((x,i)=>x-lo[i]);
    const quantValue = { posOffset: d.vec4f(lo[0],lo[1],lo[2],0), posScale: d.vec4f(scale[0],scale[1],scale[2],0), uvScale: d.vec2f(1,1), streams: 0 };
    const corner = tgpu.fn([d.u32,d.u32],d.vec3f)((ref,rail)=>{
        'use gpu';
        const station=d.u32(ref/d.u32(n));
        const xy=layout.$.section[ref%d.u32(n)];
        const origin=layout.$.frames[station*3].xyz;
        const x=layout.$.frames[station*3+1].xyz;
        const y=layout.$.frames[station*3+2].xyz;
        const offset=std.select(-.5,.5,rail===1)*layout.$.separation.x;
        return origin.add(x.mul(xy.x+offset)).add(y.mul(xy.y));
    });
    const emit=tgpu.computeFn({ workgroupSize:[64], in:{gid:d.builtin.globalInvocationId} })(input=>{
        'use gpu';
        const t=input.gid.x;
        if(t>=triangleCount) return;
        const r=layout.$.triangles[t];
        const a=corner(r.x,r.w);
        const b=corner(r.y,r.w);
        const c=corner(r.z,r.w);
        const normal=octEncodeNormal(std.normalize(std.cross(b.sub(a),c.sub(a))));
        for(let j=d.u32(0);j<3;j++) {
            let p=d.vec3f(a);
            if(j===1) p=d.vec3f(b);
            if(j===2) p=d.vec3f(c);
            const index=t*3+j;
            const packed=encodePos(p,0,quantValue);
            layout.$.vertices[index]=d.vec4u(packed.x,packed.y,normal,encodeUv(d.vec2f(0),quantValue));
            layout.$.position[index]=d.vec2u(packed);
            layout.$.indices[index]=index;
            layout.$.emitted[index]=d.vec4f(p,1);
        }
    }).$name('rail:emit');
    return {
        name:'rail-gpu', gpu:{}, dependencies:[MeshPlugin,MeshRenderPlugin,StandardRenderingPlugin],
        initialize(world) {
            const {device,root}=world.gpu;
            const allocate=(size:number,usage:number,data?:ArrayBufferView)=>{
                const b=device.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST}); world.own(b);
                if(data) device.queue.writeBuffer(b,0,data.buffer,data.byteOffset,data.byteLength);
                return b;
            };
            const read=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC;
            const vertices=allocate(count*16,read), position=allocate(count*8,read), indices=allocate(count*4,read|GPUBufferUsage.INDEX);
            const basis=new Float32Array(frames.flatMap(f=>[...f.translation,0,...rotate(f.rotation,[1,0,0]),0,...rotate(f.rotation,[0,1,0]),0]));
            const source=allocate(basis.byteLength,GPUBufferUsage.STORAGE,basis);
            const xy=new Float32Array(section.flat());
            const shape=allocate(xy.byteLength,GPUBufferUsage.STORAGE,xy);
            const topology=new Uint32Array(refs);
            const triangles=allocate(topology.byteLength,GPUBufferUsage.STORAGE,topology);
            const parameter=allocate(16,GPUBufferUsage.UNIFORM);
            const quant=root.createBuffer(d.arrayOf(MeshQuant,1),[quantValue]).$usage('storage');
            world.own(quant);
            const mesh:Mesh={
                name:'retained-rail-pair',
                vertices:root.createBuffer(d.arrayOf(d.vec4u,count),vertices).$usage('storage'),
                position:root.createBuffer(d.arrayOf(d.vec2u,count),position).$usage('storage'),
                indices:root.createBuffer(d.arrayOf(d.u32,count),indices).$usage('storage','index'),
                quant,indexBase:0,indexCount:count,
                bounds:[...lo.map((x,i)=>(x+hi[i])/2),Math.hypot(...scale)/2] as [number,number,number,number],
            };
            const pipeline=root.unwrap(root.createComputePipeline({compute:emit}));
            precompile(world,'rail:emit',()=>[pipeline]);
            const emitted=allocate(count*16,read);
            const buffers=[vertices,position,indices,source,shape,triangles,parameter,emitted];
            const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
            const entity=world.create(); world.add(entity,Transform);
            world.add(entity,MeshInstance,{mesh:world.resource(Meshes).add(mesh)});
            world.add(entity,MeshMaterial,material(world));
            Object.assign(world.resource(RailGpu),{mesh,entity,dispatches:0,separation:.6,emitted:NaN,pipeline,group,parameter,input:new Float32Array(4),triangles:triangleCount,buffers});
        },
        systems:[{ name:'emit-rails',group:'draw',before:[MeshPreprocessSystem],update(world){
            const s=world.resource(RailGpu)!;
            if(!Number.isFinite(s.separation)||s.separation<.6||s.separation>1.6) throw Error('separation outside [.6,1.6]');
            if(s.emitted===s.separation) return;
            s.input[0]=s.separation; world.gpu.device.queue.writeBuffer(s.parameter,0,s.input);
            const pass=world.frameEncoder()!.beginComputePass({label:'rail:emit'});
            pass.setPipeline(s.pipeline); pass.setBindGroup(0,s.group); pass.dispatchWorkgroups(Math.ceil(s.triangles/64)); pass.end();
            const submitted=s.separation;
            world.onFrameSubmit(()=>{s.emitted=submitted; s.dispatches++;});
        }}],
    };
}
