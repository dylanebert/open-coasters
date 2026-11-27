import { expect, test } from 'bun:test';
import { defaults } from '../src/track';
import { profileTopology, sweepIntervals } from '../src/profile-sweep';
import { loadWitness } from './long-track-capacity';
import { length, metres, route } from './long-track-route';
import { revisions, spanLength, tieStations, worldPoint } from './long-track-span';

test('1 km uniform profile strips, shared boundary frames, only route caps and global tie phase', async () => {
  expect(route).toHaveLength(80);
  expect(length).toBeLessThanOrEqual(spanLength);
  expect(route.reduce((s,span)=>s+span.length,0)).toBe(1000);
  expect(route[0].start).toBe(0);
  expect(route.at(-1)!.end).toBe(1000);
  expect(sweepIntervals).toBe(192);
  expect(route.length*sweepIntervals).toBe(15360);
  const {profiles}=await loadWitness();
  for(const [i,s] of route.entries()) {
    expect(s.caps).toEqual([i===0,i===route.length-1]);
    if(i) expect(s.start).toBe(route[i-1].end);
    for(const rev of revisions) {
      if(i) {
        const prev=route[i-1], a=prev.at(-rev,length), b=s.at(rev,0);
        expect([a.x,a.y,a.z]).toEqual([b.x,b.y,b.z]);
        expect(worldPoint(prev,a.p)[2]).toBeCloseTo(worldPoint(s,b.p)[2],11);
      }
      let prior=s.at(rev,0).p, distance=0;
      for(let j=1;j<=sweepIntervals;j++) {
        const p=s.at(rev,length*j/sweepIntervals).p;
        const ds=Math.hypot(...p.map((x,k)=>x-prior[k]));
        expect(ds).toBeCloseTo(length/192,7);
        distance+=ds; prior=p;
      }
      expect(distance).toBeCloseTo(length,5);
    }
  }
  for(const profile of Object.values(profiles)) {
    const indices=(caps: readonly [boolean,boolean])=>profileTopology(profile,0,()=>{},caps).indices.length;
    const walls=profile.contours.flat().length*192*6;
    expect(indices([false,false])).toBe(walls);
    expect(route.reduce((n,s)=>n+indices(s.caps),0)).toBe((route.length-1)*walls+indices([true,true]));
  }
  expect(route.flatMap(tieStations)).toEqual(Array.from({length:Math.ceil(metres/defaults.spacing)},(_,i)=>i*defaults.spacing));
});
