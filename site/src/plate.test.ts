import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CameraMode } from '@dylanebert/shallot';
import sharp from 'sharp';
import { plate, source, annotations, annotationGeometry, project, palettes, cameraConfiguration, cameraTransform } from './plate';

test('one delivered tie retains archived positions, hierarchy, default material and tiny Z offset',()=>{
  const p=plate(), {json,positions}=source();
  expect(p.instances).toBe(1);
  expect(p.asset.pathname.endsWith('/demo/public/assets/blitz-tie.gltf')).toBe(true);
  expect(json.scenes[json.scene].nodes).toEqual([0]);
  expect(json.nodes).toEqual([{mesh:0,name:'ModernTie_Light'}]);
  expect(json.meshes).toHaveLength(1);
  expect(json.meshes[0].primitives).toHaveLength(1);
  expect(json.meshes[0].primitives[0].material).toBeUndefined();
  const archived=readFileSync(new URL('../../assets/blitz-tie/ModernTie_Light.obj',import.meta.url),'utf8').split('\n').filter(l=>l.startsWith('v ')).map(l=>l.trim().split(/\s+/).slice(1).map(Number));
  // Export splits vertices for normals: compare coordinates, not vertex order/count.
  for(const point of positions) expect(archived.some(v=>v.every((n,i)=>Math.abs(n-point[i]!)<.0000006))).toBe(true);
  for(const point of archived) expect(positions.some(v=>v.every((n,i)=>Math.abs(n-point[i]!)<.0000006))).toBe(true);
  const min=[0,1,2].map(i=>Math.min(...positions.map(v=>v[i]!)));
  const max=[0,1,2].map(i=>Math.max(...positions.map(v=>v[i]!)));
  expect(max.map((v,i)=>v-min[i]!)).toEqual([expect.closeTo(1.2,6),expect.closeTo(.1,6),expect.closeTo(.1,6)]);
  expect((min[2]!+max[2]!)/2).toBeCloseTo(.000001,9);
  expect(p.origin).toEqual([0,0,0]);
});

test('orthographic camera projects authored origin and local axes with one shared view',()=>{
  const p=plate();
  expect(p.mode).toBe('orthographic'); expect(p.size).toBe(.46);
  expect(p.camera).toEqual([1.1,.85,2.2]); expect(p.target).toEqual([0,0,0]);
  const a=annotationGeometry(p);
  expect(a.origin).toEqual([600,325]);
  expect(a.axes).toEqual(p.axes.map(v=>project(v,p)));
  expect(a.axes[0]![0]).toBeGreaterThan(600);
  expect(a.axes[1]![1]).toBeLessThan(325);
  expect(a.axes[2]![0]).toBeLessThan(600);
  const light=annotations(p,palettes.light.ink,palettes.light.bg),dark=annotations(p,palettes.dark.ink,palettes.dark.bg);
  expect(light.replaceAll(palettes.light.ink,'INK').replaceAll(palettes.light.bg,'BG')).toBe(dark.replaceAll(palettes.dark.ink,'INK').replaceAll(palettes.dark.bg,'BG'));
  expect(a.labels.map(l=>l.anchor)).toEqual(['start','middle','end']);
  for(const [i,label] of a.labels.entries()) {
    const endpoint=a.axes[i]!;
    expect(Math.hypot(label.x-endpoint[0]!,label.y-endpoint[1]!)).toBeCloseTo(24,8);
  }
  // The unchanged raw silhouette occupies x=205..994, y=228..421.
  expect(a.labels[0]!.x).toBeGreaterThan(1050);
  expect(a.labels[1]!.y).toBeLessThan(150);
  expect(a.labels[2]!.y).toBeGreaterThan(395);
  expect(a.labels[2]!.x).toBeLessThan(a.axes[2]![0]!-20);
  expect(a.originLabel).toEqual({x:600,y:390});
  for(const label of ['+X','+Y','+Z','>O<']) expect(light).toContain(label);
  expect(light).not.toContain('Path-local');
});

test('generated SVG uses grid axis colors on shafts and heads with neutral labels and origin',()=>{
  for(const theme of ['light','dark'] as const) {
    const {ink,bg}=palettes[theme], svg=annotations(plate(),ink,bg);
    const groups=[...svg.matchAll(/<g ([^>]+)>(.*?)<\/g>/g)];
    const shafts=[...groups[1]![2]!.matchAll(/<path ([^>]+)\/>/g)];
    for(const [i,color] of ['#cc241d','#6b9d65','#458588'].entries()) {
      expect(shafts[i]![1]).toContain(`stroke="${color}"`);
      const marker=shafts[i]![1]!.match(/marker-end="url\(#([^)]*)\)"/)![1];
      const head=svg.match(new RegExp(`<marker id="${marker}"[^>]*>(.*?)</marker>`))![1];
      expect(head).toContain(`fill="${color}"`);
    }
    expect(groups[0]![1]).toContain(`stroke="${bg}"`);
    expect(groups[0]![1]).toContain('stroke-width="5"');
    expect(groups[1]![1]).toContain(`stroke="${ink}"`);
    expect(groups[1]![2]).toMatch(new RegExp(`<circle [^>]*fill="${ink}"`));
    expect(groups[2]![1]).toContain(`fill="${ink}"`);
    expect([...groups[2]![2]!.matchAll(/<text [^>]*>(.*?)<\/text>/g)].map(m=>m[1])).toEqual(['+X','+Y','+Z','O']);
    expect(groups[2]![2]).not.toMatch(/(?:fill|stroke)=/);
    expect(ink).not.toBe(bg);
  }
});

test('native raw silhouettes match projected unchanged source bounds in both themes',async()=>{
  const p=plate(), {positions}=source();
  const projected=positions.map(v=>project(v as [number,number,number],p));
  const expected=[Math.min(...projected.map(v=>v[0]!)),Math.min(...projected.map(v=>v[1]!)),Math.max(...projected.map(v=>v[0]!)),Math.max(...projected.map(v=>v[1]!))];
  const masks: Buffer[]=[];
  for(const theme of ['light','dark']) {
    const {data,info}=await sharp(new URL(`../../assets/figures/tie-frame-${theme}-raw.png`,import.meta.url).pathname).raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([p.width,p.height]);
    const mask=Buffer.alloc(info.width*info.height);
    const bounds=[Infinity,Infinity,-Infinity,-Infinity];
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      const i=(y*info.width+x)*info.channels;
      if([0,1,2].some(c=>data[i+c]!==data[c])) {
        mask[y*info.width+x]=1;
        bounds[0]=Math.min(bounds[0]!,x); bounds[1]=Math.min(bounds[1]!,y);
        bounds[2]=Math.max(bounds[2]!,x); bounds[3]=Math.max(bounds[3]!,y);
      }
    }
    for(const i of [0,1,2,3]) expect(Math.abs(bounds[i]!-expected[i]!)).toBeLessThan(2);
    masks.push(mask);
  }
  expect(masks[0]!.equals(masks[1]!)).toBe(true);
});

test('consumed orthographic camera pose independently projects source landmarks and annotation anchors',()=>{
  const p=plate(), config=cameraConfiguration(p), pose=cameraTransform(p);
  expect(config).toEqual({mode:CameraMode.Orthographic,size:.46,near:.1,far:10});
  expect(pose.translation).toEqual([1.1,.85,2.2]);
  // Inverse quaternion rotation, independent of the overlay's dot/cross camera basis.
  const [qx,qy,qz,qw]=pose.rotation;
  const q=[-qx!,-qy!,-qz!];
  for(const point of [p.origin,...p.axes,[.6,0,.000001],[-.6,0,.000001],[0,.05,.000001]] as const) {
    const v=point.map((n,i)=>n-pose.translation[i]!);
    const t=[2*(q[1]!*v[2]!-q[2]!*v[1]!),2*(q[2]!*v[0]!-q[0]!*v[2]!),2*(q[0]!*v[1]!-q[1]!*v[0]!)];
    const x=v[0]!+qw!*t[0]!+q[1]!*t[2]!-q[2]!*t[1]!;
    const y=v[1]!+qw!*t[1]!+q[2]!*t[0]!-q[0]!*t[2]!;
    const expected=[p.width/2+x*p.height/(2*config.size),p.height/2-y*p.height/(2*config.size)];
    const actual=project(point as readonly [number,number,number],p);
    for(const i of [0,1]) expect(Math.abs(actual[i]!-expected[i]!)).toBeLessThan(.0001);
  }
  // Independently computed landmark: +X end-center, including authored Z offset.
  const end=project([.6,0,.000001],p);
  expect(end[0]).toBeCloseTo(979.15904,4);
  expect(end[1]).toBeCloseTo(386.92095,4);
});
