import type { World } from '@dylanebert/shallot';
import type { Mesh } from '@dylanebert/shallot/mesh';

/** Read the public renderer inputs, never a CPU producer's staging arrays. */
export async function readBuffer(world: World, buffer: Mesh['vertices'] | Mesh['indices'] | NonNullable<Mesh['quant']> | NonNullable<Mesh['position']>) {
  const {device, root} = world.gpu, source = root.unwrap(buffer);
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
