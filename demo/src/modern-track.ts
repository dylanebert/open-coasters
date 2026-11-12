// App-local assembly of qualified, unscaled Modern contributions. No source style rules.
import { loadProfile, type Profile } from './profile';
import { sweepProfile } from './profile-sweep';
import { generate, type Parameters } from './track';

export function modernProfiles(assetUrl: (name: string) => URL) {
  let cached: Promise<Profile[]> | undefined;
  return () => cached ??= Promise.all(['ModernRail', 'ModernSpine_1', 'ModernSpine_2'].map(name => loadProfile(assetUrl(name))));
}
export function assembleModern(p: Parameters, profiles: Profile[]) {
  const vertices: number[] = [], indices: number[] = [];
  const parts: ReturnType<typeof generate>['parts'] = [];
  for (const [name, sections] of [['rails', [profiles[0]]], ['spine', p.secondSpine ? profiles.slice(1) : [profiles[1]]]] as const) {
    const vertex = vertices.length / 8, index = indices.length;
    for (const profile of sections) {
      // Qualified Blitz sections have one default-material slot. Both that
      // slot and the generated caps are painted by this rail/spine part owner.
      const mesh = sweepProfile(profile, p.configuration, 0);
      const offset = vertices.length / 8;
      mesh.positions.forEach((position, i) => vertices.push(...position, 0, ...mesh.normals[i], 0));
      indices.push(...mesh.indices.map(i => i + offset));
    }
    parts.push({ name, vertex, index, endVertex: vertices.length / 8, endIndex: indices.length });
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), parts };
}
export function trackGeometry(assetUrl: (name: string) => URL) {
  const profiles = modernProfiles(assetUrl);
  return async (p: Parameters) => p.fixed ? assembleModern(p, await profiles()) : generate(p);
}
export const modernTies = (p: Parameters) => p.secondSpine ? ['ModernTie_Med', 'ModernTie_Dense'] : ['ModernTie_Med'];
