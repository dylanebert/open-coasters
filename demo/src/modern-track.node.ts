import { expect, test, setDefaultTimeout } from 'bun:test';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { trackGeometry, modernTies } from './modern-track';
import { defaults } from './track';
import loop from './loop-path.json';

setDefaultTimeout(TIMEOUT.node);
const intervals = 192;
const apex = loop.reduce((a, b) => b[2] > a[2] ? b : a);

// Independent analytic/recorded frame oracle, not production frame/sweep helpers.
function expected(kind: string, station: number, x: number, y: number, nx: number, ny: number) {
  const t = station / intervals;
  if (kind === 'straight') return [[x, 1.5 + y, 6 - 12 * t], [nx, ny, 0]];
  if (kind === 'curve') {
    const a = (t - 0.5) * Math.PI / 2, b = Math.PI / 6;
    // Increasing angle gives travel (-sin a, 0, cos a). With −Z
    // forward, right points inward before banking. Tilt up inward as well.
    const c = Math.cos(a), s = Math.sin(a);
    const radial = -x * Math.cos(b) - y * Math.sin(b);
    const radialNormal = -nx * Math.cos(b) - ny * Math.sin(b);
    return [
      [(8 + radial) * c - 6, 1.5 - x * Math.sin(b) + y * Math.cos(b), (8 + radial) * s],
      [radialNormal * c, -nx * Math.sin(b) + ny * Math.cos(b), radialNormal * s],
    ];
  }
  const distance = loop.at(-1)![0] * t;
  let i = 0;
  while (i < loop.length - 2 && loop[i + 1][0] < distance) i++;
  const a = loop[i], b = loop[i + 1], f = (distance - a[0]) / (b[0] - a[0]);
  const sign = a.slice(4).reduce((v, q, k) => v + q * b[k + 4], 0) < 0 ? -1 : 1;
  const q = a.slice(4).map((v, k) => v * (1 - f) + sign * b[k + 4] * f);
  const norm = Math.hypot(...q);
  const [qx, qy, qz, qw] = q.map(v => v / norm);
  // Quaternion X/Y columns, each transformed by the world Y half-turn
  // (negate world X and Z). The recording already uses local −Z forward.
  const right = [2 * (qy*qy + qz*qz) - 1, 2 * (qx*qy + qw*qz), -2 * (qx*qz - qw*qy)];
  const up = [-2 * (qx*qy - qw*qz), 1 - 2 * (qx*qx + qz*qz), -2 * (qy*qz + qw*qx)];
  const p = a.slice(1, 4).map((v, k) => v * (1 - f) + b[k + 1] * f);
  const origin = [apex[1] - p[0], p[1] + 1.5, apex[3] - p[2]];
  return [origin.map((v, k) => v + right[k]*x + up[k]*y), right.map((v, k) => v*nx + up[k]*ny)];
}

async function sourceEdges(asset: string) {
  const v: number[][] = [], n: number[][] = [], faces: number[][][] = [];
  for (const line of (await Bun.file(new URL(`../../assets/blitz-profile/${asset}.obj`, import.meta.url)).text()).split('\n')) {
    const [tag, ...values] = line.trim().split(/\s+/);
    if (tag === 'v') v.push(values.map(Number));
    if (tag === 'vn') {
      const normal = values.map(Number);
      n.push(normal.map(x => x / Math.hypot(...normal)));
    }
    if (tag === 'f') faces.push(values.map(c => c.split('/').map(x => Number(x) - 1)));
  }
  const z = Math.min(...v.map(p => p[2]));
  return faces.flatMap((face, faceIndex) => face.flatMap((a, i) => {
    const b = face[(i + 1) % face.length];
    if (v[a[0]][2] !== z || v[b[0]][2] !== z) return [];
    return [{
      label: `${asset} OBJ face ${faceIndex + 1} edge ${a[0] + 1}→${b[0] + 1}`,
      ends: [a, b].map(c => ({ p: v[c[0]], n: n[c[2]] })),
    }];
  }));
}

const positionTolerance = 3e-6, normalTolerance = 1e-4;
const error = (want: number[], vertices: Float32Array, offset: number) =>
  Math.max(...want.map((value, k) => Math.abs(value - vertices[offset + k])));
const build = trackGeometry(name => new URL(`../public/assets/${name}.gltf`, import.meta.url));
for (const configuration of ['straight', 'curve', 'loop'] as const) for (const secondSpine of [false, true]) test(`integrated source geometry: ${configuration}, second spine ${secondSpine}`, async () => {
  const p = { ...defaults, configuration, fixed: true, secondSpine };
  const mesh = await build(p);
  expect(modernTies(p), 'Modern tie asset selection').toEqual(secondSpine ? ['ModernTie_Med', 'ModernTie_Dense'] : ['ModernTie_Med']);
  const names = ['ModernRail', 'ModernSpine_1', ...(secondSpine ? ['ModernSpine_2'] : [])];
  const edges = (await Promise.all(names.map(sourceEdges))).flat();
  // Locate each authored strip at its first two stations, not by cap offsets.
  // A single endpoint pair can match a final ring or a coincident cap.
  const starts = Array.from({ length: mesh.vertices.length / 8 }, (_, i) => i * 8);
  const triangles = new Set(Array.from({ length: mesh.indices.length / 3 }, (_, i) => mesh.indices.slice(i * 3, i * 3 + 3).join(',')));
  for (const { label, ends } of edges) {
    const at = (station: number) => ends.map(({ p, n }) => expected(configuration, station, p[0], p[1], n[0], n[1]));
    const first = [...at(0), ...at(1)];
    const matches = (start: number, field: number, offset: number, tolerance: number) => first.every((want, i) =>
      error(want[field], mesh.vertices, start + i*8 + offset) < tolerance);
    const positioned = starts.filter(start => matches(start, 0, 0, positionTolerance));
    expect(positioned.length, `${label} stations 0–1: wall endpoint positions`).toBeGreaterThan(0);
    const start = positioned.find(start => matches(start, 1, 4, normalTolerance));
    if (start === undefined) throw new Error(`${label} stations 0–1: wall endpoint normals at matching positions`);
    for (let station = 0; station < intervals; station++) {
      const a = start/8 + station*2;
      // The directed min-Z OBJ edge bounds a wall extending toward +Z.
      // Advancing toward local −Z instead reverses both wall triangles.
      expect(triangles.has([a, a+3, a+1].join(',')), `${label} station ${station}: first directed wall triangle`).toBe(true);
      expect(triangles.has([a, a+2, a+3].join(',')), `${label} station ${station}: second directed wall triangle`).toBe(true);
    }
    for (let station = 0; station <= intervals; station++) at(station).forEach(([position, normal], end) => {
      const offset = start + (station*2 + end)*8;
      expect(error(position, mesh.vertices, offset), `${label} station ${station} endpoint ${end}: position error`).toBeLessThan(positionTolerance);
      expect(error(normal, mesh.vertices, offset + 4), `${label} station ${station} endpoint ${end}: normal error`).toBeLessThan(normalTolerance);
    });
  }
  // Adjustable-only dimensions and spacing cannot deform the source sections.
  expect((await build({ ...p, separation: 1.6, width: .6, depth: .8, spacing: 1.5 })).vertices, `${names.join(', ')}: fixed geometry positions and normals under adjustable controls`).toEqual(mesh.vertices);
});
