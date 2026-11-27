import { expect, test } from 'bun:test';
import { defaults, point } from '../src/track';
import { profileTopology, sweepIntervals } from '../src/profile-sweep';
import { loadWitness } from './long-track-capacity';
import { routeFixture, stripCounts } from './long-track-route';
import { revisions, spanLength, tieStations, worldPoint } from './long-track-span';

for (const metres of [1000,5000] as const) test(`${metres} m: stock-density strips, directed joins, exposed caps and global tie phase`, async () => {
  const {route,length,middle}=routeFixture(metres);
  expect(route).toHaveLength(metres/12.5);
  expect(length).toBe(12.5);
  expect(length).toBeLessThanOrEqual(spanLength);
  expect(route.reduce((sum,s)=>sum+s.length,0)).toBe(metres);
  expect(route[0].start).toBe(0);
  expect(route.at(-1)!.end).toBe(metres);
  expect(sweepIntervals).toBe(192);
  const {profiles}=await loadWitness();
  for(const [i,s] of route.entries()) {
    expect(s.caps).toEqual([i===0,i===route.length-1]);
    const prev=route[i-1];
    if(prev) expect(s.start).toBe(prev.end);
    for(const rev of revisions) {
      if (!prev) continue;
      const a=prev.at(-rev,length), b=s.at(rev,0);
      // Equality of the complete directed basis covers every profile edge at every join.
      expect([a.x,a.y,a.z]).toEqual([b.x,b.y,b.z]);
      const pa=worldPoint(prev,a.p), pb=worldPoint(s,b.p);
      for (let j=0;j<3;j++) expect(pa[j]).toBeCloseTo(pb[j],11);
      if ([1,middle,route.length-1].includes(i)) for (const profile of Object.values(profiles)) {
        for (const contour of profile.contours) for (const edge of contour) {
          for (const [k,v] of [edge.from,edge.to].entries()) {
            const xy=profile.points[v], [nx,ny]=edge.normals[k];
            const pa=worldPoint(prev,point(a,...xy)), pb=worldPoint(s,point(b,...xy));
            for (let j=0;j<3;j++) expect(pa[j]).toBeCloseTo(pb[j],11);
            expect(a.x.map((x,j)=>x*nx+a.y[j]*ny)).toEqual(b.x.map((x,j)=>x*nx+b.y[j]*ny));
          }
        }
      }
    }
  }
  // Every span uses the same scaled arc; sample its full station grid once per revision.
  for (const rev of revisions) {
    let prior=route[middle].at(rev,0).p, distance=0;
    for(let j=1;j<=sweepIntervals;j++) {
      const p=route[middle].at(rev,length*j/sweepIntervals).p;
      const ds=Math.hypot(...p.map((x,k)=>x-prior[k]));
      expect(ds).toBeCloseTo(length/192,7);
      distance+=ds; prior=p;
    }
    expect(distance).toBeCloseTo(length,5);
  }
  for(const profile of Object.values(profiles)) for (const i of [0,middle,route.length-1]) {
    const {caps}=route[i], count=stripCounts(profile,caps), capStations:number[]=[];
    const walls=stripCounts(profile,[false,false]).vertices;
    let vertices=0;
    const {indices}=profileTopology(profile,0,s=>{if(vertices++>=walls) capStations.push(s);},caps);
    expect({vertices,indices:indices.length}).toEqual(count);
    expect([...new Set(capStations)]).toEqual(i===0?[0]:i===middle?[]:[sweepIntervals]);
  }
  expect(route.flatMap(tieStations)).toEqual(Array.from({length:Math.ceil(metres/defaults.spacing)},(_,i)=>i*defaults.spacing));
});
