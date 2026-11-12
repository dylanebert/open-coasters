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
import { groups, localBounds } from "./yoke-oracle";
const near = (a: number[], b: number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));
for (const kind of ["straight", "curve"] as Configuration[]) {
  test(`${kind}: independent metric station count, spacing and unit orientation`, () => {
    const total = kind === "straight" ? 12 : Math.PI * 4;
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
      kind === "straight" ? [0, 1.5, -6] : [8 * c - 6, 1.5, -8 * c];
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
          : 8 * (Math.atan2(f.p[2], f.p[0] + 6) + Math.PI / 4);
      expect(distance).toBeCloseTo(i * 0.7, 6);
      for (const axis of [f.x, f.y, f.z])
        expect(Math.hypot(...axis)).toBeCloseTo(1, 8);
      expect(f.x.reduce((n, v, j) => n + v * f.y[j], 0)).toBeCloseTo(0, 8);
      near(qRotate(...rotation(f), 1, 0, 0), f.x);
      near(qRotate(...rotation(f), 0, 1, 0), f.y);
    }
  });
}
// Inspect component slices, not just whether any vertex changed. These offsets
// describe the emitted mesh layout; expected dimensions below are metric literals.
for (const configuration of ["straight", "curve"] as Configuration[]) {
  test(`${configuration}: non-default dimensions and parameter isolation`, () => {
    const railVertices = 192 * 12 * 4;
    const spineStart = 2 * railVertices;
    const tieStart = spineStart + 192 * 4 * 4;
    const components = (overrides: Partial<typeof defaults> = {}) => {
      const mesh = generate({ ...defaults, configuration, ...overrides });
      return {
        rails: mesh.vertices.slice(0, spineStart * 8),
        spine: mesh.vertices.slice(spineStart * 8, tieStart * 8),
        ties: mesh.vertices.slice(tieStart * 8),
      };
    };
    const position = (data: Float32Array, vertex: number) =>
      Array.from(data.slice(vertex * 8, vertex * 8 + 3));
    const center = (data: Float32Array, vertices: number[]) =>
      [0, 1, 2].map(
        (axis) =>
          vertices.reduce((sum, vertex) => sum + data[vertex * 8 + axis], 0) /
          vertices.length,
      );
    // Midpoint landmarks: straight center and banked arc bisector.
    // No production frame/point helper is used to measure the generated mesh.
    const origin = configuration === "curve" ? [2, 1.5, 0] : [0, 1.5, 0];
    const across =
      configuration === "curve" ? [Math.sqrt(3) / 2, 0.5, 0] : [1, 0, 0];
    const up =
      configuration === "curve" ? [-0.5, Math.sqrt(3) / 2, 0] : [0, 1, 0];
    const range = (data: Float32Array, vertices: number[], axis: number[]) => {
      const projected = vertices.map((vertex) =>
        position(data, vertex).reduce(
          (sum, value, i) => sum + (value - origin[i]) * axis[i],
          0,
        ),
      );
      return [Math.min(...projected), Math.max(...projected)];
    };
    const spineRing = [0, 1, 2, 3].map((side) => 96 * 16 + side * 4);
    const checkSpine = (
      data: Float32Array,
      halfWidth: number,
      bottom: number,
    ) => {
      near(range(data, spineRing, across), [-halfWidth, halfWidth]);
      near(range(data, spineRing, up), [bottom, -0.22]);
    };
    const checkRails = (data: Float32Array, halfSeparation: number) => {
      for (const [side, sign] of [
        [0, -1],
        [1, 1],
      ]) {
        const ring = Array.from(
          { length: 12 },
          (_, i) => side * railVertices + 96 * 48 + i * 4,
        );
        // Rail centers establish both separation and unchanged path position.
        near(
          center(data, ring),
          origin.map((v, i) => v + sign * halfSeparation * across[i]),
        );
        near(range(data, ring, across), [
          sign * halfSeparation - 0.065,
          sign * halfSeparation + 0.065,
        ]);
        near(range(data, ring, up), [-0.065, 0.065]);
      }
    };
    const checkTie = (overrides: Partial<typeof defaults> = {}) => {
      const p = { ...defaults, configuration, ...overrides };
      const bodies = groups(generate(p), p);
      expect(bodies.length).toBe(Math.ceil((configuration === "straight" ? 12 : 4*Math.PI) / p.spacing));
      for (let i=0;i<bodies.length;i++) {
        expect(bodies[i].length).toBeGreaterThan(0);
        const bounds=localBounds(bodies[i],p,i);
        expect(bounds[0][0]).toBeLessThan(-p.separation/2-.032);
        expect(bounds[0][1]).toBeGreaterThan(p.separation/2+.032);
        expect(bounds[0][0]).toBeGreaterThan(-p.separation/2-.066);
        expect(bounds[0][1]).toBeLessThan(p.separation/2+.066);
        expect(bounds[2][0]).toBeGreaterThan(-.065);
        expect(bounds[2][1]).toBeLessThan(.065);
        expect(bounds[2][1]-bounds[2][0]).toBeGreaterThan(.09);
        // The first cap extends along the terminal tangent, while its other
        // cap follows the finite sweep. Only interior ties are symmetric.
        if (i>0) expect(Math.abs(bounds[2][0]+bounds[2][1])).toBeLessThan(.002);
      }
      return bodies;
    };
    const base = components();
    const separated = components({ separation: 1.4 });
    checkRails(separated.rails, 0.7);
    checkTie({ separation: 1.4 });
    expect(separated.spine).toEqual(base.spine);
    // Separation changes seat span, not the independently counted stations.
    checkTie();
    const wider = components({ width: 0.5 });
    checkSpine(wider.spine, 0.25, -0.57); // 0.50 wide, still 0.35 deep
    expect(wider.rails).toEqual(base.rails);
    expect(wider.ties).toEqual(base.ties);
    const deeper = components({ depth: 0.7 });
    checkSpine(deeper.spine, 0.14, -0.92); // still 0.28 wide, 0.70 deep
    expect(deeper.rails).toEqual(base.rails);
    expect(deeper.ties).toEqual(base.ties);
    const spaced = components({ spacing: 1.2 });
    expect(spaced.rails).toEqual(base.rails);
    expect(spaced.spine).toEqual(base.spine);
    const spacedBodies = checkTie({ spacing: 1.2 });
    expect(spacedBodies.length).toBe(configuration === "straight" ? 10 : 11);
    // Independent 1.2 m station landmarks: 1.2/8 = 0.15 rad on
    // the horizontal radius-8 arc.
    const secondStation =
      configuration === "straight"
        ? [0, 1.5, -4.8]
        : [0.438683608715, 1.5, -4.747984139278];
    const tangent = configuration === "straight" ? [0,0,1] : [0.59349801741,0,0.80483545109];
    const projected=spacedBodies[1].flatMap(t=>t.map(v=>v.reduce((sum,x,k)=>sum+(x-secondStation[k])*tangent[k],0)));
    expect(Math.abs(Math.min(...projected)+Math.max(...projected))).toBeLessThan(.002);
  });
}
test("independent orientation landmarks: straight and 30 degree bank", () => {
  near(frame("straight", 6).p, [0, 1.5, 0]);
  near(frame("straight", 6).y, [0, 1, 0]);
  near(frame("curve", 2 * Math.PI).x, [Math.sqrt(3) / 2, 0.5, 0]);
  near(frame("curve", 2 * Math.PI).y, [-0.5, Math.sqrt(3) / 2, 0]);
});
test("generated dimensions are independently bounded and all controls affect actual vertices", () => {
  const p = { ...defaults, configuration: "straight" as const };
  const mesh = generate(p);
  const coords = (data: Float32Array, axis: number) =>
    Array.from({ length: data.length / 8 }, (_, i) => data[i * 8 + axis]);
  expect(Math.max(...coords(mesh.vertices, 0))).toBeCloseTo(0.565, 5);
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
  expect(() => generate({ ...p, fixed: true })).toThrow('qualified profiles');
  near(point(frame("straight", 6), 0, 0.2), [0, 1.7, 0]);
});

for (const configuration of ["straight", "curve", "loop"] as Configuration[])
  test(`${configuration}: Shallot packed normals are unit and follow face winding`, () => {
    const { vertices: v, indices } = generate({ ...defaults, configuration });
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 8,
        b = indices[t + 1] * 8,
        c = indices[t + 2] * 8;
      const u = [0, 1, 2].map((i) => v[b + i] - v[a + i]);
      const w = [0, 1, 2].map((i) => v[c + i] - v[a + i]);
      const cross = [
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      ];
      const size = Math.hypot(...cross);
      for (const offset of [a, b, c]) {
        // Shallot: px,py,pz,u,nx,ny,nz,v.
        const n = [v[offset + 4], v[offset + 5], v[offset + 6]];
        expect(Math.hypot(...n)).toBeCloseTo(1, 5);
        expect(
          n.reduce((sum, x, i) => sum + (x * cross[i]) / size, 0),
        ).toBeCloseTo(1, 5);
      }
    }
  });
