import { expect, test } from 'bun:test';
import { frame } from './track';
import { assemblyPath } from './assembly';
import { sampleFrames } from '../../construction/geometry';

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: canonical recorded crown centers X/Z without changing height`, () => {
  const station = 54.2626412148;
  const p = consumer === 'track' ? frame('loop', station).p : sampleFrames(assemblyPath('loop'), [station])[0].translation;
  expect(p[0]).toBeCloseTo(0, 10);
  expect(p[2]).toBeCloseTo(0, 10);
  expect(p[1]).toBeCloseTo(36.1375274566, 10);
});

for (const consumer of ['track', 'assembly'] as const) test(`${consumer}: rigid source landmarks preserve dimensions and clearance`, () => {
  const stations = [0, 54.2626412148, 108.5071019065];
  const positions = consumer === 'track' ? stations.map(s => frame('loop',s).p) : sampleFrames(assemblyPath('loop'),stations).map(f => f.translation);
  const expected = [[-2.2646225098,1.5,-11.6974685775],[0,36.1375274566,0],[2.2625457978,1.4984299634,11.7167229511]];
  for (let i=0;i<3;i++) for(let a=0;a<3;a++) expect(positions[i][a]).toBeCloseTo(expected[i][a],10);
  // Independent source displacement: both horizontal axes reverse, Y does not.
  const displacement = positions[2].map((v,i)=>v-positions[0][i]);
  expect(displacement[0]).toBeCloseTo(4.5271683076,10);
  expect(displacement[1]).toBeCloseTo(-.0015700366,10);
  expect(displacement[2]).toBeCloseTo(23.4141915286,10);
});
