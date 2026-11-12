// App-local flat closure of one qualified CCW contour (no holes).
// Keep collinear boundary vertices: dropping them would leave wall T-junctions.
export function sectionTriangles(points: readonly (readonly number[])[]) {
  const turn = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
    (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const remaining = points.map((_,i)=>i), triangles: number[][] = [];
  while (remaining.length > 2) {
    let found = false;
    for (let j=0;j<remaining.length;j++) {
      const ids=[remaining[(j+remaining.length-1)%remaining.length],remaining[j],remaining[(j+1)%remaining.length]];
      const [a,b,c]=ids.map(i=>points[i]);
      if (turn(a,b,c)<=0) continue;
      if (remaining.some(i=>!ids.includes(i) && turn(a,b,points[i])>=0 && turn(b,c,points[i])>=0 && turn(c,a,points[i])>=0)) continue;
      triangles.push(ids); remaining.splice(j,1); found=true; break;
    }
    if (!found) throw new Error('Invalid section cap');
  }
  return triangles;
}
