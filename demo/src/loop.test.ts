import { expect, test } from "bun:test";
import path from "./loop-path.json";
import state from "../fixtures/loop-state.json";
import { defaults, frame, generate, length, rotation, ties } from "./track";

const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const norm = (a: number[]) => Math.hypot(...a);
const world = (p: number[]) => [2.2 - p[1], 1.5 + p[2], -4.3 - p[3]];
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

test("recorded geometry: metric arc stations, rigid landmarks, proper continuous tangent frames", () => {
  expect(path.length).toBe(state.samples.length);
  expect(length("loop")).toBeCloseTo(34.6520402557, 9);
  expect(frame("loop", 0).p).toEqual([2.2, 1.5, -4.3]);
  const apex = path.reduce(
    (best, p, i) => (p[2] > path[best][2] ? i : best),
    0,
  );
  expect(world(path[apex])[1]).toBeGreaterThan(12);
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
    expect(stations.length).toBe(Math.ceil(34.6520402557 / spacing));
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
    const dt = state.samples[i + 1][0] - state.samples[i - 1][0];
    const acceleration = sub(velocity[i + 1], velocity[i - 1]).map(
      (x) => x / dt,
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
  expect(state.samples[apex][1]).toBeLessThan(5.21);
  expect(state.samples[exit][1]).toBeGreaterThan(15.4);
  expect(Math.max(...state.samples.map((s) => Math.abs(s[4])))).toBeGreaterThan(
    0.6,
  );
});

const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const scale = (a: number[], k: number) => a.map((x) => x * k);

test("all supported swept profiles fit an independently certified embedded regular tube", () => {
  // Reference curve: C1 cubic Hermite through recorded centers, with recorded
  // unit tangents. Bounds below use Bezier convex hulls, NOT a sampling claim.
  // Tube means different track branches cannot collide; rail/tie/spine joints
  // within a branch intentionally overlap and are not claimed disjoint.
  const cells: { lo: number; hi: number; center: number[]; radius: number }[] =
    [];
  const beziers: number[][][] = [];
  let maxAcceleration = 0,
    maxSpeed = 1,
    curvature = 0,
    sourceDeviation = 0,
    angularRate = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p = world(path[i]),
      q = world(path[i + 1]),
      h = path[i + 1][0] - path[i][0];
    const t = axes(path[i]).tangent,
      u = axes(path[i + 1]).tangent;
    const b = add(p, scale(t, h / 3)),
      c = sub(q, scale(u, h / 3));
    const d = scale(sub(c, b), 3 / h);
    const vmax = Math.max(norm(t), norm(d), norm(u));
    const vmin = norm(t) - Math.max(norm(sub(d, t)), norm(sub(u, t)));
    expect(vmin).toBeGreaterThan(0);
    const acceleration = (2 * Math.max(norm(sub(d, t)), norm(sub(u, d)))) / h;
    maxAcceleration = Math.max(maxAcceleration, acceleration);
    maxSpeed = Math.max(maxSpeed, vmax);
    curvature = Math.max(curvature, acceleration / vmin ** 2);
    sourceDeviation = Math.max(
      sourceDeviation,
      norm(sub(b, add(scale(p, 2 / 3), scale(q, 1 / 3)))),
      norm(sub(c, add(scale(p, 1 / 3), scale(q, 2 / 3)))),
    );
    beziers.push([p, b, c, q]);
    const middle = scale(add(add(p, q), scale(add(b, c), 3)), 1 / 8);
    cells.push({
      lo: path[i][0],
      hi: path[i + 1][0],
      center: middle,
      radius: (vmax * h) / 2,
    });
    const cosine = Math.min(
      1,
      Math.abs(dot(path[i].slice(4), path[i + 1].slice(4))) /
        (norm(path[i].slice(4)) * norm(path[i + 1].slice(4))),
    );
    // Exact maximum angular speed for shortest-hemisphere normalized lerp.
    angularRate = Math.max(
      angularRate,
      (4 * Math.tan(Math.acos(cosine) / 2)) / h + 1e-8,
    );
  }
  const total = path.at(-1)![0],
    extension = 0.6;
  const first = world(path[0]),
    last = world(path.at(-1)!);
  const startT = axes(path[0]).tangent,
    endT = axes(path.at(-1)!).tangent;
  for (let i = 0; i < 12; i++) {
    const lo = (i * extension) / 12,
      hi = ((i + 1) * extension) / 12;
    cells.unshift({
      lo: -hi,
      hi: -lo,
      center: sub(first, scale(startT, (lo + hi) / 2)),
      radius: (hi - lo) / 2,
    });
    cells.push({
      lo: total + lo,
      hi: total + hi,
      center: add(last, scale(endT, (lo + hi) / 2)),
      radius: (hi - lo) / 2,
    });
  }
  // Every actual triangle is a convex combination of its corner vertices.
  // Max supported spine/rail radii; variable AND fixed source tie box corners.
  const spineRadius = Math.hypot(0.6 / 2, 0.22 + 0.8);
  const railRadius = 1.6 / 2 + 0.065;
  const variableTieRadius = Math.hypot(1.6 / 2 + 0.15, 0.055, 0.055);
  const fixedTieRadius = Math.hypot(0.6, 0.05, 0.050001);
  const meshStep = total / 192;
  const roundoff = 1e-5; // Includes Float32 mesh coordinates and rounded JSON quaternions.
  const envelopeRadius =
    roundoff +
    Math.max(
      Math.max(spineRadius, railRadius) +
        sourceDeviation +
        (maxAcceleration * meshStep ** 2) / 8,
      Math.max(variableTieRadius, fixedTieRadius) + sourceDeviation,
    );
  const radius = 1.08;
  expect(envelopeRadius).toBeLessThan(radius);
  const reference = (s: number) => {
    let i = 0;
    while (i < path.length - 2 && path[i + 1][0] < s) i++;
    const t = (s - path[i][0]) / (path[i + 1][0] - path[i][0]);
    const weights = [
      (1 - t) ** 3,
      3 * t * (1 - t) ** 2,
      3 * t * t * (1 - t),
      t ** 3,
    ];
    return [0, 1, 2].map((k) =>
      beziers[i].reduce((sum, p, j) => sum + p[k] * weights[j], 0),
    );
  };
  // Audit every actual emitted corner, not only a centerline or end rings.
  // Parameter endpoints span all linear profile dimensions; ties at both
  // spacing limits are audited, while the certificate above covers ALL stations.
  for (const separation of [0.6, 1.6])
    for (const width of [0.15, 0.6])
      for (const depth of [0.15, 0.8])
        for (const spacing of [0.3, 1.5]) {
          const { vertices: v } = generate({
            ...defaults,
            configuration: "loop",
            separation,
            width,
            depth,
            spacing,
          });
          let offset = 0;
          for (const sides of [12, 12, 4]) {
            for (let segment = 0; segment < 192; segment++) {
              const centers = [
                reference(segment * meshStep),
                reference((segment + 1) * meshStep),
              ];
              for (let vertex = 0; vertex < sides * 6; vertex++) {
                const ring = [0, 0, 1, 0, 1, 1][vertex % 6];
                const p = Array.from(
                  v.slice((offset + vertex) * 8, (offset + vertex) * 8 + 3),
                );
                expect(norm(sub(p, centers[ring]))).toBeLessThan(
                  envelopeRadius,
                );
              }
              offset += sides * 6;
            }
          }
          let station = 0;
          for (; offset < v.length / 8; offset += 36, station++) {
            const center = reference(station * spacing);
            for (let vertex = 0; vertex < 36; vertex++) {
              const p = Array.from(
                v.slice((offset + vertex) * 8, (offset + vertex) * 8 + 3),
              );
              expect(norm(sub(p, center))).toBeLessThan(envelopeRadius);
            }
          }
        }

  // Exclude nearest points at either reference endpoint, including arbitrary
  // tie stations for EVERY spacing .3..1.5. A union box encloses every allowed
  // rail, spine, variable tie and fixed tie. Interval speed/rotation bounds
  // cover between records, not just endpoint boxes.
  let endpointMargin = Infinity;
  for (let i = 0; i < path.length; i++) {
    const p = world(path[i]),
      f = axes(path[i]);
    const h = Math.max(
      i ? path[i][0] - path[i - 1][0] : 0,
      i + 1 < path.length ? path[i + 1][0] - path[i][0] : 0,
    );
    const boxRadius = Math.hypot(0.95, 1.02, 0.055);
    const guard =
      ((maxSpeed + angularRate * boxRadius) * h) / 2 +
      sourceDeviation +
      roundoff;
    for (const [tip, tangent, sign] of [
      [sub(first, scale(startT, extension)), startT, 1],
      [add(last, scale(endT, extension)), endT, -1],
    ] as [number[], number[], number][]) {
      const support =
        0.95 * Math.abs(dot(f.across, tangent)) +
        1.02 * Math.abs(dot(f.up, tangent)) +
        0.055 * Math.abs(dot(f.tangent, tangent));
      endpointMargin = Math.min(
        endpointMargin,
        sign * dot(sub(p, tip), tangent) - support - guard,
      );
    }
  }
  expect(endpointMargin).toBeGreaterThan(0);

  // No arbitrary arc-gap exclusion: for every cell pair either ALL pairs of
  // parameters are in the proved local neighborhood, or their entire balls
  // are disjoint. Source-cell balls enclose the complete Hermite intervals.
  const neighborhood = 2.6;
  // For arclength L in this neighborhood: chord dot T >= L cos(k L),
  // while an offset normal disk contributes at most r sin(k L)<=r k L.
  // Thus two radius-r normal disks cannot meet; r*k<1 also proves local
  // nonsingularity. Piecewise C2 / C1 joins preserve the integral bounds.
  const localMargin =
    Math.cos(curvature * maxSpeed * neighborhood) - radius * curvature;
  expect(localMargin).toBeGreaterThan(0);
  let clearance = Infinity,
    globalPairs = 0,
    localPairs = 0;
  for (let i = 0; i < cells.length; i++)
    for (let j = i; j < cells.length; j++) {
      const a = cells[i],
        b = cells[j];
      if (b.hi - a.lo <= neighborhood) {
        localPairs++;
        continue;
      }
      const margin =
        norm(sub(a.center, b.center)) - a.radius - b.radius - 2 * radius;
      clearance = Math.min(clearance, margin);
      globalPairs++;
    }
  console.info({
    curvature,
    maxSpeed,
    angularRate,
    envelopeRadius,
    endpointMargin,
    localMargin,
    clearance,
    globalPairs,
    localPairs,
  });
  expect(clearance).toBeGreaterThan(0);
}, 5000);

test("noncircular spatial loop: independently measured chord curvature and nonplanarity", () => {
  const tangent = (i: number) => {
    const d = sub(world(path[i + 1]), world(path[i - 1]));
    return scale(d, 1 / norm(d));
  };
  const curvature = (i: number) =>
    norm(sub(tangent(i + 1), tangent(i - 1))) /
    (path[i + 1][0] - path[i - 1][0]);
  expect(curvature(10)).toBeCloseTo(0.1211090463, 6);
  expect(curvature(333)).toBeCloseTo(0.3629410247, 6);
  expect(curvature(333) / curvature(10)).toBeGreaterThan(2.9);
  const a = sub(world(path[333]), world(path[0])),
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
  expect(departure).toBeCloseTo(2.6928038013, 6);
});

test("loop: independent component dimensions, midpoint landmark, and parameter isolation", () => {
  // Independently evaluated recorded-state landmark at s=17.32602012785,
  // bracketed by records 333/334. These literals are not frame() output.
  const origin = [2.159847470976644, 12.52600479027773, 0.02297391519443296];
  const across = [
    0.9709371025591086, -0.23850676615892155, -0.019891339083547604,
  ];
  const up = [-0.23840845811895775, -0.9711382100856335, 0.007209993690220632];
  const railVertices = 192 * 12 * 6,
    spineStart = railVertices * 2,
    tieStart = spineStart + 192 * 4 * 6;
  const components = (overrides: Partial<typeof defaults> = {}) => {
    const v = generate({
      ...defaults,
      configuration: "loop",
      ...overrides,
    }).vertices;
    return {
      rails: v.slice(0, spineStart * 8),
      spine: v.slice(spineStart * 8, tieStart * 8),
      ties: v.slice(tieStart * 8),
    };
  };
  const position = (v: Float32Array, i: number) =>
    Array.from(v.slice(i * 8, i * 8 + 3));
  const center = (v: Float32Array, ids: number[]) =>
    [0, 1, 2].map(
      (k) => ids.reduce((s, i) => s + v[i * 8 + k], 0) / ids.length,
    );
  const near = (a: number[], b: number[]) =>
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 5));
  const range = (v: Float32Array, ids: number[], axis: number[]) => {
    const p = ids.map((i) => dot(sub(position(v, i), origin), axis));
    return [Math.min(...p), Math.max(...p)];
  };
  const rails = (v: Float32Array, separation: number) => {
    for (const side of [0, 1]) {
      const ids = Array.from(
        { length: 12 },
        (_, j) => side * railVertices + 96 * 72 + j * 6,
      );
      near(
        center(v, ids),
        add(origin, scale(across, ((side ? 1 : -1) * separation) / 2)),
      );
      near(range(v, ids, across), [
        ((side ? 1 : -1) * separation) / 2 - 0.065,
        ((side ? 1 : -1) * separation) / 2 + 0.065,
      ]);
      near(range(v, ids, up), [-0.065, 0.065]);
    }
  };
  const spine = (v: Float32Array, width: number, depth: number) => {
    const ids = [0, 1, 2, 3].map((j) => 96 * 24 + j * 6);
    near(range(v, ids, across), [-width / 2, width / 2]);
    near(range(v, ids, up), [-0.22 - depth, -0.22]);
  };
  const tie = (v: Float32Array, separation: number) => {
    expect(norm(sub(position(v, 0), position(v, 5)))).toBeCloseTo(
      separation + 0.3,
      5,
    );
    expect(norm(sub(position(v, 0), position(v, 1)))).toBeCloseTo(0.11, 5);
    expect(norm(sub(position(v, 0), position(v, 6)))).toBeCloseTo(0.11, 5);
  };
  const base = components();
  for (const separation of [0.6, 1.4, 1.6]) {
    const c = components({ separation });
    rails(c.rails, separation);
    tie(c.ties, separation);
    expect(c.spine).toEqual(base.spine);
    expect(c.ties.length).toBe(base.ties.length);
    for (let i = 0; i < c.ties.length / (36 * 8); i++) {
      const ids = Array.from({ length: 36 }, (_, j) => i * 36 + j);
      near(center(c.ties, ids), center(base.ties, ids));
    }
  }
  for (const width of [0.15, 0.5, 0.6]) {
    const c = components({ width });
    spine(c.spine, width, 0.35);
    expect(c.rails).toEqual(base.rails);
    expect(c.ties).toEqual(base.ties);
  }
  for (const depth of [0.15, 0.7, 0.8]) {
    const c = components({ depth });
    spine(c.spine, 0.28, depth);
    expect(c.rails).toEqual(base.rails);
    expect(c.ties).toEqual(base.ties);
  }
  for (const spacing of [0.3, 1.2, 1.5]) {
    const c = components({ spacing });
    tie(c.ties, 1);
    expect(c.rails).toEqual(base.rails);
    expect(c.spine).toEqual(base.spine);
    expect(c.ties.length / (36 * 8)).toBe(Math.ceil(34.6520402557 / spacing));
  }
  const fixed = components({ fixed: true });
  expect(fixed.rails).toEqual(base.rails);
  expect(fixed.spine).toEqual(base.spine);
  expect(fixed.ties.length).toBe(0);
});
