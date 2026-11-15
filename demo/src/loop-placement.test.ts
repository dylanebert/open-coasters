import { expect, test } from 'bun:test';
import { frame } from './track';
import { assemblyPath } from './assembly';
import { framesAt } from '../../construction/geometry';

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: canonical recorded crown centers X/Z without changing height`, () => {
  const station = 49.5683087109;
  const p = consumer === 'track' ? frame('loop', station).p : framesAt(assemblyPath('loop'), [station])[0].translation;
  expect(p[0]).toBeCloseTo(0, 10);
  expect(p[2]).toBeCloseTo(0, 10);
  expect(p[1]).toBeCloseTo(28.4866316669, 10);
});

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: rigid source landmarks preserve dimensions and clearance`, () => {
  const stations = [0, 49.5683087109, 99.1912231532];
  const positions = consumer === 'track' ? stations.map(s => frame('loop',s).p) : framesAt(assemblyPath('loop'),stations).map(f => f.translation);
  const expected = [[-6.0293982646,1.5,-9.2212609908],[0,28.4866316669,0],[6.0537630852,1.500068641,9.1629157672]];
  for (let i=0;i<3;i++) for(let a=0;a<3;a++) expect(positions[i][a]).toBeCloseTo(expected[i][a],10);
  // Independent source displacement: both horizontal axes reverse, Y does not.
  const displacement = positions[2].map((v,i)=>v-positions[0][i]);
  expect(displacement[0]).toBeCloseTo(12.0831613498,10);
  expect(displacement[1]).toBeCloseTo(.000068641,10);
  expect(displacement[2]).toBeCloseTo(18.384176758,10);
});
