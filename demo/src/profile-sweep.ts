// Local demo consumer, not a shared sweep/recipe contract.
import type { Profile } from './profile';
import { sectionTriangles } from './section-cap';
import { frame, length, point, type Configuration } from './track';

export const sweepIntervals = 192;

// One directed topology and one assignment of authored wall and outward cap
// normals. Consumers choose how to transport these local vertices to the path.
export function profileTopology(profile: Profile, capMaterial: number,
  vertex: (station: number, xy: readonly number[], nx: number, ny: number, nz: number) => void,
) {
  const indices: number[] = [], materials: number[] = [];
  let count = 0;
  for (const contour of profile.contours) for (const edge of contour) {
    const start = count;
    for (let station = 0; station <= sweepIntervals; station++) {
      vertex(station, profile.points[edge.from], ...edge.normals[0], 0);
      vertex(station, profile.points[edge.to], ...edge.normals[1], 0);
      count += 2;
    }
    for (let i = 0; i < sweepIntervals; i++) {
      const a = start + 2 * i;
      indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
      materials.push(edge.material, edge.material);
    }
  }
  for (const contour of profile.contours) {
    const section = contour.map(edge => profile.points[edge.from]);
    const triangles = sectionTriangles(section);
    for (const end of [0, 1]) {
      const start = count;
      for (const xy of section) {
        vertex(end * sweepIntervals, xy, 0, 0, end ? -1 : 1);
        count++;
      }
      for (const [a,b,c] of triangles) {
        indices.push(start+a, start+(end ? c : b), start+(end ? b : c));
        materials.push(capMaterial);
      }
    }
  }
  return { indices, materials };
}

export function sweepProfile(profile: Profile, configuration: Configuration, capMaterial: number,
  at = (s: number) => frame(configuration, s),
) {
  const positions: number[][] = [], normals: number[][] = [];
  const frames = Array.from({ length: sweepIntervals + 1 }, (_, i) => at(length(configuration) * i / sweepIntervals));
  const topology = profileTopology(profile, capMaterial, (station, [x, y], nx, ny, nz) => {
    const f = frames[station];
    positions.push(point(f, x, y));
    normals.push(nz ? f.z.map(v => v * nz) : f.x.map((v, a) => v * nx + f.y[a] * ny));
  });
  return { positions, normals, ...topology };
}
