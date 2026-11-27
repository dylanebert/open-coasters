import { rotate, type Frame } from '../construction/geometry';
import { path } from './model';

export const axisColors = ['#cc241d', '#6b9d65', '#458588'] as const;
export const sampleColors = [axisColors[0], axisColors[2]] as const;
type Vec = readonly [number, number, number];
type View = {camera: Vec; target: Vec; width: number; height: number; size: number};
const dot = (a: Vec, b: Vec) => a.reduce((s,v,i)=>s+v*b[i]!,0);
const cross = (a: Vec,b: Vec): Vec => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = (v: Vec): Vec => v.map(x=>x/Math.hypot(...v)) as unknown as Vec;
export const contextCamera = { camera: [1.1, 1.5, 2.2] as const, target: [0, 0, -.25] as const };
export const view = { camera: [-.85, 2.40, -2] as const, target: [.25, .32, .45] as const, width: 1080, height: 680, size: 1.92 };

export function project(v: Vec, p: View) {
  const back=unit(p.camera.map((v,i)=>v-p.target[i]!) as unknown as Vec);
  const right=unit(cross([0,1,0],back)), up=cross(back,right);
  const relative=v.map((v,i)=>v-p.target[i]!) as unknown as Vec;
  return [p.width/2+dot(relative,right)*p.height/(2*p.size),p.height/2-dot(relative,up)*p.height/(2*p.size)];
}

type Point = Parameters<typeof project>[0];
const point = (v: readonly number[]) => v as Point;

const pixel = (p: readonly number[]) => project(point(p), view);
export const frameGlyphs = path.positions.flatMap((position, i) => i % 2 ? [] : [{
  distance: path.distances[i]!,
  origin: pixel(position),
  endpoints: ([[.073, 0, 0], [0, .073, 0]] as const).map(offset =>
    pixel(rotate(path.rotations[i]!, offset).map((n, j) => position[j]! + n))),
}]);
export const course = `M${path.positions.map(pixel).join('L')}`;

export function sceneGeometry(pose: Frame, distance: number) {
  const at = (offset: Point) => pixel(rotate(pose.rotation, offset).map((n, i) => n + pose.translation[i]!));
  return {
    course,
    // Leave room ahead for the painted −Z arrow, which follows the same tangent.
    glyphs: frameGlyphs.filter(frame => frame.distance < distance - .25 || frame.distance > distance + .72)
      .map(({ origin, endpoints }) => endpoints.map(end => `M${origin}L${end}`)),
    origin: at([0, 0, 0]),
    axes: ([[.73, 0, 0], [0, .31, 0], [0, 0, -.63]] as const).map(at),
  };
}
