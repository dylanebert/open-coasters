import { expect, test } from 'bun:test';
import { loadProfile } from '../src/profile';
import { sweepIntervals, sweepProfile } from '../src/profile-sweep';
import { arc, asset, sectionAssets } from '../src/track-deformation-oracle';
import { interval, revisions, routeStart, spanLength, spans, spacing, tiePoses, tieStations, worldPoint } from './long-track-span';

const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v,i)=>v-b[i]));
const stationCount = sweepIntervals + 1;

function checkSeam(a: ReturnType<typeof sweepProfile>, b: typeof a, edges: number) {
  for (let e=0; e<edges; e++) for (const side of [0,1]) {
    const next = e*stationCount*2+side, prev = next+2*sweepIntervals;
    if (distance(worldPoint(spans[0],a.positions[prev]),worldPoint(spans[1],b.positions[next]))>2e-12 ||
        distance(a.normals[prev],b.normals[next])>1e-12) throw Error('directed wall seam');
  }
}

function checkPhase(stations: number[], start: number, end: number) {
  // Independent oracle: count backwards from the last station before 5 km.
  const expected: number[] = [];
  for (let i=7692; i*0.65>=routeStart; i--) if (i*.65>=start && i*.65<end) expected.unshift(i*.65);
  if (stations.length !== expected.length || stations.some((s,i)=>s!==expected[i])) throw Error('global tie phase');
}

test('two stock-sized spans keep the directed stock wall and only exposed caps', async () => {
  expect(interval).toBeLessThan(.06545);
  for (const name of sectionAssets) {
    const profile = await loadProfile(asset(name));
    const edges = profile.contours.flat().length, walls = edges*sweepIntervals*6, capBase = edges*stationCount*2;
    const stock = sweepProfile(profile,'curve',0,arc(8));
    const stockWall = stock.indices.slice(0,walls);
    for (let e=0; e<edges; e++) for (let s=0; s<sweepIntervals; s++) {
      const at=(e*sweepIntervals+s)*6, a=2*(e*stationCount+s);
      if ([a,a+3,a+1,a,a+2,a+3].some((id,k)=>stockWall[at+k]!==id)) throw Error('stock wall winding');
    }
    for (const revision of revisions) {
      const meshes = spans.map(span=>sweepProfile(profile,'curve',0,s=>span.at(revision,s),span.caps));
      for (let i=0; i<2; i++) {
        const span = spans[i], mesh = meshes[i];
        const directed = stockWall.slice();
        let source = walls, base = capBase, nextCap = capBase;
        for (const contour of profile.contours) {
          const n = contour.length, perCap = 3*(n-2);
          directed.push(...stock.indices.slice(source+i*perCap,source+(i+1)*perCap).map(id=>id-base-i*n+nextCap));
          source += 2*perCap;
          base += 2*n;
          nextCap += n;
        }
        expect(mesh.indices).toEqual(directed);
        expect(mesh.positions.length).toBe(capBase+edges);
        const cap = span.at(revision,i*spanLength).z.map(v=>i?-v:v);
        for (const normal of mesh.normals.slice(capBase)) expect(normal).toEqual(cap);
        for (let k=walls; k<directed.length; k+=3) {
          const [a,b,c] = mesh.indices.slice(k,k+3).map(id=>mesh.positions[id]);
          const signedArea = ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))*cap[2];
          if (!(signedArea>0)) throw Error('exposed cap winding');
        }
        for (const [e,edge] of profile.contours.flat().entries()) {
          const station = sweepIntervals/2, {x,y} = span.at(revision,station*interval);
          for (const [side,[nx,ny]] of edge.normals.entries()) {
            const n = mesh.normals[2*(e*stationCount+station)+side];
            if (distance(n,x.map((v,a)=>v*nx+y[a]*ny))>1e-12) throw Error('authored wall normal');
          }
        }
        const radius = Math.max(...profile.points.map(p=>Math.hypot(...p)))+.001;
        const {center,half} = span.range(radius);
        const max = [spanLength/2+radius,radius,spanLength/2+radius];
        expect(half.every((v,a)=>v<=max[a])).toBe(true);
        expect(mesh.positions.every(p=>p.every((v,a)=>Math.abs(v-center[a])<=half[a]+1e-12))).toBe(true);
      }
      checkSeam(meshes[0],meshes[1],edges);
      meshes[1].positions[0][0] += .001;
      expect(()=>checkSeam(meshes[0],meshes[1],edges)).toThrow('directed wall seam');
      meshes[1].positions[0][0] -= .001;
      meshes[1].normals[0][1] += .001;
      expect(()=>checkSeam(meshes[0],meshes[1],edges)).toThrow('directed wall seam');
    }
  }
});

test('edit moves the interior at fixed arc distance, keeping both endpoints and the global tie phase', () => {
  const [moving,neighbor] = spans;
  for (const span of spans) {
    checkPhase(tieStations(span),span.start,span.end);
    expect(()=>checkPhase(tieStations(span).map((_,i)=>span.start+i*spacing),span.start,span.end)).toThrow('global tie phase');
    for (const roll of revisions) {
      expect(span.at(roll,0)).toEqual(span.at(0,0));
      expect(span.at(roll,spanLength)).toEqual(span.at(0,spanLength));
      const ds=spanLength/1024;
      for (let i=0; i<1024; i++) {
        const a=span.at(roll,i*ds).p, b=span.at(roll,(i+1)*ds).p;
        expect(Math.abs(distance(a,b)-ds)).toBeLessThan(4e-11);
      }
    }
  }
  for (const roll of revisions.slice(1)) {
    expect(distance(moving.at(0,spanLength/2).p,moving.at(roll,spanLength/2).p)).toBeGreaterThan(.07);
    expect(tiePoses(moving,roll)).not.toEqual(tiePoses(moving,0));
    expect(tiePoses(neighbor,roll)).toEqual(tiePoses(neighbor,0));
  }
});
