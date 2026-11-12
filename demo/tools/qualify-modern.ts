// One-time comparison artifact, not an app entrypoint or expected-data generator.
import { loadProfile } from "../src/profile";
import { sweepProfile } from "../src/profile-sweep";
const result = [];
for (const name of ["ModernRail", "ModernSpine_1", "ModernSpine_2"]) {
  const profile = await loadProfile(new URL(`../public/assets/${name}.gltf`, import.meta.url));
  for (const kind of ["straight", "curve", "loop"] as const) {
    const mesh = sweepProfile(profile, kind, 0);
    result.push({ name, kind, edges: profile.contours.flat().map((edge, i) => ({
      a: profile.points[edge.from], b: profile.points[edge.to], material: edge.material,
      positions: mesh.positions.slice(i * 386, (i + 1) * 386),
      normals: mesh.normals.slice(i * 386, (i + 1) * 386),
    })), indices: mesh.indices.slice(0, profile.contours.flat().length * 192 * 6), materials: mesh.materials.slice(0, profile.contours.flat().length * 192 * 2) });
  }
}
await Bun.write(process.argv[2] ?? "/tmp/modern-ts.json", JSON.stringify(result));
