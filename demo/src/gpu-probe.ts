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
  const {device}=w.gpu, queue=device.queue;
  const state=w.resource(TrackDeformation).retained;
  const live=w.resource(Live), meshes=w.resource(Meshes), instances=w.storage(MeshInstance);
  const meshBuffers=(handles: MeshHandle[])=>new Set(handles.flatMap(handle=>{
    const {vertices,position,indices,quant}=meshes.get(handle)!;
    return [vertices,position,indices,quant].flatMap(buffer=>buffer ? [w.gpu.root.unwrap(buffer)] : []);
  }));
  const buffers=meshBuffers(live.trackEntities.map(e=>instances.mesh.get(e) as MeshHandle));
  const ties=live.roles.get('ModernTie_Med')!;
  const tieBuffers=meshBuffers(ties.rows[0].entities.map(e=>instances.mesh.get(e) as MeshHandle));
  const tieEntities=ties.rows.flatMap(row=>row.entities);
  const table=globalTransformTable(w);
  const work={dispatches:0, frameBytes:0, meshBytes:0, tieMeshBytes:0, tieBytes:0};
  const write=queue.writeBuffer, encoder=w.frameEncoder;
  queue.writeBuffer=function(...args:Parameters<GPUQueue['writeBuffer']>){
    const [dst,offset,data,from=0,size]=args;
    const width=ArrayBuffer.isView(data)&&'BYTES_PER_ELEMENT' in data ? Number(data.BYTES_PER_ELEMENT) : 1;
    const bytes=size===undefined?data.byteLength-from*width:size*width;
    if(dst===state?.frames)work.frameBytes+=bytes;
    if(buffers.has(dst)||/^track:(rails|spine):local$/.test(dst.label))work.meshBytes+=bytes;
    if(tieBuffers.has(dst))work.tieMeshBytes+=bytes;
    // The transform table's packed native writes pass their destination row
    // range as a byte range of the source; direct writes use the target offset.
    const start=dst.label.startsWith('global-transform-tick-')?from*width:offset;
    if(/^(global-transform-tick-|table-global-transform-g)/.test(dst.label))
      for(const entity of tieEntities) {
        const index=table.rowIndex(entity);
        if(index>=0)work.tieBytes+=Math.max(0,Math.min(index*48+48,start+bytes)-Math.max(index*48,start));
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
          const dispatch=pass.dispatchWorkgroups;
          pass.dispatchWorkgroups=function(...args){work.dispatches++;return dispatch.apply(pass,args);};
        }
        return pass;
      };
    }
    return e;
  };
  return {work,restore(){queue.writeBuffer=write;w.frameEncoder=encoder;}};
}
