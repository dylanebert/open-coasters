// Local demo consumer, not a shared sweep/recipe contract.
import type { Profile } from "./profile";
import { sectionTriangles } from "./section-cap";
import { frame, length, point, type Configuration } from "./track";

// 192 equal arc-length intervals; transport authored section normals by each
// orthonormal frame, not regenerated surface normals. Cap material is an explicit
// consumer choice, independent of the authored wall-edge materials.
export function sweepProfile(profile: Profile, configuration: Configuration, capMaterial: number) {
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
  for (const contour of profile.contours) {
    const section = contour.map(edge => profile.points[edge.from]);
    const triangles = sectionTriangles(section);
    for (const end of [0, 1]) {
      const f = frame(configuration, end * length(configuration));
      const start = positions.length;
      for (const xy of section) {
        positions.push(point(f, ...xy));
        normals.push(f.z.map(v => v * (end ? 1 : -1)));
      }
      for (const [a,b,c] of triangles) {
        indices.push(start+a, start+(end ? b : c), start+(end ? c : b));
        materials.push(capMaterial);
      }
    }
  }
  return { positions, normals, indices, materials };
}
