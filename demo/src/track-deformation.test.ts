import { expect, test } from 'bun:test';
import { loadGltf } from '@dylanebert/shallot/gltf';
import { staticInstanceSnapshot } from './instance';
import { loadProfile } from './profile';
import { sweepIntervals } from './profile-sweep';
import { replayCurvature, replayFrame, replayLength, restCurvature, peakCurvature } from './track-deformation';
import { defaults, frame, ties, point } from './track';
import { arc, asset, nativePoint, posePoint, replaySamples, sectionAssets } from './track-deformation-oracle';

const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v*b[i], 0);
const delta = (a: number[], b: number[]) => a.map((v,i) => v-b[i]);

test('undeformed replay begins, ends and holds at the stock curve', () => {
  expect(replayLength).toBe(4*Math.PI);
  expect(sweepIntervals).toBe(192);
  for (const t of [0, 1, 7, 8, 60]) {
    expect(replayCurvature(t), `${t}s: exact stock curvature`).toBe(restCurvature);
    for (let i=0; i<=192; i++) {
      const s = i*replayLength/192;
      expect(replayFrame(replayCurvature(t))(s), `${t}s station ${i}`).toEqual(frame('curve', s));
    }
  }
  const curve = Array.from({length: 601}, (_, i) => replayCurvature(1+i/100));
  expect(Math.min(...curve)).toBe(1/8);
  expect(Math.max(...curve)).toBe(1/6);
  expect(peakCurvature).toBe(1/6);
  for(let i=1; i<curve.length; i++) {
    expect(i<=300 ? curve[i]>curve[i-1] : curve[i]<curve[i-1]).toBe(true);
    expect(Math.abs(curve[i]-curve[i-1])).toBeLessThan(.00022);
  }
});

test('arc, handed banked frames, tie stations and grid clearance across the replay', async () => {
  const profiles = await Promise.all(sectionAssets.map(name => loadProfile(asset(name))));
  const native = await loadGltf(await staticInstanceSnapshot(asset('ModernTie_Med')));
  expect(native.instances.length).toBeGreaterThan(0);
  expect(native.unsupported).toEqual([]);
  const nativeCorners = native.instances.flatMap(instance => {
    const v = native.meshes[instance.mesh].vertices;
    return Array.from({length:v.length/8}, (_, i) => nativePoint(instance.matrix, v[i*8], v[i*8+1], v[i*8+2]));
  });
  for (const {name, time, radius} of replaySamples) {
    const at = replayFrame(replayCurvature(time)), independent = arc(radius);
    expect(at(replayLength/2).p, name).toEqual([2,1.5,0]);
    const chord = 2*radius*Math.sin(replayLength/(192*2*radius));
    for (let i=0; i<=192; i++) {
      const s = i*replayLength/192, label = `${name} station ${i}`;
      const {p,x,y,z} = at(s), want = independent(s);
      for (const [a,b] of [[p,want.p],[x,want.x],[y,want.y],[z,want.z]])
        expect(Math.hypot(...delta(a,b)), label).toBeLessThan(1e-13);
      const cross = [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
      expect(dot(cross,z), label).toBeCloseTo(1, 12);
      expect(y[1], label).toBeCloseTo(Math.sqrt(3)/2, 12);
      if (i) {
        const d = delta(p, at(s-replayLength/192).p);
        expect(Math.hypot(...d), label).toBeCloseTo(chord, 12);
        expect(dot(d, at(s-replayLength/384).z), label).toBeCloseTo(-chord, 12);
      }
      profiles.forEach((profile, j) => {
        const bottom = Math.min(...profile.points.map(xy => point(at(s), ...xy)[1]));
        expect(bottom, `${label} ${sectionAssets[j]} clearance`).toBeGreaterThan(0);
      });
    }
    const placed = ties({...defaults, fixed:true}, at);
    expect(placed, `${name} tie count`).toHaveLength(20);
    placed.forEach((f,i) => {
      const label = `${name} ModernTie_Med ${i}`;
      expect(f.s, label).toBe(i*.65);
      expect(f.s, label).toBeLessThan(replayLength);
      expect(Math.hypot(...delta(f.p, independent(i*.65).p)), label).toBeLessThan(1e-13);
      let bottom = Infinity;
      for (const corner of nativeCorners) bottom = Math.min(bottom, posePoint(f, corner)[1]);
      expect(bottom, `${label} clearance`).toBeGreaterThan(0);
    });
  }
  expect(Math.hypot(...delta(arc(6)(0).p, arc(8)(0).p))).toBeGreaterThan(.7);
});
