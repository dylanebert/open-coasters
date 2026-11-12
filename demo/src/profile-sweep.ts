// Local demo consumer, not a shared sweep/recipe contract.
import type { Profile } from "./profile";
import { frame, length, point, type Configuration } from "./track";

// 192 equal arc-length intervals; transport authored section normals by each
// orthonormal frame, not regenerated surface normals. Ends remain uncapped.
export function sweepProfile(profile: Profile, configuration: Configuration) {
  const positions: number[][] = [], normals: number[][] = [], indices: number[] = [], materials: number[] = [];
  for (const contour of profile.contours) for (const edge of contour) {
    const start = positions.length;
    for (let station = 0; station <= 192; station++) {
      const f = frame(configuration, length(configuration) * station / 192);
      for (const [i, id] of [edge.from, edge.to].entries()) {
        positions.push(point(f, ...profile.points[id]));
        const n = edge.normals[i];
        normals.push(f.x.map((x, a) => x * n[0] + f.y[a] * n[1]));
      }
    }
    for (let i = 0; i < 192; i++) {
      const a = start + 2 * i;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      materials.push(edge.material, edge.material);
    }
  }
  return { positions, normals, indices, materials };
}
