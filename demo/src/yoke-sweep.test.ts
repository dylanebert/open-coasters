import { expect, test } from "bun:test";
import { defaults, frame, generate, length, ties, type Configuration } from "./track";
import { crossing, dot, groups, localBounds, norm, normal, railPoint, sub, triangleDistance, triangles, type Triangle } from "./yoke-oracle";

function nearBoxes(a: Triangle,b: Triangle) {
  for (let k=0;k<3;k++) {
    if (Math.max(a[0][k],a[1][k],a[2][k])+2e-6<Math.min(b[0][k],b[1][k],b[2][k]) ||
        Math.max(b[0][k],b[1][k],b[2][k])+2e-6<Math.min(a[0][k],a[1][k],a[2][k])) return false;
  }
  return true;
}
test("seat oracle rejects a flat ledge through the two symmetric facet midpoints",()=>{
  // Independent counterexample: the old 110 mm-deep box lowered so its TOP
  // meets both midpoint witnesses. It satisfies those two distances but cuts
  // both sloping facets. Do not let two symmetric samples define shaped seats.
  const p={...defaults,configuration:"straight" as const};
  const rails=triangles(generate(p),"rails");
  const y=1.5-.065*(1+Math.sqrt(3)/2)/2, z=-5.35;
  const ledge: Triangle[]=[
    [[-.65,y,z-.055],[.65,y,z-.055],[.65,y,z+.055]],
    [[-.65,y,z-.055],[.65,y,z+.055],[-.65,y,z+.055]],
  ];
  let count=0;
  for (const t of ledge) for (const rail of rails) if (nearBoxes(t,rail) && crossing(t,rail)) count++;
  expect(count).toBeGreaterThan(0);
  for (const side of [-1,1]) for (const sign of [-1,1]) {
    const midpoint=[side*.5+sign*.01625,y,z];
    expect(Math.min(...ledge.map(t=>triangleDistance(midpoint,t)))).toBeLessThan(1e-7);
  }
});
