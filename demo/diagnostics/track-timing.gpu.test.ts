import { expect, test } from 'bun:test';
import { Camera, createApp, DiagnosticsStore, Meshes, MeshInstance, type World } from '@dylanebert/shallot';
import { Orbit, ProfilePlugin } from '@dylanebert/shallot/extras';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { classifyAdapter } from '@dylanebert/shallot/runtime';
import { create, globals } from 'webgpu';
import { effective, initialConfiguration } from '../src/configuration';
import { readBuffer, trackWork } from '../src/gpu-probe';
import { Live, liveScene } from '../src/live';
import { Scene } from '../src/scene';
import { bendStart, bendEnd, replayCurvature, restCurvature } from '../src/track-deformation';
import { TrackDeformation } from '../src/track-deformation-gpu';

const backend = 'vulkan', width = 1280, height = 800;
const warmup = 8, samples = 240, dt = 1 / 64;
const passes = ['mesh:preprocess', 'standard:cascadeshadow', 'standard:prepass', 'standard:color'];
const generation = 'track:deform';
const gpuPath = (pass: string) => `render/${pass}/elapsed_gpu`;

// Keep Dawn alive through device teardown, and do not quantize short pass spans.
const nativeGpu = create([`backend=${backend}`, 'disable-dawn-features=timestamp_quantization']);

function percentiles(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  const at = (p: number) => ordered[Math.ceil(p * ordered.length) - 1];
  return { p50: at(.50), p95: at(.95), p99: at(.99) };
}

async function step(world: World) {
  world.step(dt);
  const fence = world.frameFence;
  if (!fence) throw new Error('No frame submission fence');
  await fence;
}

async function warm(world: World) {
  for (let i = 0; i < warmup; i++) await step(world);
}

async function measure(world: World, count: number, pulse?: {
  edit: (i: number) => void;
  verifySubmission: (i: number) => void;
  land: () => Promise<void>;
}) {
  const profile = world.resource(DiagnosticsStore);
  const clock = profile.get('frame_time')!;
  const first = clock.measurement()!.time + dt, last = first + (count - 1) * dt;
  const stamps = Array.from({ length: count }, (_, i) => first + i * dt);
  const passSamples = new Map([...passes, generation].map(pass => [pass, new Map<number, number>()]));
  function collect() {
    for (const [pass, values] of passSamples) {
      const diagnostic = profile.get(gpuPath(pass));
      if (!diagnostic) continue;
      for (const { time, value } of diagnostic.measurements()) {
        if (time >= first && time <= last) values.set(time, value);
      }
    }
  }

  const cpuEdit: number[] = [], cpuStep: number[] = [], serial: number[] = [], commands: number[] = [];
  const colorDraws = profile.get('render/standard:color/indirect')!;
  for (let i = 0; i < count; i++) {
    const before = colorDraws.measurement();
    const start = performance.now();
    if (pulse) pulse.edit(i);
    const stepStart = pulse ? performance.now() : start;
    world.step(dt);
    const submitted = performance.now();
    const fence = world.frameFence;
    if (!fence) throw new Error('No frame submission fence');
    await fence;
    serial.push(performance.now() - start);
    if (pulse) cpuEdit.push(stepStart - start);
    cpuStep.push(submitted - stepStart);
    pulse?.verifySubmission(i);
    expect(clock.measurement()!.time).toBe(stamps[i]);
    expect(colorDraws.measurement()).not.toBe(before);
    const draws = colorDraws.value()!;
    expect(draws).toBeGreaterThan(0);
    commands.push(draws);
    // Copy values, not borrowed ring records; no pause or extra frames in the pulse.
    if ((i + 1) % 80 === 0) collect();
  }
  // Timestamp resolves are issued and delivered on later steps. Do not time those
  // extra steps, or include their profiler rows in the sampled window.
  await pulse?.land();
  await warm(world);
  collect();
  expect(profile.get('render/gpu_unsampled_frames')?.value()).toBe(0);
  const gpuNamedPassTimestamps = Object.fromEntries([...passSamples].map(([pass, values]) => {
    if (pass === generation && !pulse) {
      expect([...values.values()].every(ms => ms === 0)).toBe(true);
      return [pass, { timestampSamples: 0, profilerZeroRows: values.size }];
    }
    expect([...values.keys()], pass).toEqual(stamps);
    expect([...values.values()].every(ms => Number.isFinite(ms) && ms > 0), pass).toBe(true);
    return [pass, { timestampSamples: values.size, ...percentiles([...values.values()]) }];
  }));
  expect([...cpuEdit, ...cpuStep, ...serial].every(ms => Number.isFinite(ms) && ms > 0)).toBe(true);
  return { samples: count, colorIndirectCommands: [Math.min(...commands), Math.max(...commands)],
    cpuEdit: pulse ? percentiles(cpuEdit) : 'no edit invoked', cpuStepSubmission: percentiles(cpuStep),
    serialFrameThroughFence: percentiles(serial), gpuNamedPassTimestamps };
}

async function observeWork(world: World, edit?: () => void) {
  const probe = trackWork(world);
  const { device } = world.gpu;
  const createBuffer = device.createBuffer, createEntity = world.create;
  // Count all native buffer/world entity creations separately from track writes.
  // A profiler/renderer allocation is not evidence of a track allocation.
  const buffersCreated: string[] = [];
  let entitiesCreated = 0;
  device.createBuffer = function(descriptor) {
    buffersCreated.push(descriptor.label ?? '(unlabeled)');
    return createBuffer.call(this, descriptor);
  };
  world.create = function() {
    entitiesCreated++;
    return createEntity.call(this);
  };
  try {
    edit?.();
    await step(world);
    expect(entitiesCreated).toBe(0);
    expect(buffersCreated.filter(label => label.startsWith('track:'))).toEqual([]);
    expect(probe.work).toEqual({ dispatches: edit ? 2 : 0, frameBytes: edit ? 12352 : 0,
      meshBytes: 0, tieMeshBytes: 0, tieBytes: edit ? 960 : 0 });
    return { ...probe.work, buffersCreated, entitiesCreated };
  } finally {
    world.create = createEntity;
    device.createBuffer = createBuffer;
    probe.restore();
  }
}

const selection = effective({
  ...initialConfiguration, selected: 'track',
  values: { ...initialConfiguration.values, track: { path: 'curve', secondSpine: false } },
});

async function withScene<T>(adapter: GPUAdapter, replay: boolean, run: (world: World, live: ReturnType<typeof liveScene>) => Promise<T>) {
  const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query', 'indirect-first-instance'] });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    const live = liveScene(selection, name => new URL(`../public/assets/${name}.gltf`, import.meta.url), () => width / height, replay);
    app = await createApp({ plugins: [ProfilePlugin, live.plugin], adapter, device });
    const { world } = app;
    attachTexture(world, world.resource(Scene).camera, { width, height });
    expect(world.resource(DiagnosticsStore).get('render/timestamp_query')?.value()).toBe(1);
    await warm(world);
    return await run(world, live);
  } finally {
    try { app?.dispose(); } finally {
      device.destroy();
      await device.lost;
    }
  }
}

function cameraPose(world: World) {
  const { camera } = world.resource(Scene), orbit = world.storage(Orbit);
  return { yaw: orbit.yaw.get(camera), pitch: orbit.pitch.get(camera), distance: orbit.distance.get(camera),
    pan: [...orbit.pan.read(camera, new Float32Array(4)).subarray(0, 3)], verticalFov: world.storage(Camera).fov.get(camera) };
}

async function stockVisibility(world: World) {
  const { camera } = world.resource(Scene);
  const frame = () => step(world);
  // Inspect renderer inputs and prove visible contribution only after timing.
  const state = world.resource(Live), meshes = world.resource(Meshes), instances = world.storage(MeshInstance);
  const ties = state.roles.get('ModernTie_Med')!;
  expect([...state.roles.keys()]).toEqual(['ModernTie_Med']);
  expect(ties.rows).toHaveLength(20);
  const tieEntities = ties.rows.flatMap(row => row.entities);
  expect(new Set(tieEntities).size).toBe(tieEntities.length);
  const tieAsset = state.assets.get('ModernTie_Med')!;
  expect(tieAsset.primitives.length).toBeGreaterThan(0);
  for (const row of ties.rows) {
    expect(row.entities.every(e => world.has(e, MeshInstance))).toBe(true);
    expect(row.entities.map(e => instances.mesh.get(e))).toEqual(tieAsset.primitives.map(p => tieAsset.handles[p.mesh]));
  }
  expect(state.trackEntities).toHaveLength(2);
  const track = state.trackEntities.map(e => meshes.get(instances.mesh.get(e) as MeshHandle)!);
  expect(track.map(mesh => mesh.name)).toEqual(['Track rails', 'Track spine']);
  const indexCount = track.reduce((n, mesh) => n + mesh.indexCount, 0);
  expect(indexCount).toBe(64_812);
  let vertexCount = 0;
  for (const mesh of track) {
    const indices = new Uint32Array(await readBuffer(world, mesh.indices), mesh.indexBase * 4, mesh.indexCount);
    vertexCount += new Set(indices).size;
  }
  expect(vertexCount).toBe(21_728);
  expect(state.tracks.get('curve:true:false')!.vertices.length / 8).toBe(vertexCount);

  const capture = async () => (await captureTexture(world, camera)).rgba;
  const stock = await capture();
  let image = stock;
  await frame();
  expect((await capture()).every((byte, i) => byte === image[i])).toBe(true);
  const visiblePixels: Record<string, number> = {};
  // Remove each group in turn, keeping the camera, lights and grid. An
  // indirect-command tally alone cannot tell if its GPU instance count is zero.
  for (const [name, entities] of [
    ['ties', tieEntities], ['rails', [state.trackEntities[0]]], ['spine', [state.trackEntities[1]]],
  ] as const) {
    for (const entity of entities) world.remove(entity, MeshInstance);
    await frame();
    const without = await capture();
    let changed = 0;
    for (let i = 0; i < image.length; i += 4)
      if (image[i] !== without[i] || image[i + 1] !== without[i + 1] || image[i + 2] !== without[i + 2]) changed++;
    expect(changed).toBeGreaterThan(0);
    visiblePixels[name] = changed;
    image = without;
  }

  return { stock, vertexCount, indexCount, ties: ties.rows.length, visiblePixels };
}

type Rgba = Awaited<ReturnType<typeof captureTexture>>['rgba'];
function changedPixels(a: Rgba, b: Rgba, tolerance: number) {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i+1] - b[i+1]), Math.abs(a[i+2] - b[i+2])) > tolerance) changed++;
  return changed;
}

async function hardwareAdapter() {
  const adapter = await nativeGpu.requestAdapter({ powerPreference: 'high-performance' });
  const verdict = classifyAdapter({ present: !!adapter, info: adapter?.info });
  if (!adapter || verdict.class !== 'real' || adapter.info.isFallbackAdapter || adapter.info.device === 'null-backend')
    throw new Error(`Native Dawn ${backend} requires a hardware adapter: ${verdict.reason ?? verdict.identity}`);
  return { adapter, identity: verdict.identity };
}

test('stock CPU still and retained GPU hold, single pulse and final hold on hardware', async () => {
  Object.assign(globalThis, globals);
  const { adapter, identity } = await hardwareAdapter();
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  try {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: nativeGpu });
    const { stock, ...cpuStill } = await withScene(adapter, false, async world => {
      const timing = await measure(world, samples);
      const work = await observeWork(world);
      return { timing, work, camera: cameraPose(world), ...await stockVisibility(world) };
    });
    const replayHardware = await hardwareAdapter();
    expect(replayHardware.identity).toBe(identity);
    const gpu = await withScene(replayHardware.adapter, true, async (world, live) => {
      const retained = world.resource(TrackDeformation).retained!;
      const scene = world.resource(Scene);
      const capture = async () => (await captureTexture(world, scene.camera)).rgba;
      expect(cameraPose(world)).toEqual(cpuStill.camera);
      expect(retained.submitted).toBe(restCurvature);
      const entities = scene.instances.map(group => [...group]);
      const meshes = [...world.resource(Meshes).entries()];
      const held = await measure(world, samples);
      const heldWork = await observeWork(world);
      const heldImage = await capture();
      const restPixelsFromStock = changedPixels(heldImage, stock, 8);
      expect(restPixelsFromStock).toBeLessThan(width * height * .0025);

      // Sample the open pulse on a skewed grid (one virtual dt apart). A
      // symmetric grid would measure the same curvature on ascent and descent.
      const movingCount = (bendEnd - bendStart) / dt;
      const times = Array.from({ length: movingCount }, (_, i) => bendStart + (i + .25) * dt);
      const curvatures = times.map(replayCurvature);
      expect(new Set(curvatures).size).toBe(movingCount);
      expect(curvatures.every(k => k > restCurvature)).toBe(true);
      let finalUpdate!: Awaited<ReturnType<typeof observeWork>>;
      const moving = await measure(world, movingCount, {
        edit: i => live.replayAt!(times[i]),
        verifySubmission: i => expect(retained.submitted, `moving frame ${i}`).toBe(curvatures[i]),
        land: async () => {
          finalUpdate = await observeWork(world, () => live.replayAt!(bendEnd));
          expect(retained.submitted).toBe(restCurvature);
        },
      });
      const finalHeld = await measure(world, samples);
      const finalHeldWork = await observeWork(world);
      expect(retained.submitted).toBe(restCurvature);
      expect(scene.instances).toEqual(entities);
      expect([...world.resource(Meshes).entries()]).toEqual(meshes);
      expect((await capture()).every((byte, i) => byte === heldImage[i])).toBe(true);
      return { held, heldWork, moving, finalUpdate, finalHeld, finalHeldWork, restPixelsFromStock };
    });
    console.log('track timing (ms, nearest-rank)', Bun.inspect({
      backend, adapter: identity, fallback: adapter.info.isFallbackAdapter, timestampQuery: true,
      target: [width, height], scene: { example: selection.example, ...selection.parameters },
      warmup, dt, pulse: { bendStart, bendEnd, sampleOffsetInSteps: .25 }, cpuStill, ...gpu,
    }, { depth: Infinity }));
  } finally {
    if (previousGpu) Object.defineProperty(navigator, 'gpu', previousGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
  }
}, 25_000);
