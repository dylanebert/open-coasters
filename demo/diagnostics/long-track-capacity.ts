import { MeshQuant } from '@dylanebert/shallot/mesh';
import * as d from 'typegpu/data';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { staticInstanceSnapshot } from '../src/instance';
import { loadProfile, type Profile } from '../src/profile';
import { sweepIntervals } from '../src/profile-sweep';
import { sectionTriangles } from '../src/section-cap';
import { defaults } from '../src/track';
import { replayLength } from '../src/track-deformation';
import { asset, sectionAssets } from '../src/track-deformation-oracle';

const lengths = [replayLength, 1000, 5000] as const;
const u32 = Uint32Array.BYTES_PER_ELEMENT, f32 = Float32Array.BYTES_PER_ELEMENT;

export async function loadWitness() {
  const [rails, spine, tie] = await Promise.all([
    loadProfile(asset(sectionAssets[0])), loadProfile(asset(sectionAssets[1])),
    staticInstanceSnapshot(asset('ModernTie_Med')).then(loadGltf),
  ]);
  if (tie.unsupported.length || !tie.instances.length) throw new Error('Expected a supported ModernTie_Med scene');
  return { profiles: { rails, spine }, instancesPerTie: tie.instances.length };
}

function part(profile: Profile, intervals: number, metres: number) {
  // profileTopology: two wall vertices per directed edge at each station,
  // two triangles per wall quad, separate end vertices for each contour.
  const edges = profile.contours.reduce((sum, contour) => sum + contour.length, 0);
  const capTriangles = profile.contours.reduce((sum, contour) => sum + sectionTriangles(
    contour.map(edge => profile.points[edge.from]),
  ).length, 0);
  const vertices = edges * (2 * (intervals + 1) + 2);
  const indices = 6 * (edges * intervals + capTriangles);
  // track-deformation-gpu.ts: two vec4f inputs and two packed output streams.
  const buffers = { local: vertices * 8 * f32, main: vertices * 4 * u32,
    position: vertices * 2 * u32, indices: indices * u32, quant: d.sizeOf(d.arrayOf(MeshQuant, 1)) };
  const radius = Math.max(...profile.points.map(p => Math.hypot(...p))) + .001;
  const horizontalExtent = metres + 2 * radius;
  return { vertices, indices, buffers, workgroupsX: Math.ceil(vertices / 64),
    horizontalExtent, horizontalStepMm: horizontalExtent * 1000 / 65535,
    horizontalStepVsStock: horizontalExtent / (replayLength + 2 * radius) };
}

export function capacity({ profiles, instancesPerTie }: Awaited<ReturnType<typeof loadWitness>>) {
  return lengths.map(metres => {
    const intervals = Math.ceil(metres * (sweepIntervals / replayLength));
    const frames = intervals + 1;
    const framesBytes = frames * 16 * f32;
    // track.ts ties(): phase zero, excludes the far endpoint.
    const ties = Math.floor((metres - 1e-6) / defaults.spacing) + 1;
    // trackWork counts the occupied transform rows, not all table writes.
    const tiePoseRowBytes = ties * instancesPerTie * 48;
    const parts = { rails: part(profiles.rails, intervals, metres), spine: part(profiles.spine, intervals, metres) };
    const buffers = Object.values(parts).flatMap(p => Object.values(p.buffers));
    return { metres, intervals, frames, ties, parts, framesBytes,
      producerBufferBytes: buffers.reduce((sum, bytes) => sum + bytes, framesBytes),
      trackedDirtyUploadBytes: { frames: framesBytes, tiePoseRows: tiePoseRowBytes,
        mesh: 0, tieMesh: 0, total: framesBytes + tiePoseRowBytes } };
  });
}

type Limits = Pick<GPUSupportedLimits, 'maxBufferSize' | 'maxStorageBufferBindingSize' |
  'maxComputeWorkgroupsPerDimension' | 'maxStorageBuffersPerShaderStage'>;

export function blockers(route: ReturnType<typeof capacity>[number], limits: Limits) {
  const failures: { resource: string; required: number; limit: keyof Limits; granted: number }[] = [];
  const check = (resource: string, required: number, limit: keyof Limits) => {
    if (required > limits[limit]) failures.push({ resource, required, limit, granted: limits[limit] });
  };
  const buffer = (name: string, bytes: number, bound: boolean) => {
    check(name, bytes, 'maxBufferSize');
    if (bound) check(name, bytes, 'maxStorageBufferBindingSize');
  };
  buffer('frames', route.framesBytes, true);
  check('deformation storage bindings', 5, 'maxStorageBuffersPerShaderStage');
  for (const [name, part] of Object.entries(route.parts)) {
    for (const [stream, bytes] of Object.entries(part.buffers))
      buffer(`${name}.${stream}`, bytes, stream !== 'indices'); // indices are set as an index buffer
    check(`${name}.workgroupsX`, part.workgroupsX, 'maxComputeWorkgroupsPerDimension');
  }
  return failures;
}

function reportLimits(limits: GPUSupportedLimits): Limits {
  return {
    maxBufferSize: limits.maxBufferSize,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
    maxStorageBuffersPerShaderStage: limits.maxStorageBuffersPerShaderStage,
  };
}

if (import.meta.main) {
  const routes = capacity(await loadWitness());
  const [{ create, globals }, { classifyAdapter }] = await Promise.all([
    import('webgpu'), import('@dylanebert/shallot/runtime'),
  ]);
  Object.assign(globalThis, globals);
  const dawnOptions = ['backend=vulkan', 'disable-dawn-features=timestamp_quantization'];
  const nativeGpu = create(dawnOptions);
  const powerPreference = 'high-performance';
  const adapter = await nativeGpu.requestAdapter({ powerPreference });
  const verdict = classifyAdapter({ present: !!adapter, info: adapter?.info });
  if (!adapter || verdict.class !== 'real' || adapter.info.isFallbackAdapter || adapter.info.device === 'null-backend')
    throw new Error(`Native Dawn Vulkan requires a hardware adapter: ${verdict.reason ?? verdict.identity}`);
  const requiredFeatures = ['timestamp-query', 'indirect-first-instance'] as const;
  const device = await adapter.requestDevice({ requiredFeatures: [...requiredFeatures] });
  try {
    const granted = reportLimits(device.limits);
    console.log(JSON.stringify({
      policy: { dawnOptions, powerPreference, requiredFeatures, limitOverrides: false },
      hardware: { identity: verdict.identity, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter },
      limits: { adapterAdvertised: reportLimits(adapter.limits), deviceGranted: granted },
      projections: routes.map(route => ({ ...route, deviceLimitBlockers: blockers(route, granted) })),
      scope: [
        'Stock-derived counts; no route resources allocated. Each part dispatches (workgroupsX, 1, 1).',
        'Horizontal step is the nominal conservative length-based 16-bit grid, not measured error or a bound for arbitrary vertical profiles.',
        'Tracked dirty upload models a whole-route edit: shared frame input and projected tie pose rows, not total renderer traffic. Held track writes neither.',
        'Producer buffer bytes exclude native tie asset bytes, renderer/profiler buffers and temporaries, host heap and driver overhead.',
        'Per-buffer limits are not a total memory budget. No throughput or full-route fit is established.',
      ],
    }, null, 2));
  } finally {
    device.destroy();
    await device.lost;
  }
}
