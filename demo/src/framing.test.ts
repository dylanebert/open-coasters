import { expect, test } from "bun:test";
import { geometryCenter } from "./scene";
import { defaults, generate } from "./track";

test("initial target follows asymmetric geometry bounds, not the origin", () => {
  const vertices = new Float32Array([
    -2, 3, 5, 0, 0, 0, 0, 0,
    12, 17, 9, 0, 0, 0, 0, 0,
    4, 6, 7, 0, 0, 0, 0, 0,
  ]);
  expect(geometryCenter(vertices)).toEqual([5, 10, 7]);
});

test("geometry center follows each preset's parameterized bounds", () => {
  for (const configuration of ["straight", "curve", "loop"] as const) {
    const mesh = generate({ ...defaults, configuration, separation: 1.7, depth: 0.7 });
    const center = geometryCenter(mesh.vertices);
    for (let axis = 0; axis < 3; axis++) {
      const positions = Array.from(mesh.vertices).filter((_, i) => i % 8 === axis);
      expect(center[axis]).toBe((Math.min(...positions) + Math.max(...positions)) / 2);
    }
  }
});
