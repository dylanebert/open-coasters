// Diagnostic build only: imported by placement.ts's build transform, never production.
import { Meshes, Transform } from '@dylanebert/shallot';
import { Scene } from '../src/scene';

export function install(app: any, live: any) {
  const w = app.world;
  const d: any = { app, frames: 0, updates: [], events: [], phases: [], counts: {}, allocations: [], uploads: [], lastInput: 0 };
  const count = (key: string, n = 1) => d.counts[key] = (d.counts[key] ?? 0) + n;
  d.time = (name: string, fn: () => any) => { const t = performance.now(); try { return fn(); } finally { d.phases.push({ name, ms: performance.now() - t }); } };
  for (const key of ['create', 'destroy']) { const fn = w[key].bind(w); w[key] = (...a: any[]) => { count('entity.' + key); return fn(...a); }; }
  const meshes = w.resource(Meshes);
  for (const key of ['clear', 'add']) { const fn = meshes[key].bind(meshes); meshes[key] = (...a: any[]) => { count('mesh.' + key); if(key==='add')count(a[0].vertices instanceof Float32Array?'mesh.add.cpu':a[0].pending?'mesh.add.pending':'mesh.add.gpu'); return fn(...a); }; }
  const bufferIds = new WeakMap<object,number>(); let nextBufferId=0;
  const bufferId = (buffer:any) => { if(!buffer)return null;const gpu=w.gpu.root.unwrap(buffer);if(!bufferIds.has(gpu))bufferIds.set(gpu,++nextBufferId);return bufferIds.get(gpu); };
  d.meshes = () => [...meshes.entries()].map(([handle,m]:any)=>({handle,name:m.name,indexCount:m.indexCount,vertices:bufferId(m.vertices),position:bufferId(m.position),quant:bufferId(m.quant),indices:bufferId(m.indices)}));
  const device = w.gpu.device, queue = device.queue;
  const alloc = device.createBuffer.bind(device);
  device.createBuffer = (desc: GPUBufferDescriptor) => { count('buffer.create'); count('buffer.bytes', desc.size); if(desc.mappedAtCreation)count('buffer.mappedAtCreation.bytes',desc.size); d.allocations.push({at:performance.now(),...desc}); return alloc(desc); };
  const destroyBuffer = GPUBuffer.prototype.destroy;
  GPUBuffer.prototype.destroy = function() { count('buffer.destroy'); return destroyBuffer.call(this); };
  const write = queue.writeBuffer.bind(queue);
  queue.writeBuffer = (...a: any[]) => { count('writeBuffer.calls'); const data = a[2]; const bytes = (a[4] ?? ((data.byteLength ?? data.length) / (data.BYTES_PER_ELEMENT ?? 1) - (a[3] ?? 0))) * (data.BYTES_PER_ELEMENT ?? 1); count('writeBuffer.bytes',bytes); d.uploads.push({at:performance.now(),label:a[0].label,bytes}); return write(...a); };
  const encoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (...a: any[]) => {
    const e = encoder(...a), copy = e.copyBufferToBuffer.bind(e);
    e.copyBufferToBuffer = (...b: any[]) => { count('copyBufferToBuffer.calls'); count('copyBufferToBuffer.bytes', b.length === 5 ? b[4] : b[2]); return copy(...b); };
    return e;
  };
  const update = live.update.bind(live);
  live.update = async (selection: any) => {
    const t = performance.now(), before = { ...d.counts }, phase = d.phases.length;
    await update(selection);
    d.updates.push({ selection: JSON.parse(JSON.stringify(selection)), start: t, ms: performance.now() - t, counts: Object.fromEntries(Object.entries(d.counts).map(([k,v]) => [k, (v as number) - (before[k] ?? 0)])), phases: d.phases.slice(phase) });
  };
  d.frame = () => { d.frames++; const u = d.updates.at(-1); if (u && !u.frameEnd) { u.frameEnd = performance.now(); u.inputToFrame = u.frameEnd - d.lastInput; u.totalCounts = { ...d.counts }; } };
  for (const type of ['input','change','focusin','focusout','pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) document.addEventListener(type, (e: any) => {
    if (!(e.target instanceof Element) || !e.target.closest('aside')) return;
    if (type === 'input' || type === 'pointermove') d.lastInput = performance.now();
    d.events.push({ type, at: performance.now(), name: e.target.name, value: e.target.value, x: e.clientX, y: e.clientY, captured: e.target.hasPointerCapture?.(e.pointerId), active: document.activeElement?.getAttribute('name') });
  }, true);
  d.instances = () => { const t = w.storage(Transform); return w.resource(Scene).instances.map((g: number[]) => g.map(e => [t.translation.x.get(e), t.translation.y.get(e), t.translation.z.get(e)])); };
  d.readRails = async () => {
    await w.frameFence;
    const mesh = [...meshes].find((m: any) => m.name === 'Circular rails');
    if (!mesh) return null;
    const read = async (buffer: any) => {
      const src = w.gpu.root.unwrap(buffer);
      const dst = device.createBuffer({ size: src.size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const e = device.createCommandEncoder(); e.copyBufferToBuffer(src, 0, dst, 0, src.size); queue.submit([e.finish()]);
      await dst.mapAsync(GPUMapMode.READ); const bytes = dst.getMappedRange().slice(0); dst.unmap(); dst.destroy(); return bytes;
    };
    const words = new Uint32Array(await read(mesh.vertices)), quant = await read(mesh.quant), q = new DataView(quant), ids = new Uint32Array(await read(mesh.indices));
    const positions: number[][] = [];
    for (let i = mesh.indexBase; i < mesh.indexBase + mesh.indexCount; i++) {
      const k = ids[i] * 4, a = words[k], b = words[k+1], offset = (b >>> 16) * 48;
      positions.push([a & 65535, a >>> 16, b & 65535].map((v,j) => q.getFloat32(offset+j*4,true) + v/65535*q.getFloat32(offset+16+j*4,true)));
    }
    return { positions, indexCount: mesh.indexCount, quantBytes: quant.byteLength };
  };
  (globalThis as any).__placement = d;
  return d;
}
