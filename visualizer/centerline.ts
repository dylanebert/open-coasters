import { path } from './model';
import { view, project } from './view';

type V = [number, number, number];
const unit = (v: number[]) => v.map(n => n / Math.hypot(...v)) as V;
const cross = ([x,y,z]: V, [a,b,c]: V): V => [y*c-z*b,z*a-x*c,x*b-y*a];
export function courseColor(theme: 'light' | 'dark'): [number, number, number, number] {
  const rgb = theme === 'light' ? [195,196,189] : [81,83,77];
  return [...rgb.map(c => ((c/255 + .055)/1.055)**2.4), 1] as [number, number, number, number];
}

// Four target pixels, round ends, behind the ties. Undo only the accepted
// orthographic image-plane scaling; this is the still's illustrative stroke.
export function centerline() {
  const back = unit(view.camera.map((x,i) => x-view.target[i]!));
  const right = unit(cross([0,1,0], back));
  const up = cross(back, right);
  const scale = 2*view.size/view.height;
  const points = path.positions.map(p => project(p as V, view));
  const vertices: number[] = [], indices: number[] = [];
  function vertex(x: number, y: number) {
    const i = vertices.length / 8;
    vertices.push(...view.target.map((n,j) => n-3*back[j]!+scale*((x-view.width/2)*right[j]!-(y-view.height/2)*up[j]!)), ...back, 0, 0);
    return i;
  }
  for (let i=1;i<points.length;i++) {
    const [x,y] = points[i-1]!, [a,b] = points[i]!;
    const length = Math.hypot(a!-x!, b!-y!);
    const dx = 2*(b!-y!)/length, dy = 2*(x!-a!)/length;
    const k = vertex(x!+dx,y!+dy);
    vertex(x!-dx,y!-dy); vertex(a!-dx,b!-dy); vertex(a!+dx,b!+dy);
    indices.push(k,k+1,k+2,k,k+2,k+3);
  }
  for (const [x,y] of points) {
    const k = vertex(x!,y!);
    for (let i=0;i<16;i++) {
      const t = -i*Math.PI/8;
      vertex(x!+2*Math.cos(t),y!+2*Math.sin(t));
      indices.push(k,k+1+i,k+1+(i+1)%16);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
