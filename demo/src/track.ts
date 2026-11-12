// Provisional demo construction, not an asset or track specification. Meters throughout.
import { qRotate } from "@dylanebert/shallot";
import loopPath from "./loop-path.json";

// Recorded KexEdit positions/rotations; no solver runs in the demo. See tools/LOOP.md.
const loopLength = loopPath.at(-1)![0];
const loopApexX = loopPath.reduce((highest, row) =>
  row[2] > highest[2] ? row : highest,
)[1];
function loopFrame(s: number) {
  s = Math.max(0, Math.min(loopLength, s));
  let low = 0,
    high = loopPath.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (loopPath[mid][0] <= s) low = mid;
    else high = mid;
  }
  const a = loopPath[low],
    b = loopPath[high];
  const t = (s - a[0]) / (b[0] - a[0]);
  const p = [1, 2, 3].map((i) => a[i] + t * (b[i] - a[i]));
  const sign = a.slice(4).reduce((n, v, i) => n + v * b[i + 4], 0) < 0 ? -1 : 1;
  const q = [4, 5, 6, 7].map((i) => a[i] + t * (sign * b[i] - a[i]));
  const norm = Math.hypot(...q);
  const axis = (x: number, y: number, z: number) =>
    qRotate(q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm, x, y, z);
  const right = axis(1, 0, 0),
    up = axis(0, 1, 0),
    forward = axis(0, 0, -1);
  // World Y half-turn + translation, never scale. Reverse BOTH local X and Z
  // from KexEdit's -Z-forward frame so demo +Z tangent remains right-handed.
  return {
    p: [-p[0] + loopApexX, p[1] + 1.5, -p[2] - 4.3] as Vec,
    x: [right[0], -right[1], right[2]] as Vec,
    y: [-up[0], up[1], -up[2]] as Vec,
    z: [-forward[0], forward[1], -forward[2]] as Vec,
  };
}
export type Vec = [number, number, number];
export type Configuration = "straight" | "curve" | "loop";
export interface Parameters {
  configuration: Configuration;
  spacing: number;
  separation: number;
  width: number;
  depth: number;
  fixed: boolean;
  secondSpine?: boolean;
}
export const defaults: Parameters = {
  configuration: "curve",
  spacing: 0.65,
  separation: 1,
  width: 0.28,
  depth: 0.35,
  fixed: false,
};
export function length(kind: Configuration) {
  return kind === "straight"
    ? 12
    : kind === "curve"
      ? 4 * Math.PI
      : loopLength;
}
export function frame(kind: Configuration, s: number) {
  if (kind === "straight")
    return {
      p: [0, 1.5, s - 6] as Vec,
      x: [1, 0, 0] as Vec,
      y: [0, 1, 0] as Vec,
      z: [0, 0, 1] as Vec,
    };
  if (kind === "loop") return loopFrame(s);
  const a = s / 8 - Math.PI / 4,
    b = Math.PI / 6;
  return {
    p: [8 * Math.cos(a) - 6, 1.5, 8 * Math.sin(a)] as Vec,
    x: [
      Math.cos(a) * Math.cos(b),
      Math.sin(b),
      Math.sin(a) * Math.cos(b),
    ] as Vec,
    y: [
      -Math.cos(a) * Math.sin(b),
      Math.cos(b),
      -Math.sin(a) * Math.sin(b),
    ] as Vec,
    z: [-Math.sin(a), 0, Math.cos(a)] as Vec,
  };
}
export function point(
  f: ReturnType<typeof frame>,
  x: number,
  y: number,
  z = 0,
): Vec {
  return f.p.map((v, i) => v + f.x[i] * x + f.y[i] * y + f.z[i] * z) as Vec;
}
export function ties(p: Parameters) {
  return Array.from(
    { length: Math.floor((length(p.configuration) - 1e-6) / p.spacing) + 1 },
    (_, i) => ({ s: i * p.spacing, ...frame(p.configuration, i * p.spacing) }),
  );
}
export function generate(p: Parameters) {
  if (p.fixed) throw new Error('Blitz requires qualified profiles; use trackGeometry');
  const vertices: number[] = [],
    indices: number[] = [];
  function quad(a: Vec, b: Vec, c: Vec, d: Vec) {
    // Nonplanar loop sections do not make planar quads. Give each triangle its
    // own geometric normal instead of lighting the second with the first's.
    if (p.configuration === "loop") {
      triangle(a, b, c);
      triangle(a, c, d);
      return;
    }
    const u = b.map((v, i) => v - a[i]),
      v = c.map((v, i) => v - a[i]);
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const l = Math.hypot(...n) || 1;
    const start = vertices.length / 8;
    for (const pt of [a, b, c, d])
      vertices.push(...pt, 0, ...n.map((v) => v / l), 0);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  function triangle(a: Vec, b: Vec, c: Vec) {
    // Normals describe the emitted Float32 triangle, including small clipped
    // seat corners, rather than its higher-precision construction surrogate.
    [a, b, c] = [a, b, c].map(p => p.map(Math.fround) as Vec);
    const u = b.map((v, i) => v - a[i]),
      v = c.map((v, i) => v - a[i]);
    const n = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const size = Math.hypot(...n);
    const start = vertices.length / 8;
    for (const pt of [a, b, c])
      vertices.push(...pt, 0, ...n.map((v) => v / size), 0);
    indices.push(start, start + 1, start + 2);
  }
  function sweep(section: [number, number][]) {
    for (let i = 0; i < 192; i++) {
      const a = frame(p.configuration, (length(p.configuration) * i) / 192),
        b = frame(p.configuration, (length(p.configuration) * (i + 1)) / 192);
      section.forEach(([x, y], j) => {
        const [xx, yy] = section[(j + 1) % section.length];
        quad(
          point(a, x, y),
          point(a, xx, yy),
          point(b, xx, yy),
          point(b, x, y),
        );
      });
    }
  }
  for (const side of [-1, 1])
    sweep(
      Array.from({ length: 12 }, (_, i) => [
        (side * p.separation) / 2 + 0.065 * Math.cos((i * Math.PI) / 6),
        0.065 * Math.sin((i * Math.PI) / 6),
      ]),
    );
  const railEnd = { vertex: vertices.length / 8, index: indices.length };
  sweep([
    [-p.width / 2, -0.22],
    [-p.width / 2, -0.22 - p.depth],
    [p.width / 2, -0.22 - p.depth],
    [p.width / 2, -0.22],
  ]);
  const spineEnd = { vertex: vertices.length / 8, index: indices.length };
  // One app-local yoke section: two lower-facet seats, tapered arms and a
  // 100 mm web penetrating the spine top by 20 mm. Width/depth do not change
  // this joint; the smallest supported spine already encloses the web.
  const c = p.separation / 2, r = 0.0325, seatY = -0.065 * Math.sqrt(3) / 2;
  const profile: [number, number][] = [
    [-c-r, seatY], [-c, -0.065], [-c+r, seatY], [-0.05, -0.12],
    [0.05, -0.12], [c-r, seatY], [c, -0.065], [c+r, seatY],
    [c+r, -0.11], [0.05, -0.18], [0.05, -0.24],
    [-0.05, -0.24], [-0.05, -0.18], [-c-r, -0.11],
  ];
  const seats = new Set([0, 1, 5, 6]);
  const step = length(p.configuration) / 192;
  const interpolate = (a: Vec, b: Vec, t: number) => a.map((v, i) => v + t * (b[i] - v)) as Vec;
  function strip(s: number) {
    const cell = Math.max(0, Math.min(191, Math.floor(s / step)));
    const a = frame(p.configuration, cell * step), b = frame(p.configuration, (cell + 1) * step);
    return { a, b, t: (s - cell * step) / step };
  }
  function at(s: number, xy: [number, number]) {
    const end = Math.max(0, Math.min(length(p.configuration), s));
    if (end !== s) return point(frame(p.configuration, end), ...xy, s - end);
    const { a, b, t } = strip(s);
    return interpolate(point(a, ...xy), point(b, ...xy), t);
  }
  // A seat follows the emitted triangles, NOT a circular tube or bilinear
  // quad. Clip each of the two existing facet triangles to the tie's depth.
  // The same diagonal kink is included in the end-cap boundary.
  function cap(s: number, reverse: boolean) {
    const { a, b, t } = strip(Math.max(0, Math.min(length(p.configuration), s)));
    const ring: { xy: [number, number]; p: Vec }[] = [];
    profile.forEach((xy, i) => {
      ring.push({ xy, p: at(s, xy) });
      if (s < 0 || s > length(p.configuration) || !seats.has(i) || t < 1e-7 || t > 1 - 1e-7) return;
      const next = profile[(i + 1) % profile.length];
      ring.push({ xy: [xy[0] + t * (next[0] - xy[0]), xy[1] + t * (next[1] - xy[1])],
        p: interpolate(point(a, ...xy), point(b, ...next), t) });
    });
    const turn = (a: number[], b: number[], c: number[]) =>
      (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    // Ear clipping only this small, clockwise app section (no mesh Boolean).
    const remaining = ring.map((_, i) => i);
    while (remaining.length > 2) {
      let found = false;
      for (let j = 0; j < remaining.length; j++) {
        const ids = [remaining[(j + remaining.length - 1) % remaining.length], remaining[j], remaining[(j + 1) % remaining.length]];
        const [a, b, c] = ids.map(i => ring[i].xy);
        if (turn(a, b, c) >= -1e-12) continue;
        if (remaining.some(i => !ids.includes(i) && turn(a,b,ring[i].xy) <= 1e-12 && turn(b,c,ring[i].xy) <= 1e-12 && turn(c,a,ring[i].xy) <= 1e-12)) continue;
        const pts = ids.map(i => ring[i].p);
        triangle(pts[0], pts[reverse ? 2 : 1], pts[reverse ? 1 : 2]);
        remaining.splice(j, 1);
        found = true;
        break;
      }
      if (!found) throw new Error("Invalid yoke cap");
    }
  }
  for (const { s } of ties(p)) {
    const lo = s - 0.055, hi = s + 0.055;
    const cuts = [lo, hi];
    for (let i = 0; i <= 192; i++) if (i * step > lo && i * step < hi) cuts.push(i * step);
    cuts.sort((a, b) => a - b);
    cap(lo, false);
    cap(hi, true);
    for (let k = 0; k < cuts.length - 1; k++) {
      const low = cuts[k], high = cuts[k + 1];
      profile.forEach((xy, i) => {
        const next = profile[(i + 1) % profile.length];
        if (!seats.has(i) || high <= 0 || low >= length(p.configuration)) {
          // Geometric normals are required on every nonplanar strip, even on
          // the banked curve. Seat clipping also makes strips variable-sized.
          const a = at(low, xy), b = at(high, xy), c = at(high, next), d = at(low, next);
          triangle(a, b, c); triangle(a, c, d);
          return;
        }
        const { a, b } = strip((low + high) / 2);
        const cell = Math.floor((low + high) / 2 / step), t0 = (low - cell * step) / step, t1 = (high - cell * step) / step;
        const corners = [point(a, ...xy), point(a, ...next), point(b, ...next), point(b, ...xy)];
        for (const ids of [[0,1,2],[0,2,3]]) {
          let polygon = ids.map(j => ({ p: corners[j], t: j < 2 ? 0 : 1 }));
          for (const [bound, sign] of [[t0,1],[t1,-1]]) {
            const clipped: typeof polygon = [];
            polygon.forEach((a, j) => {
              const b = polygon[(j + 1) % polygon.length], inside = sign * (a.t - bound) >= -1e-12;
              if (inside) clipped.push(a);
              if (inside !== (sign * (b.t - bound) >= -1e-12)) {
                const t = (bound - a.t) / (b.t - a.t);
                clipped.push({ p: interpolate(a.p, b.p, t), t: bound });
              }
            });
            polygon = clipped;
          }
          // Clipping at an existing ring can repeat a corner. Drop those
          // repetitions rather than emitting zero-area triangles.
          polygon = polygon.filter((v,j) => Math.hypot(...v.p.map((x,k) => x-polygon[(j+polygon.length-1)%polygon.length].p[k])) > 1e-10);
          for (let j = 1; j + 1 < polygon.length; j++) triangle(polygon[0].p, polygon[j+1].p, polygon[j].p);
        }
      });
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    parts: [
      { name: "rails" as const, vertex: 0, index: 0, endVertex: railEnd.vertex, endIndex: railEnd.index },
      { name: "spine" as const, vertex: railEnd.vertex, index: railEnd.index, endVertex: spineEnd.vertex, endIndex: spineEnd.index },
      { name: "ties" as const, vertex: spineEnd.vertex, index: spineEnd.index, endVertex: vertices.length / 8, endIndex: indices.length },
    ],
  };
}
// Proper orthonormal frame -> quaternion, retaining the asset's authored axes.
export function rotation(
  f: ReturnType<typeof frame>,
): [number, number, number, number] {
  const m = [f.x, f.y, f.z],
    q = [0, 0, 0, 0];
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q[3] = s / 4;
    q[0] = (m[1][2] - m[2][1]) / s;
    q[1] = (m[2][0] - m[0][2]) / s;
    q[2] = (m[0][1] - m[1][0]) / s;
  } else {
    let i = 0;
    if (m[1][1] > m[0][0]) i = 1;
    if (m[2][2] > m[i][i]) i = 2;
    const j = (i + 1) % 3,
      k = (i + 2) % 3,
      s = 2 * Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]);
    q[i] = s / 4;
    q[j] = (m[i][j] + m[j][i]) / s;
    q[k] = (m[i][k] + m[k][i]) / s;
    q[3] = (m[j][k] - m[k][j]) / s;
  }
  return q as [number, number, number, number];
}
