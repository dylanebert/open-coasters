import { expect, test } from 'bun:test';
import { frame } from './track';
import { assemblyPath } from './assembly';
import { framesAt } from '../../construction/geometry';

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: canonical recorded crown centers X/Z without changing height`, () => {
  const station = 54.8508587804;
  const p = consumer === 'track' ? frame('loop', station).p : framesAt(assemblyPath('loop'), [station])[0].translation;
  expect(p[0]).toBeCloseTo(0, 10);
  expect(p[2]).toBeCloseTo(0, 10);
  expect(p[1]).toBeCloseTo(36.3105593073, 10);
});

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: rigid source landmarks preserve dimensions and clearance`, () => {
  const stations = [0, 54.8508587804, 109.7358630474];
  const positions = consumer === 'track' ? stations.map(s => frame('loop',s).p) : framesAt(assemblyPath('loop'),stations).map(f => f.translation);
  const expected = [[-3.4596492374,1.5,-14.1325386361],[0,36.3105593073,0],[3.4735265193,1.5029916025,14.0948083013]];
  for (let i=0;i<3;i++) for(let a=0;a<3;a++) expect(positions[i][a]).toBeCloseTo(expected[i][a],10);
  // Independent source displacement: both horizontal axes reverse, Y does not.
  const displacement = positions[2].map((v,i)=>v-positions[0][i]);
  expect(displacement[0]).toBeCloseTo(6.9331757567,10);
  expect(displacement[1]).toBeCloseTo(.0029916025,10);
  expect(displacement[2]).toBeCloseTo(28.2273469374,10);
});
