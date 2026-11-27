import { Meshes, MeshInstance, type World } from '@dylanebert/shallot';
import type { Mesh, MeshHandle } from '@dylanebert/shallot/mesh';
import { globalTransformTable } from '@dylanebert/shallot/rendering';
import { Live } from './live';
import { TrackDeformation } from './track-deformation-gpu';

/** Read the public renderer inputs, never a CPU producer's staging arrays. */
export async function readBuffer(world: World, buffer: Mesh['vertices'] | Mesh['indices'] | NonNullable<Mesh['quant']> | NonNullable<Mesh['position']>) {
  return readGpuBuffer(world, world.gpu.root.unwrap(buffer));
}

export async function readGpuBuffer(world: World, source: GPUBuffer) {
  const {device} = world.gpu;
  const target = device.createBuffer({size:source.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
    const encoder=device.createCommandEncoder();
    encoder.copyBufferToBuffer(source,0,target,0,source.size);
    device.queue.submit([encoder.finish()]);
    await target.mapAsync(GPUMapMode.READ);
    return target.getMappedRange().slice(0);
  } finally { target.unmap(); target.destroy(); }
}

export async function readMesh(world: World, mesh: Mesh) {
  await world.frameFence;
  const [main,position,quant,indices]=await Promise.all([
    readBuffer(world,mesh.vertices),readBuffer(world,mesh.position!),readBuffer(world,mesh.quant!),readBuffer(world,mesh.indices),
  ]);
  const words=new Uint32Array(main), positions=new Uint32Array(position), ids=new Uint32Array(indices), q=new DataView(quant);
  const points:number[][]=[];
  for(let i=mesh.indexBase;i<mesh.indexBase+mesh.indexCount;i++) {
    const index=ids[i], a=words[index*4], b=words[index*4+1];
    if(a!==positions[index*2] || b!==positions[index*2+1]) throw Error('main/position streams disagree');
    const offset=(b>>>16)*48;
    points.push([a&65535,a>>>16,b&65535].map((v,j)=>q.getFloat32(offset+j*4,true)+v/65535*q.getFloat32(offset+16+j*4,true)));
  }
  return {main,position,quant,indices,points};
}

/** Observe application track/tie traffic in untimed frames, not general uploads. */
export function trackWork(w:World) {
  const state=w.resource(TrackDeformation).retained;
  const live=w.resource(Live), instances=w.storage(MeshInstance);
  const ties=live.roles.get('ModernTie_Med')!.rows.flatMap(row=>row.entities);
  const probe=observeTrackWork(w,[{state, handles:live.trackEntities.map(e=>instances.mesh.get(e) as MeshHandle), ties}]);
  return {work:probe.work[0],restore:probe.restore};
}

type Target = {
  state?: {frames: GPUBuffer; parts: {group: GPUBindGroup}[]};
  handles: MeshHandle[];
  meshEntities?: number[];
  ties: number[];
};
export function observeTrackWork(w:World, targets:Target[]) {
  const queue=w.gpu.device.queue, meshes=w.resource(Meshes), instances=w.storage(MeshInstance);
  const meshBuffers=(handles: MeshHandle[])=>new Set(handles.flatMap(handle=>{
    const {vertices,position,indices,quant}=meshes.get(handle)!;
    return [vertices,position,indices,quant].flatMap(buffer=>buffer ? [w.gpu.root.unwrap(buffer)] : []);
  }));
  const work=targets.map(()=>({dispatches:0, frameBytes:0, meshBytes:0, tieMeshBytes:0, tieBytes:0}));
  const buffers=targets.map(t=>meshBuffers(t.handles));
  const tieBuffers=targets.map(t=>meshBuffers(t.ties.map(e=>instances.mesh.get(e) as MeshHandle)));
  const groups=new Map(targets.flatMap((t,i)=>t.state?.parts.map(p=>[p.group,i] as const)??[]));
  const table=globalTransformTable(w);
  const write=queue.writeBuffer, encoder=w.frameEncoder;
  queue.writeBuffer=function(...args:Parameters<GPUQueue['writeBuffer']>){
    const [dst,offset,data,from=0,size]=args;
    const width=ArrayBuffer.isView(data)&&'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const bytes=size===undefined?data.byteLength-from*width:size*width;
    // The transform table's packed native writes pass their destination row
    // range as a byte range of the source; direct writes use the target offset.
    const start=dst.label.startsWith('global-transform-tick-')?from*width:offset;
    for(let i=0;i<targets.length;i++) {
      if(dst===targets[i].state?.frames)work[i].frameBytes+=bytes;
      if(buffers[i].has(dst)||/^track:(rails|spine):local$/.test(dst.label))work[i].meshBytes+=bytes;
      if(tieBuffers[i].has(dst))work[i].tieMeshBytes+=bytes;
      if(/^(global-transform-tick-|table-global-transform-g)/.test(dst.label)) {
        const overlap=(entity:number)=>{
          const index=table.rowIndex(entity);
          return index<0?0:Math.max(0,Math.min(index*48+48,start+bytes)-Math.max(index*48,start));
        };
        for(const entity of targets[i].ties)work[i].tieBytes+=overlap(entity);
        for(const entity of targets[i].meshEntities??[])work[i].meshBytes+=overlap(entity);
      }
    }
    return write.apply(queue,args);
  };
  const patched=new WeakSet<GPUCommandEncoder>();
  w.frameEncoder=function(){
    const e=encoder.call(w);
    if(e&&!patched.has(e)){
      patched.add(e);
      const begin=e.beginComputePass;
      e.beginComputePass=function(descriptor){
        const pass=begin.call(e,descriptor);
        if(descriptor?.label==='track:deform') {
          let target: number | undefined;
          const bind=pass.setBindGroup, dispatch=pass.dispatchWorkgroups;
          pass.setBindGroup=function(index,group){
            if(index===0)target=group==null?undefined:groups.get(group);
            return Reflect.apply(bind,pass,arguments);
          };
          pass.dispatchWorkgroups=function(...args){
            if(target===undefined)throw Error('untracked track deformation dispatch');
            work[target].dispatches++;
            return dispatch.apply(pass,args);
          };
        }
        return pass;
      };
    }
    return e;
  };
  return {work,restore(){queue.writeBuffer=write;w.frameEncoder=encoder;}};
}
