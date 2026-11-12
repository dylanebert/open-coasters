import { expect, test } from "bun:test";
import { defaults, generate } from "./track";

type P = [number, number];
type Segment = [P, P];
const distance = (p: P, [a, b]: Segment) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1,
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

// Intersect actual triangles, not the ideal section or a frame-center proxy.
// A straight interior station makes the joint expectations independent of the
// path implementation, while retaining the emitted finite sweep and tie depth.
function section(mesh: ReturnType<typeof generate>, name: "rails" | "spine" | "ties", z: number) {
  const part = mesh.parts.find(p => p.name === name)!;
  const lines: Segment[] = [];
  for (let i = part.index; i < part.endIndex; i += 3) {
    const tri = Array.from({ length: 3 }, (_, j) => {
      const offset = mesh.indices[i + j] * 8;
      return Array.from(mesh.vertices.subarray(offset, offset + 3));
    });
    const hits: P[] = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3];
      if ((a[2] < z) === (b[2] < z)) continue;
      const t = (z - a[2]) / (b[2] - a[2]);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    if (hits.length === 2 && Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) > 1e-8)
      lines.push([hits[0], hits[1]]);
  }
  expect(lines.length).toBeGreaterThan(0);
  return lines;
}
const boundaryDistance = (p: P, lines: Segment[]) => Math.min(...lines.map(line => distance(p, line)));

for (const separation of [0.6, 1, 1.6]) {
  for (const width of [0.15, 0.28, 0.6]) {
    test(`yoke spine contact: gauge ${separation}, width ${width}`, () => {
      const mesh = generate({ ...defaults, configuration: "straight", separation, width });
      // The second tie is centered at z=-5.35; inspect inside its thickness,
      // away from both cap planes and the sweep's ring stations.
      const z = -5.35 + 0.017;
      const spine = section(mesh, "spine", z), yoke = section(mesh, "ties", z);
      const joint: P = [0, 1.5 - 0.22];
      expect(boundaryDistance(joint, spine)).toBeLessThan(2e-6);
      // A web must reach the spine, not terminate 165 mm above it. Bounded
      // penetration is allowed; an exposed gap is not. Its section must cross
      // the centerline at or below the spine top, but above top minus 30 mm.
      const crossings = yoke.flatMap(([a, b]) => {
        if (a[0] * b[0] > 0 || Math.abs(b[0] - a[0]) < 1e-8) return [];
        const t = -a[0] / (b[0] - a[0]);
        return [a[1] + t * (b[1] - a[1])];
      });
      expect(crossings.length).toBeGreaterThan(0);
      const bottom = Math.min(...crossings);
      expect(bottom).toBeLessThanOrEqual(joint[1] + 2e-6);
      expect(bottom).toBeGreaterThanOrEqual(joint[1] - 0.03);
    });
  }
  for (const side of [-1, 1]) {
    test(`yoke lower rail seat: gauge ${separation}, side ${side}`, () => {
      const mesh = generate({ ...defaults, configuration: "straight", separation });
      const z = -5.35 + 0.017;
      const rails = section(mesh, "rails", z), yoke = section(mesh, "ties", z);
      // Midpoints of BOTH lower dodecagon facets, not an ideal circle. A seat
      // follows these facets instead of passing a broad bar through the tube.
      for (const sign of [-1, 1]) {
        const seat: P = [side * separation / 2 + sign * 0.01625,
          1.5 - 0.065 * (1 + Math.sqrt(3) / 2) / 2];
        expect(boundaryDistance(seat, rails)).toBeLessThan(2e-6);
        expect(boundaryDistance(seat, yoke)).toBeLessThan(2e-5);
      }
    });
  }
}
