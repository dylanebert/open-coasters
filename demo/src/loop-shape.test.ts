import { expect, test } from 'bun:test';
import path from './loop-path.json';

// Selected approximate D snapshot, independently measured before activation:
// placement-shape-study/heuristic/D/metrics.json. Not a realism predicate.
test('selected D example: crown height', () => {
  expect(Math.max(...path.map(p=>p[2]))-path[0][2]).toBeCloseTo(34.6375274566,9);
});
test('selected D example: lateral and longitudinal footprint', () => {
  const spans = [1,2,3].map(k=>Math.max(...path.map(p=>p[k]))-Math.min(...path.map(p=>p[k])));
  [4.5271683076,34.6390974932,23.4141915286].forEach((v,i)=>expect(spans[i]).toBeCloseTo(v,9));
});
test('selected D example: body branch proportions', () => {
  const crown = path.reduce((i,p,j)=>p[2]>path[i][2]?j:i,0);
  const rise = path[crown][2]-path[0][2];
  for (const [fraction,side,lateral] of [[.25,14.081426771290946,4.480242331254599],[.5,21.652221146771787,4.202331173427892],[.75,20.745276393451192,3.4287674077775594],[.9,14.870472835590313,2.370645665047397],[.99,5.003434759589624,.7923895658641102]]) {
    const h=path[0][2]+fraction*rise;
    const intersections:number[][]=[];
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i];
      if ((a[2]<h && b[2]>=h)||(a[2]>=h && b[2]<h)) {
        const t=(h-a[2])/(b[2]-a[2]);
        intersections.push([a[1]+t*(b[1]-a[1]),a[3]+t*(b[3]-a[3])]);
      }
    }
    expect(intersections.length).toBe(2);
    expect(Math.abs(intersections[1][1]-intersections[0][1])/rise).toBeCloseTo(side/34.6375274566,9);
    expect(Math.abs(intersections[1][0]-intersections[0][0])).toBeCloseTo(lateral,9);
  }
});
