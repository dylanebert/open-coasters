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
  expect(length("loop")).toBeCloseTo(42.0726940244, 9);
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
    expect(stations.length).toBe(Math.ceil(42.0726940244 / spacing));
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
  expect(state.samples[apex][1]).toBeLessThan(5.84);
  expect(state.samples[exit][1]).toBeGreaterThan(15.4);
  expect(state.samples[apex][1]).toBeCloseTo(5.8290506301, 6);
});

const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const scale = (a: number[], k: number) => a.map((x) => x * k);

const clearanceMesh = (overrides: Partial<typeof defaults> = {}) =>
  generate({ ...defaults, configuration: "loop", ...overrides });

test("nonlocal emitted envelope: whole-interval ball separation", () => {
  // Reference curve: C1 cubic Hermite through recorded centers, with recorded
  // unit tangents. Bounds below use Bezier convex hulls, NOT a sampling claim.
  // This proves ONLY nonlocal separation. Euclidean containment does not prove
  // local mesh embedding; actual local pieces are checked separately below.
  const cells: { lo: number; hi: number; center: number[]; radius: number }[] =
    [];
  const beziers: number[][][] = [];
  let maxAcceleration = 0,
    maxSpeed = 1,
    sourceDeviation = 0;
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
    const acceleration = (2 * Math.max(norm(sub(d, t)), norm(sub(u, d)))) / h;
    maxAcceleration = Math.max(maxAcceleration, acceleration);
    maxSpeed = Math.max(maxSpeed, vmax);
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
  // Audit actual emitted corners. Maximal spine/tie rectangles contain all
  // smaller widths/depths/spans; each rail vertex is affine in separation.
  // The radius bound above covers arbitrary stations, not a spacing snapshot.
  let worstCorner = { error: 0, vertex: -1, parameters: "" };
  const audit = (error: number, vertex: number, parameters: string) => {
    if (error > worstCorner.error) worstCorner = { error, vertex, parameters };
  };
  for (const separation of [0.6, 1.6]) {
    const width = 0.6, depth = 0.8, spacing = 0.3;
    const { vertices: v } = clearanceMesh({ separation, width, depth, spacing });
    const parameters = `${separation}/${width}/${depth}/${spacing}`;
    let offset = 0;
    for (const sides of [12, 12, 4]) {
      for (let segment = 0; segment < 192; segment++) {
        const centers = [reference(segment * meshStep), reference((segment + 1) * meshStep)];
        for (let vertex = 0; vertex < sides * 6; vertex++) {
          const ring = [0, 0, 1, 0, 1, 1][vertex % 6];
          const p = Array.from(v.subarray((offset + vertex) * 8, (offset + vertex) * 8 + 3));
          audit(norm(sub(p, centers[ring])), offset + vertex, parameters);
        }
        offset += sides * 6;
      }
    }
    let station = 0;
    for (; offset < v.length / 8; offset += 36, station++) {
      const center = reference(station * spacing);
      for (let vertex = 0; vertex < 36; vertex++) {
        const p = Array.from(v.subarray((offset + vertex) * 8, (offset + vertex) * 8 + 3));
        audit(norm(sub(p, center)), offset + vertex, parameters);
      }
    }
  }

  expect(worstCorner.error, JSON.stringify(worstCorner)).toBeLessThan(envelopeRadius);

  // Pairs omitted here are the obligation of the direct local-piece check.
  const neighborhood = 2.6;
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
    maxSpeed,
    envelopeRadius,
    worstCorner,
    clearance,
    globalPairs,
    localPairs,
  });
  expect(clearance).toBeGreaterThan(0);
});

test("local emitted pieces: chord hulls and thick ties separate except their joints", () => {
  const total = path.at(-1)![0], step = total / 192, epsilon = 1e-5;
  const small = clearanceMesh({ separation: 0.6, width: 0.15, depth: 0.15, spacing: 0.3 }).vertices;
  const large = clearanceMesh({ separation: 1.6, width: 0.6, depth: 0.8, spacing: 0.3 }).vertices;
  const vertex = (v: Float32Array, i: number) => Array.from(v.subarray(i * 8, i * 8 + 3));
  type Piece = { lo: number; hi: number; points: number[][]; f: ReturnType<typeof frame>; guard: number; name: string };
  // Positions are affine in each profile control. The convex hull of actual
  // min/max-control ring corners therefore contains every supported chord face.
  // Rail/spine pieces are solids enclosing one section, not auxiliary normal disks.
  const sweeps: (Piece & { kind: number; segment: number })[] = [];
  const starts = [0, 192 * 72, 2 * 192 * 72];
  for (let segment = 0; segment < 192; segment++)
    for (let kind = 0; kind < 3; kind++) {
      const sides = kind === 2 ? 4 : 12, points: number[][] = [];
      for (const v of [small, large])
        for (let side = 0; side < sides; side++)
          for (const corner of [0, 5])
            points.push(vertex(v, starts[kind] + segment * sides * 6 + side * 6 + corner));
      sweeps.push({ lo: segment * step, hi: (segment + 1) * step, points,
        f: frame("loop", (segment + 0.5) * step), guard: epsilon,
        kind, segment, name: `${["left rail", "right rail", "spine"][kind]}:${segment}` });
    }
  const project = (points: number[][], axis: number[]) => {
    let lo = Infinity, hi = -Infinity;
    const [x, y, z] = axis;
    for (const p of points) {
      const n = p[0] * x + p[1] * y + p[2] * z;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    return [lo, hi];
  };
  // One positive projection gap is a separating plane for the ENTIRE convex
  // hulls, including the interiors of all emitted triangles (not just vertices).
  const gap = (a: Piece, b: Piece) => {
    const z = add(a.f.z, b.f.z), unit = scale(z, 1 / norm(z));
    let best = -Infinity;
    for (const axis of [unit, a.f.y, a.f.x, b.f.y, b.f.x]) {
      const aa = project(a.points, axis), bb = project(b.points, axis);
      const d = Math.max(bb[0] - aa[1], aa[0] - bb[1]) - a.guard - b.guard;
      if (d > 0.02) return d; // Stop at a useful plane, not the optimal one.
      best = Math.max(best, d);
    }
    return best;
  };
  let seamLeak = 0, seamAdvance = Infinity;
  for (let segment = 0; segment < 191; segment++)
    for (let kind = 0; kind < 3; kind++) {
      const a = sweeps[segment * 3 + kind], b = sweeps[(segment + 1) * 3 + kind];
      const seam = frame("loop", a.hi);
      // Adjacent sections share only the ring-plane slab at mesh roundoff.
      // Every other ring corner must strictly advance, excluding folded-back
      // chord faces rather than exempting entire neighboring sections.
      for (const [piece, sign] of [[a, -1], [b, 1]] as const)
        for (let i = 0; i < piece.points.length; i++) {
          const d = sign * dot(sub(piece.points[i], seam.p), seam.z);
          const sharedRing = i % 2 === (sign === -1 ? 1 : 0);
          if (sharedRing) seamLeak = Math.max(seamLeak, Math.abs(d));
          else seamAdvance = Math.min(seamAdvance, d);
        }
    }
  let sweepGap = Infinity, sweepPair = "";
  for (let i = 0; i < sweeps.length; i++)
    for (let j = i + 1; j < sweeps.length; j++) {
      const a = sweeps[i], b = sweeps[j];
      if (b.lo - a.hi > 2.6) break; // All remaining parameter pairs have the nonlocal proof.
      if (a.kind === b.kind && b.segment === a.segment + 1) continue; // proved shared-ring joint above
      const d = gap(a, b);
      if (d < sweepGap) { sweepGap = d; sweepPair = `${a.name}/${b.name}`; }
    }

  const tieStart = 192 * (12 + 12 + 4) * 6, first = frame("loop", 0);
  const body = Array.from({ length: 36 }, (_, i) => {
    const p = sub(vertex(large, tieStart + i), first.p);
    return [dot(p, first.x), dot(p, first.y), dot(p, first.z)];
  });
  const prototype = [...new Map(body.map(p => [p.join(","), p])).values()];
  const bodyBounds = [0, 1, 2].map(k => [Math.min(...body.map(p => p[k])), Math.max(...body.map(p => p[k]))]);
  // This maximal variable tie also encloses the unchanged fixed asset's source
  // box. Smaller separations only shrink X; no spine or width control affects it.
  for (const [k, extent] of [[0, 0.6], [1, 0.05], [2, 0.050001]]) {
    expect(bodyBounds[k][0]).toBeLessThanOrEqual(-extent);
    expect(bodyBounds[k][1]).toBeGreaterThanOrEqual(extent);
  }
  let tieBodyLeak = 0;
  for (const v of [small, large])
    for (let station = 0, offset = tieStart; offset < v.length / 8; offset += 36, station++) {
      const f = frame("loop", station * 0.3);
      for (let i = 0; i < 36; i++) {
        const p = sub(vertex(v, offset + i), f.p);
        for (const [k, axis] of [f.x, f.y, f.z].entries()) {
          const n = dot(p, axis);
          tieBodyLeak = Math.max(tieBodyLeak, bodyBounds[k][0] - n, n - bodyBounds[k][1]);
        }
      }
    }
  // Bound every arbitrary tie station, not just .3 and 1.5 spacing snapshots.
  // The consumer is piecewise linear in position and normalized-lerp in rotation.
  let speedBound = 0, angularBound = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const h = path[i + 1][0] - path[i][0];
    speedBound = Math.max(speedBound, norm(sub(world(path[i + 1]), world(path[i]))) / h);
    const a = path[i].slice(4), b = path[i + 1].slice(4);
    const cosine = Math.min(1, Math.abs(dot(a, b)) / (norm(a) * norm(b)));
    angularBound = Math.max(angularBound, 4 * Math.tan(Math.acos(cosine) / 2) / h + 1e-6);
  }
  const radius = Math.max(...prototype.map(norm));
  const cells = Math.ceil(total / 0.025), ties: Piece[] = [];
  for (let i = 0; i < cells; i++) {
    const lo = total * i / cells, hi = total * (i + 1) / cells, f = frame("loop", (lo + hi) / 2);
    const points = prototype.map(p => f.p.map((x, k) => x + f.x[k] * p[0] + f.y[k] * p[1] + f.z[k] * p[2]));
    ties.push({ lo, hi, f, points, guard: (speedBound + angularBound * radius) * (hi - lo) / 2 + epsilon,
      name: `tie station:[${lo.toFixed(3)},${hi.toFixed(3)}]` });
  }
  const extended = (s: number) => {
    const clamped = Math.max(0, Math.min(total, s)), f = frame("loop", clamped);
    return { ...f, p: add(f.p, scale(f.z, s - clamped)) };
  };
  let tieGap = Infinity, tiePair = "", spineGap = Infinity, railGap = Infinity, attachmentMargin = Infinity;
  const attachmentHalf = 0.12;
  // Even the whole uncertain station cell's attachment strip is shorter than
  // minimum tie spacing; this is not a blanket local-arc joint exemption.
  expect(total / cells + 2 * attachmentHalf).toBeLessThan(0.3);
  for (let i = 0; i < ties.length; i++) {
    const a = ties[i];
    // A tie can touch rails only in this station's attachment strip. Its full
    // thick box is strictly between these planes; no tie/spine joint is exempt.
    for (const [s, sign] of [[a.lo - attachmentHalf, 1], [a.hi + attachmentHalf, -1]]) {
      const plane = extended(s);
      for (const p of a.points)
        attachmentMargin = Math.min(attachmentMargin, sign * dot(sub(p, plane.p), plane.z) - a.guard);
    }
    for (let j = i + 1; j < ties.length; j++) {
      const b = ties[j];
      if (b.lo - a.hi > 2.6) break;
      if (b.hi - a.lo < 0.3 - 1e-10) continue; // distinct legal stations are at least .3 m apart
      const d = gap(a, b);
      if (d < tieGap) { tieGap = d; tiePair = `${a.name}/${b.name}`; }
    }
    for (const b of sweeps) {
      if (b.lo - a.hi > 2.6 || a.lo - b.hi > 2.6) continue;
      if (b.kind !== 2 && b.lo <= a.hi + attachmentHalf && b.hi >= a.lo - attachmentHalf) continue;
      const d = gap(a, b);
      if (b.kind === 2) spineGap = Math.min(spineGap, d);
      else railGap = Math.min(railGap, d);
    }
  }
  console.info({ seamLeak, seamAdvance, sweepGap, sweepPair, tieBodyLeak, tieGap, tiePair, spineGap, railGap, attachmentMargin });
  expect(seamLeak).toBeLessThan(epsilon);
  expect(seamAdvance).toBeGreaterThan(epsilon);
  expect(sweepGap, sweepPair).toBeGreaterThan(0);
  expect(tieBodyLeak).toBeLessThan(epsilon);
  expect(tieGap, tiePair).toBeGreaterThan(0);
  expect(spineGap).toBeGreaterThan(0);
  expect(railGap).toBeGreaterThan(0);
  expect(attachmentMargin).toBeGreaterThan(0);
});

test("noncircular spatial loop: independently measured chord curvature and nonplanarity", () => {
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
  expect(curvature(crown) / Math.min(...curvatures)).toBeGreaterThan(2.9);
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
  expect(departure).toBeGreaterThan(2);
});

test("loop: independent component dimensions, midpoint landmark, and parameter isolation", () => {
  // Independent matrix reconstruction at the new metric midpoint.
  const origin = [3.527941183591029, 14.846686750720252, 1.112765669446995];
  const across = [0.9546375921092585, 0.000945326610554788, 0.2977686586755503];
  const up = [0.0010066066297183312, -0.9999994919958399, -5.245145321893793e-05];
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
    expect(c.ties.length / (36 * 8)).toBe(Math.ceil(42.0726940244 / spacing));
  }
  const fixed = components({ fixed: true });
  expect(fixed.rails).toEqual(base.rails);
  expect(fixed.spine).toEqual(base.spine);
  expect(fixed.ties.length).toBe(0);
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
    return entry < -.2 && exit > .2 && Math.abs(entry + exit) < .002 &&
      Math.max(...b.map(Math.abs)) < .3 && Math.abs(b[0]) < 1e-7 && Math.abs(b.at(-1)!) < 1e-7 &&
      // .002 rad (0.115 degrees) is under 1% of either bank peak. This bounds
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
