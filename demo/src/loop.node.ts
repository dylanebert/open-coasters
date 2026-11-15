import { expect, test, setDefaultTimeout } from "bun:test";
import { TIMEOUT } from "@dylanebert/shallot/testing";
setDefaultTimeout(TIMEOUT.node);
import path from "./loop-path.json";
import { defaults, frame, generate } from "./track";
import { groups, localBounds } from "./yoke-oracle";

const dot = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const norm = (a: number[]) => Math.hypot(...a);
// Independently recorded crown source X; no production placement import.
const world = (p: number[]) => [-1.3319609173 - p[1], 1.5 + p[2], -5.3998784515 - p[3]];
// Independent source quaternion matrix columns, rigidly placed in world space.
const axes = (p: number[]) => {
  const [x, y, z, w] = p.slice(4);
  return {
    across: [
      1 - 2 * y * y - 2 * z * z,
      -(2 * x * y + 2 * z * w),
      2 * x * z - 2 * y * w,
    ],
    up: [
      -(2 * x * y - 2 * z * w),
      1 - 2 * x * x - 2 * z * z,
      -(2 * y * z + 2 * x * w),
    ],
    tangent: [
      2 * x * z + 2 * y * w,
      -(2 * y * z - 2 * x * w),
      1 - 2 * x * x - 2 * y * y,
    ],
  };
};
const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
const scale = (a: number[], k: number) => a.map((x) => x * k);
const clearanceMesh = (overrides: Partial<typeof defaults> = {}) =>
  generate({ ...defaults, configuration: "loop", ...overrides });

test("nonlocal emitted envelope: whole-interval ball separation", () => {
  // Reference curve: C1 cubic Hermite through recorded centers, with recorded
  // unit tangents. Bounds below use Bezier convex hulls, NOT a sampling claim.
  // This proves ONLY nonlocal separation. Euclidean containment does not prove
  // local mesh embedding; actual local pieces are checked separately below.
  const cells: { lo: number; hi: number; center: number[]; radius: number }[] =
    [];
  const beziers: number[][][] = [];
  let maxAcceleration = 0,
    maxSpeed = 1,
    sourceDeviation = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p = world(path[i]),
      q = world(path[i + 1]),
      h = path[i + 1][0] - path[i][0];
    const t = axes(path[i]).tangent,
      u = axes(path[i + 1]).tangent;
    const b = add(p, scale(t, h / 3)),
      c = sub(q, scale(u, h / 3));
    const d = scale(sub(c, b), 3 / h);
    const vmax = Math.max(norm(t), norm(d), norm(u));
    const acceleration = (2 * Math.max(norm(sub(d, t)), norm(sub(u, d)))) / h;
    maxAcceleration = Math.max(maxAcceleration, acceleration);
    maxSpeed = Math.max(maxSpeed, vmax);
    sourceDeviation = Math.max(
      sourceDeviation,
      norm(sub(b, add(scale(p, 2 / 3), scale(q, 1 / 3)))),
      norm(sub(c, add(scale(p, 1 / 3), scale(q, 2 / 3)))),
    );
    beziers.push([p, b, c, q]);
    const middle = scale(add(add(p, q), scale(add(b, c), 3)), 1 / 8);
    cells.push({
      lo: path[i][0],
      hi: path[i + 1][0],
      center: middle,
      radius: (vmax * h) / 2,
    });
  }
  const total = path.at(-1)![0],
    extension = 0.6;
  const first = world(path[0]),
    last = world(path.at(-1)!);
  const startT = axes(path[0]).tangent,
    endT = axes(path.at(-1)!).tangent;
  for (let i = 0; i < 12; i++) {
    const lo = (i * extension) / 12,
      hi = ((i + 1) * extension) / 12;
    cells.unshift({
      lo: -hi,
      hi: -lo,
      center: sub(first, scale(startT, (lo + hi) / 2)),
      radius: (hi - lo) / 2,
    });
    cells.push({
      lo: total + lo,
      hi: total + hi,
      center: add(last, scale(endT, (lo + hi) / 2)),
      radius: (hi - lo) / 2,
    });
  }
  // Every actual triangle is a convex combination of its corner vertices.
  // Adjustable spine/rail radii and tie corners; also encloses the isolated
  // light-tie witness. This envelope does NOT qualify the Modern assembly.
  const spineRadius = Math.hypot(0.6 / 2, 0.22 + 0.8);
  const railRadius = 1.6 / 2 + 0.065;
  const variableTieRadius = Math.hypot(1.6 / 2 + 0.15, 0.24, 0.055);
  const fixedTieRadius = Math.hypot(0.6, 0.05, 0.050001);
  const meshStep = total / 192;
  const roundoff = 1e-5; // Includes Float32 mesh coordinates and rounded JSON quaternions.
  const envelopeRadius =
    roundoff +
    Math.max(
      Math.max(spineRadius, railRadius) +
        sourceDeviation +
        (maxAcceleration * meshStep ** 2) / 8,
      Math.max(variableTieRadius, fixedTieRadius) + sourceDeviation,
    );
  const radius = 1.08;
  expect(envelopeRadius).toBeLessThan(radius);
  const reference = (s: number) => {
    let i = 0;
    while (i < path.length - 2 && path[i + 1][0] < s) i++;
    const t = (s - path[i][0]) / (path[i + 1][0] - path[i][0]);
    const weights = [
      (1 - t) ** 3,
      3 * t * (1 - t) ** 2,
      3 * t * t * (1 - t),
      t ** 3,
    ];
    return [0, 1, 2].map((k) =>
      beziers[i].reduce((sum, p, j) => sum + p[k] * weights[j], 0),
    );
  };
  // Audit actual emitted corners. Maximal spine/tie rectangles contain all
  // smaller widths/depths/spans; each rail vertex is affine in separation.
  // The radius bound above covers arbitrary stations, not a spacing snapshot.
  let worstCorner = { error: 0, vertex: -1, parameters: "" };
  const audit = (error: number, vertex: number, parameters: string) => {
    if (error > worstCorner.error) worstCorner = { error, vertex, parameters };
  };
  for (const separation of [0.6, 1.6]) {
    const width = 0.6, depth = 0.8, spacing = 0.3;
    const mesh = clearanceMesh({ separation, width, depth, spacing });
    const { vertices: v } = mesh;
    const parameters = `${separation}/${width}/${depth}/${spacing}`;
    let offset = 0;
    for (const sides of [12, 12, 4]) {
      if (sides===4) offset=mesh.parts.find(p=>p.name==='spine')!.vertex;
      for (let segment = 0; segment < 192; segment++) {
        const centers = [reference(segment * meshStep), reference((segment + 1) * meshStep)];
        for (let vertex = 0; vertex < sides * 6; vertex++) {
          const ring = [0, 0, 1, 0, 1, 1][vertex % 6];
          const p = Array.from(v.subarray((offset + vertex) * 8, (offset + vertex) * 8 + 3));
          audit(norm(sub(p, centers[ring])), offset + vertex, parameters);
        }
        offset += sides * 6;
      }
    }
    // Closure vertices are terminal ring corners too; audit each against its
    // own endpoint reference, not the next strip's old open-geometry offset.
    for (const part of mesh.parts.filter(p=>p.name!=='ties')) {
      const sides=part.name==='rails'?12:4, shells=part.name==='rails'?2:1;
      const start=part.vertex+shells*192*sides*6;
      for(let shell=0;shell<shells;shell++) for(let end=0;end<2;end++) for(let j=0;j<sides;j++) {
        const vertex=start+(shell*2+end)*sides+j;
        audit(norm(sub(Array.from(v.slice(vertex*8,vertex*8+3)),reference(end*total))),vertex,parameters);
      }
    }
    const p = { ...defaults, configuration: "loop" as const, separation, width, depth, spacing };
    for (const [station, body] of groups(mesh,p).entries()) {
      const center = reference(station * spacing);
      for (const triangle of body) for (const corner of triangle)
        audit(norm(sub(corner, center)), station, parameters);
    }
  }

  expect(worstCorner.error, JSON.stringify(worstCorner)).toBeLessThan(envelopeRadius);

  // Pairs omitted here are the obligation of the direct local-piece check.
  const neighborhood = 2.6;
  let clearance = Infinity,
    globalPairs = 0,
    localPairs = 0;
  for (let i = 0; i < cells.length; i++)
    for (let j = i; j < cells.length; j++) {
      const a = cells[i],
        b = cells[j];
      if (b.hi - a.lo <= neighborhood) {
        localPairs++;
        continue;
      }
      const margin =
        norm(sub(a.center, b.center)) - a.radius - b.radius - 2 * radius;
      clearance = Math.min(clearance, margin);
      globalPairs++;
    }
  console.info({
    maxSpeed,
    envelopeRadius,
    worstCorner,
    clearance,
    globalPairs,
    localPairs,
  });
  expect(clearance).toBeGreaterThan(0);
});

test("straight and curve: independent nonlocal envelope separation", () => {
  // Sweep corners have radius <= hypot(.3,1.02); a full tie (including its
  // terminal extension) fits .95 m. Convex triangles add at most the circular
  // chord sagitta, step²/(8*8), below the unchanged 1.08 m envelope.
  expect(Math.hypot(.3,1.02)+(4*Math.PI/192)**2/64).toBeLessThan(1.08);
  expect(Math.hypot(.8325,.24)+.055).toBeLessThan(.95);
  expect(2.6-2*1.08).toBeGreaterThan(0);
  expect(16*Math.sin(2.6/16)-2*1.08).toBeGreaterThan(0);
});

for (const configuration of ["straight", "curve", "loop"] as const)
 test(`${configuration}: local emitted pieces separate except bounded seats and web`, () => {
  const total = configuration === "straight" ? 12 : configuration === "curve" ? 4*Math.PI : path.at(-1)![0];
  const step = total / 192, epsilon = 1e-5;
  const small = generate({...defaults,configuration,separation:.6,width:.15,depth:.15,spacing:.3});
  const large = generate({...defaults,configuration,separation:1.6,width:.6,depth:.8,spacing:.3});
  const vertex = (v: Float32Array, i: number) => Array.from(v.subarray(i * 8, i * 8 + 3));
  type Piece = { lo: number; hi: number; points: number[][]; f: ReturnType<typeof frame>; guard: number; name: string };
  // Positions are affine in each profile control. The convex hull of actual
  // min/max-control ring corners therefore contains every supported chord face.
  // Rail/spine pieces are solids enclosing one section, not auxiliary normal disks.
  const sweeps: (Piece & { kind: number; segment: number })[] = [];
  const starts = [0, 192 * 72, small.parts.find(p=>p.name==='spine')!.index];
  for (let segment = 0; segment < 192; segment++)
    for (let kind = 0; kind < 3; kind++) {
      const sides = kind === 2 ? 4 : 12, points: number[][] = [];
      for (const v of [small, large])
        for (let side = 0; side < sides; side++)
          for (const corner of [0, 5])
            points.push(vertex(v.vertices, v.indices[starts[kind] + segment * sides * 6 + side * 6 + corner]));
      sweeps.push({ lo: segment * step, hi: (segment + 1) * step, points,
        f: frame(configuration, (segment + 0.5) * step), guard: epsilon,
        kind, segment, name: `${["left rail", "right rail", "spine"][kind]}:${segment}` });
    }
  const project = (points: number[][], axis: number[]) => {
    let lo = Infinity, hi = -Infinity;
    const [x, y, z] = axis;
    for (const p of points) {
      const n = p[0] * x + p[1] * y + p[2] * z;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    return [lo, hi];
  };
  // One positive projection gap is a separating plane for the ENTIRE convex
  // hulls, including the interiors of all emitted triangles (not just vertices).
  const gap = (a: Piece, b: Piece) => {
    const z = add(a.f.z, b.f.z), unit = scale(z, 1 / norm(z));
    let best = -Infinity;
    for (const axis of [unit, a.f.y, a.f.x, b.f.y, b.f.x]) {
      const aa = project(a.points, axis), bb = project(b.points, axis);
      const d = Math.max(bb[0] - aa[1], aa[0] - bb[1]) - a.guard - b.guard;
      if (d > 0.02) return d; // Stop at a useful plane, not the optimal one.
      best = Math.max(best, d);
    }
    return best;
  };
  let seamLeak = 0, seamAdvance = Infinity;
  for (let segment = 0; segment < 191; segment++)
    for (let kind = 0; kind < 3; kind++) {
      const a = sweeps[segment * 3 + kind], b = sweeps[(segment + 1) * 3 + kind];
      const seam = frame(configuration, a.hi);
      // Adjacent sections share only the ring-plane slab at mesh roundoff.
      // Every other ring corner must strictly advance, excluding folded-back
      // chord faces rather than exempting entire neighboring sections.
      for (const [piece, sign] of [[a, -1], [b, 1]] as const)
        for (let i = 0; i < piece.points.length; i++) {
          const d = sign * dot(sub(piece.points[i], seam.p), seam.z);
          const sharedRing = i % 2 === (sign === -1 ? 1 : 0);
          if (sharedRing) seamLeak = Math.max(seamLeak, Math.abs(d));
          else seamAdvance = Math.min(seamAdvance, d);
        }
    }
  let sweepGap = Infinity, sweepPair = "";
  for (let i = 0; i < sweeps.length; i++)
    for (let j = i + 1; j < sweeps.length; j++) {
      const a = sweeps[i], b = sweeps[j];
      if (b.lo - a.hi > 2.6) break; // All remaining parameter pairs have the nonlocal proof.
      if (a.kind === b.kind && b.segment === a.segment + 1) continue; // proved shared-ring joint above
      const d = gap(a, b);
      if (d < sweepGap) { sweepGap = d; sweepPair = `${a.name}/${b.name}`; }
    }

  // Two independently bounded pieces, not one exempt tie box. Arms (and the
  // isolated light-tie witness) stay above the spine; only the narrow web can
  // join it. These envelopes cover every gauge, independent of tessellation.
  const box = (x: number, bottom: number, top: number) =>
    [-x,x].flatMap(a => [bottom,top].flatMap(b => [-.055,.055].map(c => [a,b,c])));
  const arms = box(.95,-.18,.055), web = box(.05,-.24,-.12);
  const prototype = [...arms,...web];
  let tieBodyLeak = 0;
  // Bound every arbitrary tie station, not just .3 and 1.5 spacing snapshots.
  // The consumer is piecewise linear in position and normalized-lerp in rotation.
  let speedBound = 0, angularBound = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const h = path[i + 1][0] - path[i][0];
    speedBound = Math.max(speedBound, norm(sub(world(path[i + 1]), world(path[i]))) / h);
    const a = path[i].slice(4), b = path[i + 1].slice(4);
    const cosine = Math.min(1, Math.abs(dot(a, b)) / (norm(a) * norm(b)));
    angularBound = Math.max(angularBound, 4 * Math.tan(Math.acos(cosine) / 2) / h + 1e-6);
  }
  if (configuration !== "loop") { speedBound=1; angularBound=configuration === "curve" ? 1/8 : 0; }
  const radius = Math.max(...prototype.map(norm));
  // A normalized quaternion chord rotates about a fixed axis. With D=|q_raw'|
  // and eta=max|norm(q_raw)'|/D, |R''| <= 4(1+eta)D²/min|q_raw|².
  // Linear interpolation error also includes derivative jumps at source knots:
  // h² M/8 + h sum(jump)/4. This bounds finite 192-ring chords at ALL phases,
  // rather than estimating conformance from a few generated ties.
  const derivatives = path.slice(0,-1).map((a,i) => {
    const b=path[i+1], h=b[0]-a[0], qa=a.slice(4), qb=b.slice(4);
    if (dot(qa,qb)<0) for (let k=0;k<4;k++) qb[k]*=-1;
    const d=sub(qb,qa).map(x=>x/h);
    const derivative=(q:number[]) => {
      const n=norm(q), u=q.map(x=>x/n);
      return d.map((x,k)=>(x-u[k]*dot(u,d))/n);
    };
    const cosine=Math.abs(dot(qa,qb))/(norm(qa)*norm(qb));
    const minimum=Math.min(norm(qa),norm(qb))*Math.sqrt((1+cosine)/2);
    const eta=Math.max(Math.abs(dot(qa,d))/norm(qa),Math.abs(dot(qb,d))/norm(qb))/norm(d);
    return { velocity:scale(sub(world(b),world(a)),1/h), start:derivative(qa), end:derivative(qb), second:4*(1+eta)*norm(d)**2/minimum**2 };
  });
  let chordError=0;
  for (let segment=0;segment<192;segment++) {
    const lo=segment*step, hi=(segment+1)*step;
    let second=0, jumps=0;
    for (let i=0;i<derivatives.length;i++) {
      if (path[i+1][0]<lo || path[i][0]>hi) continue;
      second=Math.max(second,derivatives[i].second);
      if (i>0 && path[i][0]>lo && path[i][0]<hi)
        jumps+=norm(sub(derivatives[i].velocity,derivatives[i-1].velocity))+
          4*radius*norm(sub(derivatives[i].start,derivatives[i-1].end));
    }
    chordError=Math.max(chordError,radius*second*step**2/8+step*jumps/4);
  }
  // Triangulated facets differ from bilinear interpolation by at most a
  // quarter of the endpoint edge-vector change. The rail facet has length
  // below 34 mm; the separate spine bound uses its full 600 mm top edge.
  // Straight has no chord error. For the radius-eight circular path,
  // |(p+Rx)''| <= 1/8 + |x|/64 in metric arc coordinates.
  if (configuration !== "loop") chordError=configuration === "straight" ? 0 : (1/8+radius/64)*step**2/8;
  const facetError=step*angularBound*.034/4;
  const conformance=chordError+facetError+epsilon;
  let tangentError=0, sourceStep=0, acrossChange=0;
  for (let i=0;i<derivatives.length;i++) {
    sourceStep=Math.max(sourceStep,path[i+1][0]-path[i][0]);
    for (const j of [i,i+1]) tangentError=Math.max(tangentError,norm(sub(derivatives[i].velocity,axes(path[j]).tangent)));
  }
  tangentError=configuration === "loop" ? tangentError+angularBound*sourceStep/2 : 0;
  for (let i=0;i<192;i++) acrossChange=Math.max(acrossChange,norm(sub(frame(configuration,i*step).x,frame(configuration,(i+1)*step).x)));
  const positionFollowing=tangentError*.055+angularBound*.055**2/2;
  const following=(r:number) => conformance + angularBound*r*.055+positionFollowing;
  const bodyGuard=following(radius), webGuard=following(Math.hypot(.05,.24,.055));
  // Even the finite triangulation discrepancy leaves the 100 mm web inside
  // the minimum 150 mm spine and its 20 mm penetration below the 30 mm limit.
  const spineFacetError=acrossChange*.6/4;
  expect(.05+spineFacetError+conformance).toBeLessThan(.075);
  expect(.02+spineFacetError+conformance).toBeLessThan(.03);
  for (const separation of [.6,1.6]) {
    const p={...defaults,configuration,separation,spacing:.3};
    const bodies=groups(generate(p),p);
    for (let i=0;i<bodies.length;i++) {
      const b=localBounds(bodies[i],p,i);
      const expected=[[-.95,.95],[-.24,.055],[-.055,.055]];
      for (let k=0;k<3;k++) tieBodyLeak=Math.max(tieBodyLeak,expected[k][0]-b[k][0],b[k][1]-expected[k][1]);
    }
  }
  const cells = Math.ceil(total / 0.008), ties: (Piece & { arms: Piece; web: Piece })[] = [];
  for (let i = 0; i < cells; i++) {
    const lo = total * i / cells, hi = total * (i + 1) / cells, f = frame(configuration, (lo + hi) / 2);
    const piece=(body:number[][],r:number,extra:number):Piece => ({lo,hi,f,
      points:body.map(p => f.p.map((x,k)=>x+f.x[k]*p[0]+f.y[k]*p[1]+f.z[k]*p[2])),
      guard:(speedBound+angularBound*r)*(hi-lo)/2+extra+epsilon,
      name:`tie station:[${lo.toFixed(3)},${hi.toFixed(3)}]`});
    ties.push({...piece(prototype,radius,bodyGuard),arms:piece(arms,radius,bodyGuard),
      web:piece(web,Math.hypot(.05,.24,.055),webGuard)});
  }
  const extended = (s: number) => {
    const clamped = Math.max(0, Math.min(total, s)), f = frame(configuration, clamped);
    return { ...f, p: add(f.p, scale(f.z, s - clamped)) };
  };
  let tieGap = Infinity, tiePair = "", spineGap = Infinity, railGap = Infinity, attachmentMargin = Infinity;
  const attachmentHalf = 0.12;
  // Even the whole uncertain station cell's attachment strip is shorter than
  // minimum tie spacing; this is not a blanket local-arc joint exemption.
  expect(total / cells + 2 * attachmentHalf).toBeLessThan(0.3);
  for (let i = 0; i < ties.length; i++) {
    const a = ties[i];
    // Both rail seats and the narrow spine web are confined to this strip.
    // Arms must remain separate from the spine, including inside it.
    for (const [s, sign] of [[a.lo - attachmentHalf, 1], [a.hi + attachmentHalf, -1]]) {
      const plane = extended(s);
      for (const p of a.points)
        attachmentMargin = Math.min(attachmentMargin, sign * dot(sub(p, plane.p), plane.z) - a.guard);
    }
    for (let j = i + 1; j < ties.length; j++) {
      const b = ties[j];
      if (b.lo - a.hi > 2.6) break;
      if (b.hi - a.lo < 0.3 - 1e-10) continue; // distinct legal stations are at least .3 m apart
      const d = gap(a, b);
      if (d < tieGap) { tieGap = d; tiePair = `${a.name}/${b.name}`; }
    }
    for (const b of sweeps) {
      if (b.lo - a.hi > 2.6 || a.lo - b.hi > 2.6) continue;
      const joint=b.lo<=a.hi+attachmentHalf && b.hi>=a.lo-attachmentHalf;
      if (b.kind===2) {
        spineGap=Math.min(spineGap,gap(a.arms,b));
        if (!joint) spineGap=Math.min(spineGap,gap(a.web,b));
      } else if (!joint) railGap=Math.min(railGap,gap(a,b));
    }
  }
  console.info({ configuration, conformance, seamLeak, seamAdvance, sweepGap, sweepPair, tieBodyLeak, tieGap, tiePair, spineGap, railGap, attachmentMargin });
  expect(seamLeak).toBeLessThan(epsilon);
  expect(seamAdvance).toBeGreaterThan(epsilon);
  expect(sweepGap, sweepPair).toBeGreaterThan(0);
  expect(tieBodyLeak).toBeLessThan(bodyGuard);
  expect(tieGap, tiePair).toBeGreaterThan(0);
  expect(spineGap).toBeGreaterThan(0);
  expect(railGap).toBeGreaterThan(0);
  expect(attachmentMargin).toBeGreaterThan(0);
});

test("loop: independent component dimensions, midpoint landmark, and parameter isolation", () => {
  // Independent matrix reconstruction at the new metric midpoint.
  const origin = [3.527941183591029 - 3.5319609173, 14.846686750720252, 1.112765669446995];
  const across = [0.9546375921092585, 0.000945326610554788, 0.2977686586755503];
  const up = [0.0010066066297183312, -0.9999994919958399, -5.245145321893793e-05];
  const railVertices = 192 * 12 * 6;
  const components = (overrides: Partial<typeof defaults> = {}) => {
    const mesh = generate({ ...defaults, configuration: 'loop', ...overrides });
    const part=(name:string)=>{const p=mesh.parts.find(p=>p.name===name)!;return mesh.vertices.slice(p.vertex*8,p.endVertex*8);};
    return {rails:part('rails'),spine:part('spine'),ties:part('ties')};
  };
  const position = (v: Float32Array, i: number) =>
    Array.from(v.slice(i * 8, i * 8 + 3));
  const center = (v: Float32Array, ids: number[]) =>
    [0, 1, 2].map(
      (k) => ids.reduce((s, i) => s + v[i * 8 + k], 0) / ids.length,
    );
  const near = (a: number[], b: number[]) =>
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 5));
  const range = (v: Float32Array, ids: number[], axis: number[]) => {
    const p = ids.map((i) => dot(sub(position(v, i), origin), axis));
    return [Math.min(...p), Math.max(...p)];
  };
  const rails = (v: Float32Array, separation: number) => {
    for (const side of [0, 1]) {
      const ids = Array.from(
        { length: 12 },
        (_, j) => side * railVertices + 96 * 72 + j * 6,
      );
      near(
        center(v, ids),
        add(origin, scale(across, ((side ? 1 : -1) * separation) / 2)),
      );
      near(range(v, ids, across), [
        ((side ? 1 : -1) * separation) / 2 - 0.065,
        ((side ? 1 : -1) * separation) / 2 + 0.065,
      ]);
      near(range(v, ids, up), [-0.065, 0.065]);
    }
  };
  const spine = (v: Float32Array, width: number, depth: number) => {
    const ids = [0, 1, 2, 3].map((j) => 96 * 24 + j * 6);
    near(range(v, ids, across), [-width / 2, width / 2]);
    near(range(v, ids, up), [-0.22 - depth, -0.22]);
  };
  const tie = (overrides: Partial<typeof defaults>) => {
    const p={...defaults,configuration:"loop" as const,...overrides};
    const bodies=groups(generate(p),p);
    expect(bodies.length).toBe(Math.ceil(42.0726940244/p.spacing));
    for (let i=0;i<bodies.length;i++) {
      expect(bodies[i].length).toBeGreaterThan(0);
      const b=localBounds(bodies[i],p,i);
      expect(b[0][0]).toBeLessThan(-p.separation/2-.03);
      expect(b[0][1]).toBeGreaterThan(p.separation/2+.03);
      expect(b[0][0]).toBeGreaterThan(-p.separation/2-.066);
      expect(b[0][1]).toBeLessThan(p.separation/2+.066);
      expect(b[2][0]).toBeGreaterThan(-.065);
      expect(b[2][1]).toBeLessThan(.065);
      expect(b[2][1]-b[2][0]).toBeGreaterThan(.09);
      expect(Math.abs(b[2][0]+b[2][1])).toBeLessThan(.002);
    }
  };
  const base = components();
  for (const separation of [0.6, 1.4, 1.6]) {
    const c = components({ separation });
    rails(c.rails, separation);
    tie({ separation });
    expect(c.spine).toEqual(base.spine);
  }
  for (const width of [0.15, 0.5, 0.6]) {
    const c = components({ width });
    spine(c.spine, width, 0.35);
    expect(c.rails).toEqual(base.rails);
    expect(c.ties).toEqual(base.ties);
  }
  for (const depth of [0.15, 0.7, 0.8]) {
    const c = components({ depth });
    spine(c.spine, 0.28, depth);
    expect(c.rails).toEqual(base.rails);
    expect(c.ties).toEqual(base.ties);
  }
  for (const spacing of [0.3, 1.2, 1.5]) {
    const c = components({ spacing });
    tie({ spacing });
    expect(c.rails).toEqual(base.rails);
    expect(c.spine).toEqual(base.spine);
  }
  expect(() => components({ fixed: true })).toThrow('qualified profiles');
});
