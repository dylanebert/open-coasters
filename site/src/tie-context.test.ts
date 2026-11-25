import {test,expect} from 'bun:test';
import {plate,source,project,annotationGeometry,annotations,palettes,cameraConfiguration,cameraTransform} from './plate';
import sharp from 'sharp';
import {contextPlate,placed,selected,tieOffsets,ghostColor,rails} from './tie-context';
test('rigid reuse retains source metres and origin; only one foreground tie',()=>{
 const p=contextPlate(), original=source().positions;
 expect(tieOffsets.filter(z=>z===selected[2])).toHaveLength(1);
 expect(p.origin).toEqual(selected);
 for(const v of original) { const out=placed(v,selected[2]); expect(out.slice(0,2)).toEqual(v.slice(0,2)); expect(out[2]-v[2]!).toBeCloseTo(selected[2],12); }
 expect(p.axes).toEqual(plate().axes.map(v=>placed(v,selected[2])));
 expect(annotationGeometry(p).origin).toEqual(project(selected,p));
 for(const theme of ['light','dark'] as const) {
  expect(ghostColor(theme)[3]).toBe(1);
  expect(annotations(p,palettes[theme].ink,palettes[theme].bg)).toContain('font-size="46"');
 }
 expect(rails().indices.length).toBe(72);
 // Stacked phone panel is 350px: native labels remain over 13px.
 expect(46*350/p.width).toBeGreaterThan(13);
});
test('placed local anchors agree with native camera inverse quaternion',()=>{
 const p=contextPlate(), pose=cameraTransform(p), config=cameraConfiguration(p);
 const [qx,qy,qz,qw]=pose.rotation, q=[-qx!,-qy!,-qz!];
 for(const local of [plate().origin,...plate().axes,...source().positions]) {
  const point=placed(local,selected[2]), v=point.map((n,i)=>n-pose.translation[i]!);
  const t=[2*(q[1]!*v[2]!-q[2]!*v[1]!),2*(q[2]!*v[0]!-q[0]!*v[2]!),2*(q[0]!*v[1]!-q[1]!*v[0]!)];
  const x=v[0]!+qw!*t[0]!+q[1]!*t[2]!-q[2]!*t[1]!;
  const y=v[1]!+qw!*t[1]!+q[2]!*t[0]!-q[0]!*t[2]!;
  const expected=[p.width/2+x*p.height/(2*config.size),p.height/2-y*p.height/(2*config.size)];
  const actual=project(point,p);
  expected.forEach((n,i)=>expect(actual[i]).toBeCloseTo(n,4));
 }
});
test('native context silhouettes and foreground emphasis agree in both themes',async()=>{
 const p=contextPlate(), vertices=source().positions;
 const points=tieOffsets.flatMap(z=>vertices.map(v=>placed(v,z)));
 const rail=rails().vertices;
 for(let i=0;i<rail.length;i+=8) points.push([rail[i]!,rail[i+1]!,rail[i+2]!]);
 const projected=points.map(v=>project(v,p));
 const expected=[Math.min(...projected.map(v=>v[0]!)),Math.min(...projected.map(v=>v[1]!)),Math.max(...projected.map(v=>v[0]!)),Math.max(...projected.map(v=>v[1]!))];
 const masks:Buffer[]=[];
 for(const theme of ['light','dark'] as const) {
  const {data,info}=await sharp(new URL(`../../assets/figures/tie-context-${theme}-raw.png`,import.meta.url).pathname).raw().toBuffer({resolveWithObject:true});
  expect([info.width,info.height]).toEqual([p.width,p.height]);
  const mask=Buffer.alloc(p.width*p.height), bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++) {
   const i=(y*p.width+x)*info.channels;
   if([0,1,2].some(c=>data[i+c]!==data[c])) {mask[y*p.width+x]=1;bounds[0]=Math.min(bounds[0]!,x);bounds[1]=Math.min(bounds[1]!,y);bounds[2]=Math.max(bounds[2]!,x);bounds[3]=Math.max(bounds[3]!,y);}
  }
  expected.forEach((n,i)=>expect(Math.abs(bounds[i]!-n)).toBeLessThan(2));
  const sample=(z:number)=>{const [x,y]=project([0,.05,z+.000001],p);const i=(Math.round(y!)*p.width+Math.round(x!))*info.channels;return (data[i]!+data[i+1]!+data[i+2]!)/3;};
  const foreground=sample(selected[2]), ghost=sample(-.65);
  if(theme==='light') expect(ghost-foreground).toBeGreaterThan(20);
  else expect(foreground-ghost).toBeGreaterThan(70);
  masks.push(mask);
 }
 expect(masks[0]!.equals(masks[1]!)).toBe(true);
});
