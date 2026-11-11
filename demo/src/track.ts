// Provisional demo construction, not an asset or track specification. Meters throughout.
import { qRotate } from "@dylanebert/shallot";
import loopPath from "./loop-path.json";

// Recorded KexEdit positions/rotations; no solver runs in the demo. See tools/LOOP.md.
const loopLength = loopPath.at(-1)![0];
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
    p: [-p[0] + 2.2, p[1] + 1.5, -p[2] - 4.3] as Vec,
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
  sweep([
    [-p.width / 2, -0.22],
    [-p.width / 2, -0.22 - p.depth],
    [p.width / 2, -0.22 - p.depth],
    [p.width / 2, -0.22],
  ]);
  if (!p.fixed)
    for (const f of ties(p)) {
      const w = p.separation / 2 + 0.15,
        h = 0.055;
      const pts = [
        [-w, -h, -h],
        [w, -h, -h],
        [w, h, -h],
        [-w, h, -h],
        [-w, -h, h],
        [w, -h, h],
        [w, h, h],
        [-w, h, h],
      ].map(([x, y, z]) => point(f, x, y, z));
      for (const [a, b, c, d] of [
        [0, 3, 2, 1],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [3, 7, 6, 2],
        [0, 4, 7, 3],
        [1, 2, 6, 5],
      ])
        quad(pts[a], pts[b], pts[c], pts[d]);
    }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
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
