import { expect, test } from 'bun:test';
import { profileTopology, sweepIntervals } from '../src/profile-sweep';
import { defaults, ties } from '../src/track';
import { replayFrame, replayLength, restCurvature } from '../src/track-deformation';
import { blockers, capacity, loadWitness } from './long-track-capacity';

const witness = await loadWitness();
const [stock, km, ceiling] = capacity(witness);

// Declared fixture, not a claim about the adapter on the runner.
const limits = { maxBufferSize: 268435456, maxStorageBufferBindingSize: 134217728,
  maxComputeWorkgroupsPerDimension: 65535, maxStorageBuffersPerShaderStage: 8 };

test('stock projection agrees with emitted topology and Modern tie placement', () => {
  expect(stock.intervals).toBe(sweepIntervals);
  for (const name of ['rails', 'spine'] as const) {
    let vertices = 0;
    const stations = new Set<number>();
    const { indices } = profileTopology(witness.profiles[name], 0, station => {
      stations.add(station);
      vertices++;
    });
    expect(stock.parts[name]).toMatchObject({ vertices, indices: indices.length });
    expect(stock.frames).toBe(stations.size);
  }
  expect(witness.instancesPerTie).toBe(1);
  expect(stock.ties).toBe(ties(defaults, replayFrame(restCurvature)).length);
  expect(stock.ties).toBe(20);
  expect(stock.trackedDirtyUploadBytes).toEqual({ frames: 12352, tiePoseRows: 960, mesh: 0, tieMesh: 0, total: 13312 });
  expect(stock.producerBufferBytes).toBe(1488464);
});

test('route counts, packing and precision scale without route geometry', () => {
  expect(km).toMatchObject({ intervals: 15279, frames: 15280, ties: 1539, framesBytes: 977920,
    producerBufferBytes: 117356624, trackedDirtyUploadBytes: { tiePoseRows: 73872, total: 1051792 } });
  expect(ceiling).toMatchObject({ intervals: 76395, frames: 76396, ties: 7693, framesBytes: 4889344,
    producerBufferBytes: 586727504, trackedDirtyUploadBytes: { tiePoseRows: 369264, total: 5258608 },
    parts: {
      rails: { vertices: 4889408, indices: 14668008, workgroupsX: 76397,
        buffers: { local: 156461056, main: 78230528, position: 39115264, indices: 58672032, quant: 48 } },
      spine: { vertices: 3667056, indices: 11001012, workgroupsX: 57298,
        buffers: { local: 117345792, main: 58672896, position: 29336448, indices: 44004048, quant: 48 } },
    },
  });
  for (const route of [km, ceiling]) {
    expect(route.metres / route.intervals).toBeLessThanOrEqual(replayLength / sweepIntervals);
    expect(route.metres / (route.intervals - 1)).toBeGreaterThan(replayLength / sweepIntervals);
    for (const name of ['rails', 'spine'] as const) {
      const part = route.parts[name], base = stock.parts[name];
      expect(part.horizontalExtent - base.horizontalExtent).toBeCloseTo(route.metres - replayLength, 9);
      expect(part.horizontalStepVsStock).toBeCloseTo(part.horizontalStepMm / base.horizontalStepMm, 10);
    }
  }
  expect(stock.parts.rails.horizontalStepMm).toBeCloseTo(.212, 3);
  expect(km.parts.rails.horizontalStepMm).toBeCloseTo(15.28, 2);
  expect(ceiling.parts.rails.horizontalStepMm).toBeCloseTo(76.32, 2);
});

test('checks per-buffer allocations, whole storage bindings and one-dimensional dispatch separately', () => {
  expect(blockers(stock, limits)).toEqual([]);
  expect(blockers(km, limits)).toEqual([]);
  expect(blockers(ceiling, limits)).toEqual([
    { resource: 'rails.local', required: 156461056, limit: 'maxStorageBufferBindingSize', granted: 134217728 },
    { resource: 'rails.workgroupsX', required: 76397, limit: 'maxComputeWorkgroupsPerDimension', granted: 65535 },
  ]);
  expect(blockers(stock, { ...limits, maxBufferSize: 397311, maxStorageBuffersPerShaderStage: 4 })).toEqual([
    { resource: 'deformation storage bindings', required: 5, limit: 'maxStorageBuffersPerShaderStage', granted: 4 },
    { resource: 'rails.local', required: 397312, limit: 'maxBufferSize', granted: 397311 },
  ]);
  expect(blockers(stock, { maxBufferSize: 397312, maxStorageBufferBindingSize: 397312,
    maxStorageBuffersPerShaderStage: 5, maxComputeWorkgroupsPerDimension: 194 })).toEqual([]);
});
