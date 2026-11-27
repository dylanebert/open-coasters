import { expect, test } from 'bun:test';
import { Camera, createApp, DiagnosticsStore, Meshes, MeshInstance } from '@dylanebert/shallot';
import { Orbit, ProfilePlugin } from '@dylanebert/shallot/extras';
import type { MeshHandle } from '@dylanebert/shallot/mesh';
import { attachTexture, captureTexture } from '@dylanebert/shallot/rendering';
import { classifyAdapter } from '@dylanebert/shallot/runtime';
import { create, globals } from 'webgpu';
import { effective, initialConfiguration } from '../src/configuration';
import { readBuffer } from '../src/gpu-probe';
import { Live, liveScene } from '../src/live';
import { Scene } from '../src/scene';

const backend = 'vulkan', width = 1280, height = 800;
const warmup = 8, samples = 24, dt = 1 / 64;
const passes = ['mesh:preprocess', 'standard:cascadeshadow', 'standard:prepass', 'standard:color'];
const gpuPath = (pass: string) => `render/${pass}/elapsed_gpu`;

// Keep Dawn alive through device teardown, and do not quantize short pass spans.
const nativeGpu = create([`backend=${backend}`, 'disable-dawn-features=timestamp_quantization']);

function percentiles(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  const at = (p: number) => ordered[Math.ceil(p * ordered.length) - 1];
  return { p50: at(.50), p95: at(.95), p99: at(.99) };
}

test('stock single-spine curve submits visible track and yields a complete static timing window', async () => {
  Object.assign(globalThis, globals);
  const adapter = await nativeGpu.requestAdapter({ powerPreference: 'high-performance' });
  const verdict = classifyAdapter({ present: !!adapter, info: adapter?.info });
  if (!adapter || verdict.class !== 'real' || adapter.info.device === 'null-backend')
    throw new Error(`Native Dawn ${backend} requires a hardware adapter: ${verdict.reason ?? verdict.identity}`);
  const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query', 'indirect-first-instance'] });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  const previousGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');
  try {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: nativeGpu });
    const selection = effective({
      ...initialConfiguration, selected: 'track',
      values: { ...initialConfiguration.values, track: { path: 'curve', secondSpine: false } },
    });
    const live = liveScene(selection, name => new URL(`../public/assets/${name}.gltf`, import.meta.url), () => width / height);
    app = await createApp({ plugins: [ProfilePlugin, live.plugin], adapter, device });
    const { world } = app;
    const { camera } = world.resource(Scene);
    attachTexture(world, camera, { width, height });
    const profile = world.resource(DiagnosticsStore);
    expect(profile.get('render/timestamp_query')?.value()).toBe(1);

    const frame = async () => {
      const start = performance.now();
      world.step(dt);
      const cpu = performance.now() - start;
      const fence = world.frameFence;
      if (!fence) throw new Error('No frame submission fence');
      await fence;
      return { cpu, completion: performance.now() - start };
    };
    for (let i = 0; i < warmup; i++) await frame();
    const clock = profile.get('frame_time')!;
    const first = clock.measurement()!.time + dt;
    const last = first + (samples - 1) * dt;
    const cpu: number[] = [], completion: number[] = [], commands: number[] = [];
    const colorDraws = profile.get('render/standard:color/indirect')!;
    for (let i = 0; i < samples; i++) {
      const before = colorDraws.historyLength;
      const result = await frame();
      expect(colorDraws.historyLength).toBe(before + 1);
      const count = colorDraws.value()!;
      expect(count).toBeGreaterThan(0);
      commands.push(count);
      cpu.push(result.cpu);
      completion.push(result.completion);
    }

    // Resolve is issued at the next step and drained only on a later step. Keep
    // drain frames out of the window by selecting on the profiler's exact frame clock.
    for (let i = 0; i < 8 && passes.some(pass => (profile.get(gpuPath(pass))?.measurement()?.time ?? -1) < last); i++)
      await frame();
    expect(profile.get('render/gpu_unsampled_frames')?.value()).toBe(0);
    const passTimes = Object.fromEntries(passes.map(pass => {
      const diagnostic = profile.get(gpuPath(pass));
      if (!diagnostic) throw new Error(`Missing GPU timestamps: ${pass}`);
      const window = [...diagnostic.measurements()].filter(m => m.time >= first && m.time <= last);
      expect(window.map(m => m.time), pass).toEqual(Array.from({ length: samples }, (_, i) => first + i * dt));
      const invalid = window.filter(m => !Number.isFinite(m.value) || m.value <= 0);
      expect(invalid, pass).toEqual([]);
      return [pass, percentiles(window.map(m => m.value))];
    }));
    expect([...cpu, ...completion].every(ms => Number.isFinite(ms) && ms > 0)).toBe(true);

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
    let image = await capture();
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

    const orbit = world.storage(Orbit);
    console.log('static track timing (ms, nearest-rank)', {
      backend, adapter: verdict.identity, fallback: adapter.info.isFallbackAdapter, timestampQuery: true,
      target: [width, height], scene: { example: selection.example, ...selection.parameters },
      camera: { yaw: orbit.yaw.get(camera), pitch: orbit.pitch.get(camera), distance: orbit.distance.get(camera),
        pan: [...orbit.pan.read(camera, new Float32Array(4)).subarray(0, 3)], verticalFov: world.storage(Camera).fov.get(camera) },
      warmup, samples, colorIndirectCommands: [Math.min(...commands), Math.max(...commands)],
      vertexCount, indexCount, ties: ties.rows.length, visiblePixels,
      cpuStepSubmission: percentiles(cpu), serialSubmittedFrameCompletion: percentiles(completion),
      gpuNamedPassTimestamps: passTimes,
    });
  } finally {
    try { app?.dispose(); } finally {
      device.destroy();
      await device.lost;
      if (previousGpu) Object.defineProperty(navigator, 'gpu', previousGpu);
      else Reflect.deleteProperty(navigator, 'gpu');
    }
  }
}, 15_000);
