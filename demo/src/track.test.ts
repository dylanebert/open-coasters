import { expect, test } from "bun:test";
import {
  defaults,
  frame,
  generate,
  length,
  point,
  rotation,
  ties,
  type Configuration,
} from "./track";
import { qRotate } from "@dylanebert/shallot";
const near = (a: number[], b: number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));
for (const kind of ["straight", "curve", "loop"] as Configuration[]) {
  test(`${kind}: independent metric station count, spacing and unit orientation`, () => {
    const total =
      kind === "straight" ? 12 : kind === "curve" ? Math.PI * 4 : Math.PI * 6;
    expect(length(kind)).toBeCloseTo(total, 8);
    const stations = ties({ ...defaults, configuration: kind, spacing: 0.7 });
    const base = generate({ ...defaults, configuration: kind });
    for (const key of ["spacing", "separation", "width", "depth"] as const)
      expect(
        generate({
          ...defaults,
          configuration: kind,
          [key]: defaults[key] + 0.2,
        }).vertices,
      ).not.toEqual(base.vertices);
    // Independently establish the first cross-section axes (not frame()/point()).
    const c = Math.SQRT1_2,
      b = Math.sqrt(3) / 2;
    const origin =
      kind === "straight"
        ? [0, 1.5, -6]
        : kind === "curve"
          ? [8 * c - 6, 1.5, -8 * c]
          : [0, 1.5, 0];
    const across = kind === "curve" ? [c * b, 0.5, -c * b] : [1, 0, 0];
    const up = kind === "curve" ? [-c * 0.5, b, c * 0.5] : [0, 1, 0];
    const local = (vertex: number, axis: number[]) =>
      axis.reduce(
        (n, v, i) => n + (base.vertices[vertex * 8 + i] - origin[i]) * v,
        0,
      );
    // First rail begins at -separation/2 + radius; spine begins at -width/2, -0.22.
    expect(local(0, across)).toBeCloseTo(-0.5 + 0.065, 5);
    const start = 2 * 192 * 12 * 4;
    expect(local(start, across)).toBeCloseTo(-0.14, 5);
    expect(local(start, up)).toBeCloseTo(-0.22, 5);
    expect(local(start + 1, up)).toBeCloseTo(-0.57, 5);
    expect(stations.length).toBe(Math.ceil(total / 0.7));
    for (let i = 0; i < stations.length; i++) {
      const f = stations[i];
      const distance =
        kind === "straight"
          ? f.p[2] + 6
          : kind === "curve"
            ? 8 * (Math.atan2(f.p[2], f.p[0] + 6) + Math.PI / 4)
            : i * 0.7;
      expect(distance).toBeCloseTo(i * 0.7, 6);
      if (kind === "loop") {
        near(f.p, [
          0,
          4.5 - 3 * Math.cos((i * 0.7) / 3),
          3 * Math.sin((i * 0.7) / 3),
        ]);
        if (i > 0) {
          const previous = stations[i - 1].p;
          const cosine =
            ((4.5 - f.p[1]) * (4.5 - previous[1]) + f.p[2] * previous[2]) / 9;
          expect(3 * Math.acos(cosine)).toBeCloseTo(0.7, 6);
        }
      }
      for (const axis of [f.x, f.y, f.z])
        expect(Math.hypot(...axis)).toBeCloseTo(1, 8);
      expect(f.x.reduce((n, v, j) => n + v * f.y[j], 0)).toBeCloseTo(0, 8);
      near(qRotate(...rotation(f), 1, 0, 0), f.x);
      near(qRotate(...rotation(f), 0, 1, 0), f.y);
    }
  });
}
test("independent orientation landmarks: straight, 30 degree bank, inverted loop crown", () => {
  near(frame("straight", 6).p, [0, 1.5, 0]);
  near(frame("straight", 6).y, [0, 1, 0]);
  near(frame("curve", 2 * Math.PI).x, [Math.sqrt(3) / 2, 0.5, 0]);
  near(frame("curve", 2 * Math.PI).y, [-0.5, Math.sqrt(3) / 2, 0]);
  near(frame("loop", 3 * Math.PI).p, [0, 7.5, 0]);
  near(frame("loop", 3 * Math.PI).y, [0, -1, 0]);
  near(frame("loop", 3 * Math.PI).z, [0, 0, -1]);
});
test("generated dimensions are independently bounded and all controls affect actual vertices", () => {
  const p = { ...defaults, configuration: "straight" as const };
  const mesh = generate(p);
  const coords = (data: Float32Array, axis: number) =>
    Array.from({ length: data.length / 8 }, (_, i) => data[i * 8 + axis]);
  expect(Math.max(...coords(mesh.vertices, 0))).toBeCloseTo(0.65, 5);
  expect(Math.min(...coords(mesh.vertices, 1))).toBeCloseTo(
    1.5 - 0.22 - 0.35,
    5,
  );
  // Spine starts after two 192-segment, twelve-sided rails, four vertices per quad.
  const spine = mesh.vertices.slice(
    2 * 192 * 12 * 4 * 8,
    (2 * 192 * 12 * 4 + 192 * 4 * 4) * 8,
  );
  expect(
    Math.max(...coords(spine, 0)) - Math.min(...coords(spine, 0)),
  ).toBeCloseTo(0.28, 5);
  for (const key of ["spacing", "separation", "width", "depth"] as const)
    expect(generate({ ...p, [key]: p[key] + 0.2 }).vertices).not.toEqual(
      mesh.vertices,
    );
  expect(ties({ ...p, spacing: 1 }).length).toBe(12);
  expect(generate({ ...p, fixed: true }).vertices.length).toBeLessThan(
    mesh.vertices.length,
  );
  near(point(frame("loop", Math.PI * 3), 0, 0.2), [0, 7.3, 0]);
});
