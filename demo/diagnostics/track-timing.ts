import { expect } from 'bun:test';
import { DiagnosticsStore, type World } from '@dylanebert/shallot';

export const warmup = 8, dt = 1 / 64;
const passes = ['mesh:preprocess', 'standard:cascadeshadow', 'standard:prepass', 'standard:color'];
const generation = 'track:deform';
const gpuPath = (pass: string) => `render/${pass}/elapsed_gpu`;

function percentiles(values: number[]) {
  const ordered = values.toSorted((a, b) => a - b);
  const at = (p: number) => ordered[Math.ceil(p * ordered.length) - 1];
  return { p50: at(.50), p95: at(.95), p99: at(.99) };
}

export async function step(world: World) {
  world.step(dt);
  const fence = world.frameFence;
  if (!fence) throw new Error('No frame submission fence');
  await fence;
}

export async function warm(world: World) {
  for (let i = 0; i < warmup; i++) await step(world);
}

export async function measure(world: World, count: number, pulse?: {
  edit: (i: number) => void;
  verifySubmission: (i: number) => void;
  land?: () => Promise<unknown>;
}, camera?: (i: number) => void) {
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
    camera?.(i);
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
  await pulse?.land?.();
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
