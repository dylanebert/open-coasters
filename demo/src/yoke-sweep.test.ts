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
for (const configuration of ["straight","curve","loop"] as Configuration[]) {
  // Every corner of the independently specified control box, plus an interior
  // case. Spacing endpoints exercise different phases against the 192 rings;
  // the off-grid .65 case is retained rather than rounding ties to those rings.
  const cases = Array.from({length:16},(_,i)=>({
    separation: i&1 ? 1.6 : .6, width:i&2 ? .6 : .15,
    depth:i&4 ? .8 : .15, spacing:i&8 ? 1.5 : .3,
  }));
  cases.push({separation:1,width:.28,depth:.35,spacing:.65});
  for (const controls of cases) test(`${configuration}: finite yoke joints ${JSON.stringify(controls)}`,()=>{
    const p={...defaults,configuration,...controls}, mesh=generate(p);
    const rails=triangles(mesh,"rails"), spine=triangles(mesh,"spine"), bodies=groups(mesh,p), stations=ties(p);
    let contactError=0, railCrossings=0, badSpineCrossings=0, spineContacts=0, minArea=Infinity, minWinding=1;
    for (let station=0;station<stations.length;station++) {
      const body=bodies[station], f=stations[station];
      expect(body.length).toBeGreaterThan(0);
      const bounds=localBounds(body,p,station);
      expect(bounds[2][0]).toBeGreaterThan(-.065);
      expect(bounds[2][1]).toBeLessThan(.065);
      // A minimum-width web still reaches the top without approaching the
      // spine bottom. Neither width nor depth can hide a floating web.
      expect(bounds[1][0]).toBeLessThan(-.22+2e-5);
      expect(bounds[1][0]).toBeGreaterThan(-.25);
      for (const offset of [-.043,0,.043]) {
        const s=f.s+offset;
        if (s<0 || s>length(configuration)) continue;
        for (const side of [0,1]) for (const facet of [8,9]) for (const u of [.2,.5,.8]) {
          const pt=railPoint(rails,p,side,facet,s,u);
          contactError=Math.max(contactError,Math.min(...body.map(t=>triangleDistance(pt,t))));
        }
      }
      const first=Math.max(0,Math.floor((f.s-.2)/length(configuration)*192));
      const last=Math.min(191,Math.floor((f.s+.2)/length(configuration)*192));
      for (const t of body) {
        const a=sub(t[1],t[0]), b=sub(t[2],t[0]);
        const area=norm([a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]);
        minArea=Math.min(minArea,area);
        for (let segment=first;segment<=last;segment++) {
          for (const side of [0,1]) for (let j=0;j<24;j++) {
            const rail=rails[side*192*24+segment*24+j];
            if (!nearBoxes(t,rail)) continue;
            if (crossing(t,rail)) railCrossings++;
            // Coincident contact must oppose normals. Same-facing overlap
            // on a seat is exposed geometry, not an intentional internal seam.
            const n=normal(rail), tn=normal(t);
            if (Math.abs(dot(n,tn))>1-1e-6 && t.every(v=>Math.abs(dot(sub(v,rail[0]),n))<2e-6)) {
              const center=[0,1,2].map(k=>t.reduce((s,v)=>s+v[k],0)/3);
              if (triangleDistance(center,rail)<2e-6) minWinding=Math.min(minWinding,-dot(n,tn));
            }
          }
          for (let j=0;j<8;j++) {
            const other=spine[segment*8+j];
            if (!nearBoxes(t,other)) continue;
            const joint=crossing(t,other);
            if (!joint) continue;
            spineContacts++;
            const local=sub(joint,f.p);
            // Only the spine TOP may be crossed, inside a 130 mm web strip
            // and this tie's 130 mm longitudinal strip. Not a local-arc waiver.
            if (Math.floor(j/2)!==3 || Math.abs(dot(local,f.x))>.065 ||
                Math.abs(dot(local,f.z))>.065 || dot(local,f.y)<-.23 || dot(local,f.y)>-.21) badSpineCrossings++;
          }
        }
      }
    }
    expect(contactError).toBeLessThan(2e-5);
    expect(railCrossings).toBe(0);
    expect(spineContacts).toBeGreaterThan(0);
    expect(badSpineCrossings).toBe(0);
    expect(minArea).toBeGreaterThan(1e-10);
    expect(minWinding).toBeGreaterThan(.99999);
  });
}

for (const configuration of ["straight","curve","loop"] as Configuration[])
  test(`${configuration}: no transverse rail/yoke surface crossing`,()=>{
    const p={...defaults,configuration}, mesh=generate(p), rails=triangles(mesh,"rails"), bodies=groups(mesh,p);
    let count=0;
    for (let i=0;i<bodies.length;i++) {
      const first=Math.max(0,Math.floor((i*p.spacing-.2)/length(configuration)*192));
      const last=Math.min(191,Math.floor((i*p.spacing+.2)/length(configuration)*192));
      for (const t of bodies[i]) for (const side of [0,1])
        for (let j=first*24;j<(last+1)*24;j++) {
          const rail=rails[side*192*24+j];
          if (nearBoxes(t,rail) && crossing(t,rail)) count++;
        }
    }
    expect(count).toBe(0);
  });

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
