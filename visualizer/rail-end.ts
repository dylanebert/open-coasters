import { precompile, Meshes, MeshInstance, MeshMaterial, Materials, StandardMaterial, Transform, type World } from '@dylanebert/shallot';
import { MeshQuant, encodePos, encodeUv, type Mesh } from '@dylanebert/shallot/mesh';
import { MeshPreprocessSystem } from '@dylanebert/shallot/standard/rendering';
import { octEncodeNormal } from '@dylanebert/shallot/utils';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sampleFrames, rotate } from '../construction/geometry';
import { sectionValue, type ConvexSection } from '../construction/section';
import { linearRgba, wallColors } from '../site/src/guide-recipe';
import { path } from './model';
import { palettes } from './palettes';

const layout = tgpu.bindGroupLayout({
    vertices: { storage: d.arrayOf(d.vec4u), access: 'mutable' },
    position: { storage: d.arrayOf(d.vec2u), access: 'mutable' },
    indices: { storage: d.arrayOf(d.u32), access: 'mutable' },
    frames: { storage: d.arrayOf(d.vec4f) },
    section: { storage: d.arrayOf(d.vec2f) },
    triangles: { storage: d.arrayOf(d.vec4u) },
    parameter: { uniform: d.vec4u },
    quant: { storage: d.arrayOf(MeshQuant) },
    drawCount: { storage: d.u32, access: 'mutable' },
});

export function railEnd(world: World, profile: ConvexSection, both: boolean) {
    const frames = sampleFrames(path, path.distances), section = sectionValue(profile);
    const n = section.length, last = frames.length - 1;
    const corner = tgpu.fn([d.u32], d.vec3f)(ref => {
        'use gpu';
        const station = d.u32(ref / d.u32(n));
        const xy = layout.$.section[ref % d.u32(n)];
        const offset = std.select(-.60, .60, layout.$.parameter.y === 1);
        return layout.$.frames[station * 3].xyz
            .add(layout.$.frames[station * 3 + 1].xyz.mul(xy.x + offset))
            .add(layout.$.frames[station * 3 + 2].xyz.mul(xy.y));
    });
    const emit = tgpu.computeFn({ workgroupSize: [64], in: { gid: d.builtin.globalInvocationId } })(input => {
        'use gpu';
        const t = input.gid.x;
        const end = layout.$.parameter.x;
        const caps = layout.$.triangles[0].w > 0;
        const count = std.select(end * d.u32(n * 2), d.u32((n - 2) * 2), caps);
        if (t === 0) layout.$.drawCount = count * 3;
        if (t >= count) return;
        const r = layout.$.triangles[t];
        const shift = std.select(0, end * d.u32(n), r.w === 2);
        const a = corner(r.x + shift); const b = corner(r.y + shift); const c = corner(r.z + shift);
        const normal = octEncodeNormal(std.normalize(std.cross(b.sub(a), c.sub(a))));
        const quant = layout.$.quant[0];
        for (let j = d.u32(0); j < 3; j++) {
            let p = d.vec3f(a); if (j === 1) p = d.vec3f(b); if (j === 2) p = d.vec3f(c);
            const index = t * 3 + j;
            const packed = encodePos(p, 0, quant);
            layout.$.vertices[index] = d.vec4u(packed.x, packed.y, normal, encodeUv(d.vec2f(0), quant));
            layout.$.position[index] = d.vec2u(packed); layout.$.indices[index] = index;
        }
    }).$name('guide:rail-end');
    const { device, root } = world.gpu;
    const allocate = (label: string, size: number, usage: number, data?: ArrayBufferView) => {
        const buffer = device.createBuffer({ label, size, usage: usage | (data ? GPUBufferUsage.COPY_DST : 0) });
        world.own(buffer);
        if (data) device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
        return buffer;
    };
    const basis = new Float32Array(frames.flatMap(f => [...f.translation, 0, ...rotate(f.rotation, [1, 0, 0]), 0, ...rotate(f.rotation, [0, 1, 0]), 0]));
    const xy = new Float32Array(section.flat());
    const storage = GPUBufferUsage.STORAGE;
    const source = allocate('guide frames', basis.byteLength, storage, basis);
    const shape = allocate('guide section', xy.byteLength, storage, xy);
    const radius = .6 + Math.max(...section.map(p => Math.hypot(...p))) + .001;
    const lo = [0, 1, 2].map(a => Math.min(...frames.map(f => f.translation[a])) - radius);
    const hi = [0, 1, 2].map(a => Math.max(...frames.map(f => f.translation[a])) + radius);
    const quant = root.createBuffer(d.arrayOf(MeshQuant, 1), [{ posOffset: d.vec4f(...lo as [number,number,number], 0),
        posScale: d.vec4f(...hi.map((v, i) => v - lo[i]) as [number,number,number], 0), uvScale: d.vec2f(1), streams: 0 }]).$usage('storage');
    world.own(quant);
    const pipeline = root.unwrap(root.createComputePipeline({ compute: emit }));
    precompile(world, 'guide:rail-end', () => [pipeline]);
    // Walls use a prefix of this full-length topology. Far-cap references are
    // relocated by the shader; both cap fans always fit in the same stream.
    const walls: number[] = [], caps: number[] = [];
    for (let i = 0; i < last; i++) for (let j = 0; j < n; j++) {
        const k = (j + 1) % n, a = i*n+j, b = i*n+k, c = (i+1)*n+k, e = (i+1)*n+j;
        walls.push(a,c,b,0, a,e,c,0);
    }
    for (let j = 1; j < n-1; j++) caps.push(0,j,j+1,1, 0,j+1,j,2);
    const materials = world.resource(Materials);
    const handles = [wallColors.light, palettes.light.ink].map(hex => materials.add(StandardMaterial({ unlit: true, baseColor: linearRgba(hex) })));
    const topology = [walls, caps].map(refs => allocate('guide triangle refs', refs.length * 4, storage, new Uint32Array(refs)));
    const rails = Array.from({ length: both ? 2 : 1 }, (_, side) => {
      const parameter = allocate('guide endpoint', 16, GPUBufferUsage.UNIFORM, new Uint32Array([last, side, 0, 0]));
      const streams = [walls, caps].map((refs, i) => {
        const name = `guide ${side ? 'right' : 'left'} ${i ? 'caps' : 'wall'}`, indexCount = refs.length / 4 * 3;
        const vertices = allocate(name + ' vertices', indexCount * 16, storage);
        const position = allocate(name + ' position', indexCount * 8, storage);
        const indices = allocate(name + ' indices', indexCount * 4, storage | GPUBufferUsage.INDEX);
        const drawCount = allocate(name + ' count', 4, storage | GPUBufferUsage.COPY_SRC);
        const mesh: Mesh = { name, vertices: root.createBuffer(d.arrayOf(d.vec4u,indexCount),vertices).$usage('storage'),
            position: root.createBuffer(d.arrayOf(d.vec2u,indexCount),position).$usage('storage'),
            indices: root.createBuffer(d.arrayOf(d.u32,indexCount),indices).$usage('storage','index'),
            quant, indexBase: 0, indexCount, indirectIndexCount: { buffer: drawCount } };
        const entity = world.create();
        world.add(entity, Transform);
        world.add(entity, MeshInstance, { mesh: world.resource(Meshes).add(mesh) });
        world.add(entity, MeshMaterial, handles[i]!);
        const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries:
            [vertices, position, indices, source, shape, topology[i]!, parameter, root.unwrap(quant), drawCount]
                .map((buffer,binding) => ({ binding, resource: { buffer } })) });
        return { group, workgroups: Math.ceil(indexCount / 3 / 64) };
      });
      return { parameter, streams };
    });
    let end = last, submitted = -1;
    const input = new Uint32Array(1);
    return {
      select(distance: number, theme: keyof typeof palettes) {
        end = path.distances.indexOf(distance);
        if (end < 1) throw Error('Expected a sampled guide endpoint');
        [wallColors[theme], palettes[theme].ink].forEach((hex, i) => {
          materials.update(handles[i]!, { baseColor: linearRgba(hex) });
        });
      },
      system: { name: 'guide-rail-end', group: 'draw', before: [MeshPreprocessSystem], update(w: World) {
        if (end === submitted) return;
        const selected = end;
        input[0] = selected;
        // The pinned renderer reads the emitted counts and geometry later in
        // this same submission. A shorter end never draws the retained tail.
        const pass = w.frameEncoder()!.beginComputePass({ label: 'guide:rail-end' });
        pass.setPipeline(pipeline);
        for (const { parameter, streams } of rails) {
          device.queue.writeBuffer(parameter, 0, input);
          for (const { group, workgroups } of streams) {
            pass.setBindGroup(0, group);
            pass.dispatchWorkgroups(workgroups);
          }
        }
        pass.end();
        w.onFrameSubmit(() => { submitted = selected; });
      } } as const,
    };
}
