import { Meshes, precompile, type Plugin, type Resource, type System, type World } from '@dylanebert/shallot';
import { MeshPlugin, MeshQuant, encodePos, type Mesh, type MeshHandle } from '@dylanebert/shallot/mesh';
import { MeshPreprocessSystem, MeshRenderPlugin, StandardRenderingPlugin } from '@dylanebert/shallot/standard/rendering';
import { octEncodeNormal } from '@dylanebert/shallot/utils';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import type { Profile } from './profile';
import { profileTopology, sweepIntervals, type SweepCaps } from './profile-sweep';
import { replayLength, restCurvature } from './track-deformation';
import { bankedCurveFrame, type frame, type Vec } from './track';

function deformationShader() {
  const layout = tgpu.bindGroupLayout({
    vertices: {storage: d.arrayOf(d.vec4u), access: 'mutable'},
    position: {storage: d.arrayOf(d.vec2u), access: 'mutable'},
    local: {storage: d.arrayOf(d.vec4f)},
    frames: {storage: d.arrayOf(d.vec4f)},
    quant: {storage: d.arrayOf(MeshQuant)},
  });
  return tgpu.computeFn({workgroupSize: [64], in: {gid: d.builtin.globalInvocationId}})(input => {
    'use gpu';
    const i = input.gid.x;
    if (i >= layout.$.quant[0].streams) return;
    const local = layout.$.local[i*2];
    const normal = layout.$.local[i*2+1].xyz;
    const at = d.u32(local.z)*4;
    const x = layout.$.frames[at+1].xyz;
    const y = layout.$.frames[at+2].xyz;
    const z = layout.$.frames[at+3].xyz;
    const p = layout.$.frames[at].xyz.add(x.mul(local.x)).add(y.mul(local.y));
    const n = x.mul(normal.x).add(y.mul(normal.y)).add(z.mul(normal.z));
    const packed = encodePos(p, 0, layout.$.quant[0]);
    layout.$.position[i] = d.vec2u(packed);
    layout.$.vertices[i] = d.vec4u(packed.x, packed.y, octEncodeNormal(n), 0);
  }).$name('track:deform');
}

type Part = {name: 'rails' | 'spine'; mesh: MeshHandle; group: GPUBindGroup; count: number};
type SpanInput = {
  length: number;
  at: (revision: number, distance: number) => ReturnType<typeof frame>;
  range: (radius: number) => {center: Vec; half: Vec};
  caps?: SweepCaps;
};
type Retained = {
  frames: GPUBuffer; basis: Float32Array; parts: Part[]; input: SpanInput;
  revision: number; submitted?: number;
};
export const TrackDeformation: Resource<{retained?: Retained; spans: Retained[]; pipeline?: GPUComputePipeline}> = {
  create: () => ({spans: []}),
};
export function prepareTrackDeformation(world: World, rail: Profile, spine: Profile) {
  const state = prepareTrackSpan(world, rail, spine, restCurvature, {
    length: replayLength, at: (curvature, s) => bankedCurveFrame(s, curvature),
    // The fixed midpoint and half arc length bound every centerline sample.
    range: radius => {
      const reach = replayLength / 2 + radius;
      return {center: [2, 1.5, 0], half: [reach, radius, reach]};
    },
  });
  world.resource(TrackDeformation).retained = state;
  return state.parts;
}

// The caller supplies conservative local bounds covering every revision.
// Mesh handles and buffers belong to the world, as in the stock replay.
export function prepareTrackSpan(world: World, rail: Profile, spine: Profile, revision: number, input: SpanInput) {
  const {device, root} = world.gpu;
  const allocate = (label: string, size: number, usage: number, data?: Uint32Array | Float32Array) => {
    const buffer = device.createBuffer({label, size, usage: usage | (data ? GPUBufferUsage.COPY_DST : 0)});
    world.own(buffer);
    if (data) device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  };
  const basis = new Float32Array((sweepIntervals + 1) * 16);
  const frames = allocate('track:frames', basis.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const state = world.resource(TrackDeformation);
  if (!state.pipeline) {
    const pipeline = root.unwrap(root.createComputePipeline({compute: deformationShader()}));
    state.pipeline = pipeline;
    precompile(world, 'track:deform', () => [pipeline]);
  }
  const pipeline = state.pipeline;
  const read = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
  const make = (name: Part['name'], profile: Profile): Part => {
    const local: number[] = [];
    const {indices} = profileTopology(profile, 0, (station, [x, y], nx, ny, nz) => {
      local.push(x, y, station, 0, nx, ny, nz, 0);
    }, input.caps);
    const radius = Math.max(...profile.points.map(p => Math.hypot(...p))) + .001;
    const {center, half} = input.range(radius);
    const count = local.length / 8;
    const quant = root.createBuffer(d.arrayOf(MeshQuant, 1), [{
      posOffset: d.vec4f(center[0]-half[0], center[1]-half[1], center[2]-half[2], 0),
      posScale: d.vec4f(2*half[0], 2*half[1], 2*half[2], 0),
      uvScale: d.vec2f(1, 1), streams: count,
    }]).$usage('storage');
    world.own(quant);
    const shape = Float32Array.from(local), topology = Uint32Array.from(indices);
    const source = allocate(`track:${name}:local`, shape.byteLength, GPUBufferUsage.STORAGE, shape);
    const index = allocate(`track:${name}:indices`, topology.byteLength, read | GPUBufferUsage.INDEX, topology);
    const main = allocate(`track:${name}:vertices`, count*16, read);
    const position = allocate(`track:${name}:position`, count*8, read);
    const mesh: Mesh = {
      name: `Track ${name}`, vertices: root.createBuffer(d.arrayOf(d.vec4u, count), main).$usage('storage'),
      position: root.createBuffer(d.arrayOf(d.vec2u, count), position).$usage('storage'),
      indices: root.createBuffer(d.arrayOf(d.u32, indices.length), index).$usage('storage', 'index'),
      quant, indexBase: 0, indexCount: indices.length,
      bounds: [...center, Math.hypot(...half)],
    };
    const group = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries:
      [main, position, source, frames, root.unwrap(quant)].map((buffer, binding) => ({binding, resource: {buffer}})),
    });
    return {name, mesh: world.resource(Meshes).add(mesh), group, count};
  };
  const span: Retained = {frames, basis, parts: [make('rails', rail), make('spine', spine)], revision, input};
  state.spans.push(span);
  return span;
}

const deform: System = {name: 'deform-track', group: 'draw', before: [MeshPreprocessSystem], update(world) {
  const {spans, pipeline} = world.resource(TrackDeformation);
  let pass: GPUComputePassEncoder | undefined;
  for (const s of spans) {
    if (s.revision === s.submitted) continue;
    const revision = s.revision;
    for (let i = 0; i <= sweepIntervals; i++) {
      const {p, x, y, z} = s.input.at(revision, s.input.length * i / sweepIntervals);
      s.basis.set([...p, 0, ...x, 0, ...y, 0, ...z, 0], i*16);
    }
    world.gpu.device.queue.writeBuffer(s.frames, 0, s.basis);
    if (!pass) {
      pass = world.frameEncoder()!.beginComputePass({label: 'track:deform', timestampWrites: world.gpu.span?.('track:deform')});
      pass.setPipeline(pipeline!);
    }
    for (const part of s.parts) {
      pass.setBindGroup(0, part.group);
      pass.dispatchWorkgroups(Math.ceil(part.count / 64));
    }
    world.onFrameSubmit(() => { s.submitted = revision; });
  }
  pass?.end();
}};
export const TrackDeformationPlugin: Plugin = {
  name: 'track-deformation', gpu: {}, dependencies: [MeshPlugin, MeshRenderPlugin, StandardRenderingPlugin], systems: [deform],
};
