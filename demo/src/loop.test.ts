import { expect, test } from "bun:test";
import path from "./loop-path.json";
import state from "../fixtures/loop-state.json";
import { defaults, frame, length, rotation, ties } from "./track";

const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const norm = (a: number[]) => Math.hypot(...a);
// Independently recorded crown source X/Z; no production placement import.
const world = (p: number[]) => [-2.2646225098 - p[1], 1.5 + p[2], -11.6974685775 - p[3]];
// Independent source quaternion matrix columns, rigidly placed in world space.
const axes = (p: number[]) => {
  const [x, y, z, w] = p.slice(4);
  return {
    across: [
      1 - 2 * y * y - 2 * z * z,
      -(2 * x * y + 2 * z * w),
      2 * x * z - 2 * y * w,
    ],
    up: [
      -(2 * x * y - 2 * z * w),
      1 - 2 * x * x - 2 * z * z,
      -(2 * y * z + 2 * x * w),
    ],
    tangent: [
      2 * x * z + 2 * y * w,
      -(2 * y * z - 2 * x * w),
      1 - 2 * x * x - 2 * y * y,
    ],
  };
};
const velocity = path.map((p, i) =>
  axes(p).tangent.map((x) => x * state.samples[i][1]),
);
// A second reconstruction obtains tangents from positions, not pose rotations.
const geometricTangents = path.map((_, i) => {
  if (i === 0 || i === path.length - 1) return [0, 0, 0];
  const chord = sub(world(path[i + 1]), world(path[i - 1]));
  return chord.map((x) => x / norm(chord));
});

// Spherical interpolation is an independent oracle for the production nlerp.
// Its difference is bounded cubically in the small recorded quaternion angle.
const sphericalAxes = (a: number[], b: number[], t: number) => {
  const qa = a.slice(4).map((x) => x / norm(a.slice(4)));
  const sign = dot(qa, b.slice(4)) < 0 ? -1 : 1;
  const qb = b.slice(4).map((x) => (sign * x) / norm(b.slice(4)));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(qa, qb))));
  const weights =
    theta < 1e-8
      ? [1 - t, t]
      : [
          Math.sin((1 - t) * theta) / Math.sin(theta),
          Math.sin(t * theta) / Math.sin(theta),
        ];
  const q = qa.map((x, i) => weights[0] * x + weights[1] * qb[i]);
  return {
    axes: axes([0, 0, 0, 0, ...q]),
    tolerance: Math.max(1e-8, theta ** 3),
  };
};
const checkAxes = (f: ReturnType<typeof frame>, chord: number[]) => {
  for (const axis of [f.x, f.y, f.z]) expect(norm(axis)).toBeCloseTo(1, 8);
  expect(dot(f.x, f.y)).toBeCloseTo(0, 8);
  expect(dot(f.x, f.z)).toBeCloseTo(0, 8);
  expect(dot(f.y, f.z)).toBeCloseTo(0, 8);
  const cross = [
    f.x[1] * f.y[2] - f.x[2] * f.y[1],
    f.x[2] * f.y[0] - f.x[0] * f.y[2],
    f.x[0] * f.y[1] - f.x[1] * f.y[0],
  ];
  expect(dot(cross, f.z)).toBeCloseTo(1, 8);
  expect(norm(rotation(f))).toBeCloseTo(1, 8);
  expect(dot(f.z, chord) / norm(chord)).toBeGreaterThan(0.9998);
};

test("loop: explicit 100 km/h entry", () => {
  expect(state.initial.speed).toBe(100 / 3.6);
  expect(state.samples[0][1]).toBeCloseTo(100 / 3.6, 9);
  expect(state.constants).toEqual({ g: 9.81, heartToCom: 0, mass: 500, friction: 0, drag: 0 });
  expect(state.rate).toBe(2000);
  expect(state.recordedStride).toBe(10);
  expect(state.rollAmplitude).toBe(0.08);
  expect(state.supportWidth).toBe(2*Math.PI);
  expect(state.supportStart).toBe(0);
  expect(state.normalGuide).toEqual({ kind: 'early-C1-Hermite-to-cosine', shoulder: 4, crown: 0, holdEnd: Math.PI/4, cosineStart: 5*Math.PI/12 });
  for (let i=0;i<path.length-1;i++) {
    const f=axes(path[i]).tangent, theta=Math.atan2(f[1],f[2]);
    expect(state.samples[i][2]).toBeGreaterThanOrEqual(0);
    expect(state.samples[i][2]).toBeLessThanOrEqual(4);
    // Detailed independent selected-guide reconstruction lives in loop-hold.test.ts.
    expect(Number.isFinite(theta)).toBe(true);
    expect(state.samples[i][3]).toBe(0);
  }
});

test("loop: highest recorded centerline point is at world X zero", () => {
  const crown = path.reduce((highest, row) => row[2] > highest[2] ? row : highest);
  expect(frame("loop", crown[0]).p[0]).toBeCloseTo(0, 10);
});

test("recorded geometry: metric arc stations, rigid landmarks, proper continuous tangent frames", () => {
  expect(path.length).toBe(state.samples.length);
  expect(length("loop")).toBeCloseTo(108.5071019065, 9);
  expect(frame("loop", 0).p).toEqual([-2.2646225098, 1.5, -11.6974685775]);
  const apex = path.reduce(
    (best, p, i) => (p[2] > path[best][2] ? i : best),
    0,
  );
  expect(world(path[apex])[1]).toBeCloseTo(36.1375274566, 9);
  expect(norm(sub(world(path[0]), world(path.at(-1)!)))).toBeGreaterThan(8);
  let previous = frame("loop", 0);
  for (let i = 1; i < path.length; i++) {
    const p = path[i],
      a = path[i - 1],
      f = frame("loop", p[0]);
    expect(norm(sub(f.p, world(p)))).toBeLessThan(1e-8);
    expect(norm(sub(f.y, axes(p).up))).toBeLessThan(1e-8);
    const chord = sub(world(p), world(a));
    expect(norm(chord)).toBeCloseTo(p[0] - a[0], 4);
    expect(dot(f.z, chord) / norm(chord)).toBeGreaterThan(0.9998);
    checkAxes(f, chord);
    for (const t of [0.2, 0.5, 0.8]) {
      const between = frame("loop", a[0] + t * (p[0] - a[0]));
      checkAxes(between, chord);
      const oracle = sphericalAxes(a, p, t);
      for (const [actual, expected] of [
        [between.x, oracle.axes.across],
        [between.y, oracle.axes.up],
        [between.z, oracle.axes.tangent],
      ])
        expect(norm(sub(actual, expected))).toBeLessThan(oracle.tolerance);
    }
    expect(dot(previous.y, f.y)).toBeGreaterThan(0.999);
    const mid = frame("loop", (p[0] + a[0]) / 2);
    expect(
      norm(
        sub(
          mid.p,
          world(p).map((x, j) => (x + world(a)[j]) / 2),
        ),
      ),
    ).toBeLessThan(1e-8);
    previous = f;
  }
  for (const spacing of [0.3, 0.7, 1.5]) {
    const stations = ties({ ...defaults, configuration: "loop", spacing });
    expect(stations.length).toBe(Math.ceil(108.5071019065 / spacing));
    for (const [i, f] of stations.entries()) {
      const s = i * spacing;
      expect(f.s).toBe(s);
      const right = path.findIndex((p) => p[0] > s);
      const a = path[right - 1],
        b = path[right],
        t = (s - a[0]) / (b[0] - a[0]);
      const expected = world(a).map((x, j) => x + t * (world(b)[j] - x));
      expect(norm(sub(f.p, expected))).toBeLessThan(1e-8);
      const oracle = sphericalAxes(a, b, t);
      for (const [actual, expectedAxis] of [
        [f.x, oracle.axes.across],
        [f.y, oracle.axes.up],
        [f.z, oracle.axes.tangent],
      ])
        expect(norm(sub(actual, expectedAxis))).toBeLessThan(oracle.tolerance);
      checkAxes(f, sub(world(b), world(a)));
    }
  }
});

test("independent recorded velocity differences and geometry/state recover authored forces and energy", () => {
  let forceError = 0,
    geometryError = 0,
    energyError = 0,
    lateralError = 0,
    geometricLateralError = 0;
  const energy = state.samples[0][1] ** 2 / 2;
  const normals: number[] = [];
  for (let i = 1; i < path.length - 1; i++) {
    const before = state.samples[i][0] - state.samples[i - 1][0];
    const after = state.samples[i + 1][0] - state.samples[i][0];
    // Three-point derivative at the interior timestamp, including the uneven
    // final recording interval rather than treating it as a centered secant.
    const acceleration = velocity[i].map((v, k) =>
      -after / (before * (before + after)) * velocity[i - 1][k] +
      (after - before) / (before * after) * v +
      before / (after * (before + after)) * velocity[i + 1][k],
    );
    acceleration[1] += 9.81;
    const up = axes(path[i]).up;
    const normal = dot(acceleration, up) / 9.81;
    // Demo across reverses source right: reverse the sign back for authored lateral.
    lateralError = Math.max(
      lateralError,
      Math.abs(
        -dot(acceleration, axes(path[i]).across) / 9.81 - state.samples[i][3],
      ),
    );
    normals[i] = normal;
    forceError = Math.max(forceError, Math.abs(normal - state.samples[i][2]));
    // Exclude the end stencils and final shortened recording interval.
    if (i >= 2 && i < path.length - 3) {
      const ds = path[i + 1][0] - path[i - 1][0];
      const curvature = sub(geometricTangents[i + 1], geometricTangents[i - 1])
        .map((x) => x / ds);
      const geometric =
        (state.samples[i][1] ** 2 * dot(curvature, up)) / 9.81 + up[1];
      geometryError = Math.max(
        geometryError, Math.abs(geometric - state.samples[i][2]),
      );
      const across = axes(path[i]).across;
      geometricLateralError = Math.max(
        geometricLateralError,
        Math.abs(
          -((state.samples[i][1] ** 2 * dot(curvature, across)) / 9.81 + across[1])
            - state.samples[i][3],
        ),
      );
    }
    energyError = Math.max(
      energyError,
      Math.abs(state.samples[i][1] ** 2 / 2 + 9.81 * path[i][2] - energy),
    );
  }
  console.info({
    forceError,
    geometryError,
    lateralError,
    geometricLateralError,
    energyError,
  });
  expect(lateralError).toBeLessThan(0.003);
  expect(geometricLateralError).toBeLessThan(0.003);
  expect(forceError).toBeLessThan(0.003);
  expect(geometryError).toBeLessThan(0.003);
  expect(energyError).toBeLessThan(1e-7);
  const last = path.length - 1;
  expect(Math.abs(state.samples[last][1] ** 2 / 2 + 9.81 * path[last][2] - energy)).toBeLessThan(1e-7);
  const apex = path.reduce(
    (best, p, i) => (p[2] > path[best][2] ? i : best),
    0,
  );
  const minimumHeight = (lo: number, hi: number) => {
    let best = lo;
    for (let i = lo; i < hi; i++) if (path[i][2] < path[best][2]) best = i;
    return best;
  };
  const entry = minimumHeight(1, Math.floor(path.length / 3));
  const exit = minimumHeight(
    Math.floor((path.length * 2) / 3),
    path.length - 1,
  );
  expect(normals[entry]).toBeGreaterThan(3.9);
  expect(Math.abs(normals[apex])).toBeLessThan(0.01);
  expect(normals[exit]).toBeGreaterThan(3.9);
  expect(state.samples[entry][1]).toBeGreaterThan(15.4);
  expect(state.samples[apex][1]).toBeLessThan(15.57);
  expect(state.samples[exit][1]).toBeGreaterThan(15.4);
  expect(state.samples[apex][1]).toBeCloseTo(9.5925309264, 6);
});

const scale = (a: number[], k: number) => a.map((x) => x * k);

test("selected D spatial loop: independently measured chord curvature and plane departure", () => {
  const tangent = (i: number) => {
    const d = sub(world(path[i + 1]), world(path[i - 1]));
    return scale(d, 1 / norm(d));
  };
  const curvature = (i: number) =>
    norm(sub(tangent(i + 1), tangent(i - 1))) /
    (path[i + 1][0] - path[i - 1][0]);
  const crown = path.reduce((best, p, i) => p[2] > path[best][2] ? i : best, 0);
  const curvatures = path.slice(2, -2).map((_, i) => curvature(i + 2));
  // Same centered position-only stencil over ALL records of base 5841663:
  // minimum .09886412384832682, maximum .36294102465411104 per meter.
  expect(Math.max(...curvatures)).toBeLessThan(0.36294102465411104);
  expect(Math.min(...curvatures)).toBeCloseTo(0.03434970964411073, 9);
  expect(Math.max(...curvatures)).toBeCloseTo(0.10661124226653172, 9);
  // Selected D has a narrow crown and broader lower body; not circular.
  expect(curvature(crown) / Math.min(...curvatures)).toBeCloseTo(3.1037014103206624, 9);
  const a = sub(world(path[crown]), world(path[0])),
    b = sub(world(path.at(-1)!), world(path[0]));
  const n = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const departure = Math.max(
    ...path.map(
      (p) => Math.abs(dot(sub(world(p), world(path[0])), n)) / norm(n),
    ),
  );
  expect(departure).toBeCloseTo(4.122772470500991,9);
});

test("localized level terminal: complete frames, fixed-rate records, whole-tick negative control", () => {
  const aligned = (p: number[]) => {
    const f = axes(p);
    return Math.max(norm(sub(f.across, [1, 0, 0])),
      norm(sub(f.up, [0, 1, 0])), norm(sub(f.tangent, [0, 0, 1])));
  };
  expect(aligned(path[0])).toBeLessThan(1e-7);
  expect(aligned(path.at(-1)!)).toBeLessThan(1e-7);
  expect(Math.abs(axes(path.at(-1)!).tangent[1])).toBeLessThan(1e-7);
  expect(state.terminalDuration).toBeGreaterThan(0);
  expect(state.terminalDuration).toBeLessThan(1 / state.rate);
  expect(state.endTime).toBeCloseTo(state.wholeTicks / state.rate + state.terminalDuration, 12);
  for (let i = 0; i < state.samples.length - 1; i++)
    expect(state.samples[i][0]).toBeCloseTo(i * state.recordedStride / state.rate, 10);
  expect(state.samples.at(-1)![0]).toBeCloseTo(state.endTime, 9);
  // Same last physical input advanced through a WHOLE tick instead of the root.
  const wrong = [0, ...state.wholeTickTerminal.position, ...state.wholeTickTerminal.rotation];
  expect(Math.abs(axes(wrong).tangent[1])).toBeGreaterThan(1e-7);
});

test("supported smooth roll makes a modest signed paired bank and returns upright", () => {
  const crown = path.reduce((b, p, i) => p[2] > path[b][2] ? i : b, 0);
  const bank = path.map(p => {
    const { up, tangent: f } = axes(p);
    // The vertical-plane normal is continuous through the inverted crown.
    return Math.atan2(-up[0], (up[1]*f[2] - up[2]*f[1]) / Math.hypot(f[1], f[2]));
  });
  const phases = path.map(p => {
    const f = axes(p).tangent;
    const theta = Math.atan2(f[1], f[2]);
    return theta < 0 ? theta + 2 * Math.PI : theta;
  });
  // The rounded exit is the same phase as the start; unwrap it explicitly.
  phases[phases.length - 1] = 2 * Math.PI;
  for (let i = 1; i < phases.length; i++) expect(phases[i]).toBeGreaterThan(phases[i - 1]);
  const mirrorErrors = (b: number[]) => phases.map((theta, i) => {
    const reflected = 2 * Math.PI - theta;
    let j = 1;
    while (j < phases.length - 1 && phases[j] < reflected) j++;
    const t = (reflected - phases[j - 1]) / (phases[j] - phases[j - 1]);
    return b[i] + b[j - 1] + t * (b[j] - b[j - 1]);
  });
  const errors = mirrorErrors(bank);
  console.info({ bankMirrorMax: Math.max(...errors.map(Math.abs)),
    bankMirrorRms: Math.sqrt(dot(errors, errors) / errors.length) });
  const paired = (b: number[]) => {
    const entry = Math.min(...b.slice(0, crown)), exit = Math.max(...b.slice(crown));
    return Math.abs(entry - (-4.4242293343736*Math.PI/180)) < 1e-8 &&
      Math.abs(exit - 4.420154459414641*Math.PI/180) < 1e-8 && Math.abs(entry + exit) < .002 &&
      Math.max(...b.map(Math.abs)) < .3 && Math.abs(b[0]) < 1e-7 && Math.abs(b.at(-1)!) < 1e-7 &&
      // .002 rad (0.115 degrees) retains the original mirror tolerance. This bounds
      // approximate phase mirroring over BOTH complete recorded lobes, not
      // exact symmetry of the causal, discretely stepped source policies.
      Math.max(...mirrorErrors(b).map(Math.abs)) < .002;
  };
  expect(paired(bank)).toBe(true);
  // Neither opposite handedness nor a single lobe supports the signed-S claim.
  expect(paired(bank.map(b => -b))).toBe(false);
  expect(paired(bank.map((b, i) => i < crown ? b : 0))).toBe(false);
  const rolls = state.samples.map(s => s[4]);
  expect(rolls[0]).toBe(0);
  expect(rolls.at(-1)).toBe(0);
  expect(Math.max(...rolls.map(Math.abs))).toBeLessThan(.6);
  for (let i = 1; i < rolls.length; i++)
    expect(Math.abs((rolls[i] - rolls[i-1]) / (state.samples[i][0] - state.samples[i-1][0]))).toBeLessThan(1.6);
});
