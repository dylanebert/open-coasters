import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { CameraMode } from '@dylanebert/shallot';
import sharp from 'sharp';
import polygon from './profile-polygon.json';
import { contour, profileView, strokes, overlay, project, palettes, cameraConfiguration, cameraTransform, annotationGeometry, nativeInputs } from './profile-plate';
import { axisColors } from './plate';
import { nativeIdentity, sha256, assertNativeIdentity, withFinalHashes, type ProfileEvidence } from './profile-evidence';
import { recomposeProfile } from '../scripts/profile-annotations';

test('explicit illustrative 12-edge CCW cycle centered at O has declared dimensions; broken/reversed topology fails',()=>{
  const points=contour();expect(points).toHaveLength(12);
  expect(polygon.edges).toEqual(points.map((_,i)=>[i,(i+1)%12]));
  expect(points.reduce((s,a,i)=>{const b=points[(i+1)%12]!;return s+a[0]*b[1]-a[1]*b[0];},0)).toBeCloseTo(.54,12);
  for(const a of points) {expect(Math.hypot(a[0],a[1])).toBeCloseTo(.3,12);expect(a[2]).toBe(0);}
  for(const i of [0,1]) {
    expect(Math.min(...points.map(p=>p[i]!))).toBe(-.3);expect(Math.max(...points.map(p=>p[i]!))).toBe(.3);
    expect(points.reduce((s,p)=>s+p[i]!,0)).toBeCloseTo(0,12);
  }
  const broken=structuredClone(polygon);broken.edges[11]=[11,1];expect(()=>contour(broken)).toThrow('Broken directed cycle');
  expect(()=>contour({...polygon,points:[...polygon.points].reverse()})).toThrow('CCW');
  const reordered=structuredClone(polygon);[reordered.points[1],reordered.points[2]]=[reordered.points[2]!,reordered.points[1]!];expect(()=>contour(reordered)).toThrow();
  const mesh=strokes();expect(mesh.indices.length).toBe(12*6);expect(mesh.vertices.length).toBe(12*4*8);
  for(let i=2;i<mesh.vertices.length;i+=8) expect(mesh.vertices[i]).toBe(0);
});

test('consumed orthographic camera is normal to XY; projected through-axes and theme placements agree',()=>{
  const p=profileView();expect(p.origin).toEqual([0,0,0]);expect(cameraConfiguration(p)).toEqual({mode:CameraMode.Orthographic,size:.46,near:.1,far:10});
  const pose=cameraTransform(p);expect(pose.translation).toEqual([0,0,2]);expect(pose.rotation).toEqual([0,0,0,1]);
  for(const point of [p.origin,...contour(),...p.axes]) {
    const actual=project(point,p);expect(actual[0]).toBeCloseTo(450+point[0]*900/.92,8);expect(actual[1]).toBeCloseTo(450-point[1]*900/.92,8);
  }
  const a=annotationGeometry();expect(a.origin).toEqual([450,450]);
  for(const axis of a.axes) {expect(axis.positive[0]!+axis.negative[0]!).toBe(900);expect(axis.positive[1]!+axis.negative[1]!).toBe(900);}
  expect(overlay('light').replaceAll(palettes.light.ink,'INK')).toBe(overlay('dark').replaceAll(palettes.dark.ink,'INK'));
  for(const match of overlay('light').matchAll(/<text x="([^"]+)" y="([^"]+)"/g)) {
    expect(Number(match[1])).toBeGreaterThan(40);expect(Number(match[1])).toBeLessThan(850);
    expect(Number(match[2])).toBeGreaterThan(40);expect(Number(match[2])).toBeLessThan(850);
  }
  expect(overlay('light')).not.toContain('polygon');
});

function emptyInterior(data:Buffer,channels:number) {
  let count=0;
  for(let y=200;y<700;y++) for(let x=200;x<700;x++) if(Math.hypot(x-450,y-450)<250) {
    count++;for(let c=0;c<3;c++) if(data[(y*900+x)*channels+c]!==data[c]) throw Error('Filled profile interior');
  }
  expect(count).toBeGreaterThan(190000);
}
test('native outline has empty interior; final projected contour, dots and colored through-axes match',async()=>{
  const masks:Buffer[]=[];
  for(const theme of ['light','dark'] as const) for(const suffix of ['-raw','']) {
    const {data,info}=await sharp(new URL(`../../assets/figures/profile-${theme}${suffix}.png`,import.meta.url).pathname).raw().toBuffer({resolveWithObject:true});
    expect([info.width,info.height]).toEqual([900,900]);
    if(suffix) {
      emptyInterior(data,info.channels);
      const filled=Buffer.from(data);filled[(450*900+450)*info.channels]=255-data[0]!;
      expect(()=>emptyInterior(filled,info.channels)).toThrow('Filled profile interior');
    }
    const mask=Buffer.alloc(900*900);
    for(let i=0;i<mask.length;i++) mask[i]=[0,1,2].some(c=>data[i*info.channels+c]!==data[c])?1:0;
    for(const [i,a] of contour().entries()) {
      const b=contour()[(i+1)%12]!;
      for(const t of [0,.25,.5,.75,1]) {
        const q=project([a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t,0],profileView());let hit=false;
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) if(mask[(Math.round(q[1]!)+dy)*900+Math.round(q[0]!)+dx])hit=true;
        expect(hit).toBe(true);
      }
    }
    if(suffix) {
      masks.push(mask);
      let minRadius=Infinity,maxRadius=0;
      for(let y=0;y<900;y++) for(let x=0;x<900;x++) if(mask[y*900+x]) {
        const r=Math.hypot(x-450,y-450);minRadius=Math.min(minRadius,r);maxRadius=Math.max(maxRadius,r);
      }
      expect(minRadius).toBeGreaterThan(280);expect(maxRadius).toBeLessThan(296);
    } else {
      const pixel=(x:number,y:number)=>[0,1,2].map(c=>data[(Math.round(y)*900+Math.round(x))*info.channels+c]);
      const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
      for(const a of contour()) {
        const q=project(a,profileView());
        expect(pixel(q[0]!,q[1]!)).toEqual(rgb(palettes[theme].ink));
        // The outer dot pixels are antialiased; require substantial ink coverage
        // beyond the 1.15px half-stroke, not exact solid color at the fringe.
        for(const sign of [-1,1]) {
          const fringe=pixel(q[0]!+sign*2*a[0]/.3,q[1]!-sign*2*a[1]/.3);
          expect(Math.max(...fringe.map((c,i)=>Math.abs(c!-rgb(palettes[theme].ink)[i]!)))).toBeLessThan(120);
        }
      }
      // Positive and negative portions cross the shape, with colored +Z at O.
      for(const offset of [-330,-200,-80,80,200,330]) {
        expect(pixel(450+offset,450)).toEqual(rgb(axisColors[0]));
        expect(pixel(450,450+offset)).toEqual(rgb(axisColors[1]));
      }
      expect(pixel(805,446)).toEqual(rgb(axisColors[0])); // Positive arrowhead wing, not shaft.
      expect(pixel(446,95)).toEqual(rgb(axisColors[1]));
      expect(pixel(450,450)).toEqual(rgb(axisColors[2]));
      expect(pixel(450,441)).toEqual(rgb(axisColors[2]));
    }
  }
  expect(masks[0]!.equals(masks[1]!)).toBe(true);
});

test('capture identity rejects stale geometry/view but not annotation-only changes; recorded profile hashes agree',()=>{
  const evidence=JSON.parse(readFileSync(new URL('../../assets/figures/profile-capture.json',import.meta.url),'utf8')) as ProfileEvidence;
  assertNativeIdentity(evidence);expect(evidence.inputs).toEqual(nativeInputs());
  const changed=structuredClone(nativeInputs());changed.polygon.points[0]![0]=.31;
  expect(()=>assertNativeIdentity({...evidence,nativeIdentity:nativeIdentity(changed)})).toThrow('Stale profile geometry/view');
  expect(()=>assertNativeIdentity({...evidence,nativeIdentity:nativeIdentity({...nativeInputs(),view:{...nativeInputs().view,size:.5}})})).toThrow('Stale profile geometry/view');
  expect(Object.keys(evidence.sha256).sort()).toEqual(['profile-dark-raw.png','profile-dark.png','profile-light-raw.png','profile-light.png']);
  for(const [path,hash] of Object.entries(evidence.sha256)) expect(sha256(readFileSync(new URL(`../../assets/figures/${path}`,import.meta.url)))).toBe(hash);
  const updated=withFinalHashes(evidence,{'profile-light.png':'new-derived-hash'})!;
  expect(updated).toEqual({...evidence,sha256:{...evidence.sha256,'profile-light.png':'new-derived-hash'}});
  expect(withFinalHashes(undefined,{'profile-light.png':'first'})).toBeUndefined();
  expect(()=>withFinalHashes(evidence,{'profile-light-raw.png':'oops'})).toThrow();
});

test('CPU recomposition writes final hashes, preserves native evidence, and tolerates no initial manifest',async()=>{
  const directory=await mkdtemp(`${tmpdir()}/profile-annotations-`),root=pathToFileURL(directory+'/');
  try {
    const raw=await sharp({create:{width:900,height:900,channels:4,background:palettes.light.bg}}).png().toBuffer();
    for(const theme of ['light','dark']) await writeFile(new URL(`profile-${theme}-raw.png`,root),raw);
    await recomposeProfile('light',root); // No manifest yet: compose without inventing GPU evidence.
    await expect(readFile(new URL('profile-capture.json',root))).rejects.toThrow();
    const manifest:ProfileEvidence={nativeIdentity:nativeIdentity(),source:'fixture',adapter:{identity:'fixture-native'},inputs:nativeInputs(),sha256:{'profile-light-raw.png':sha256(raw),'profile-dark-raw.png':sha256(raw),'profile-light.png':'old','profile-dark.png':'old'}};
    const file=new URL('profile-capture.json',root);await writeFile(file,JSON.stringify(manifest));
    for(const theme of ['light','dark'] as const) await recomposeProfile(theme,root);
    const after=JSON.parse(await readFile(file,'utf8'));
    const finals=Object.fromEntries(await Promise.all(['light','dark'].map(async theme=>{const name=`profile-${theme}.png`;return [name,sha256(await readFile(new URL(name,root)))];})));
    expect(after).toEqual({...manifest,sha256:{...manifest.sha256,...finals}});
    await recomposeProfile('light',root);expect(JSON.parse(await readFile(file,'utf8'))).toEqual(after);
    await writeFile(file,JSON.stringify({...manifest,nativeIdentity:'stale'}));
    await expect(recomposeProfile('light',root)).rejects.toThrow('Stale profile geometry/view');
    expect(sha256(await readFile(new URL('profile-light.png',root)))).toBe(finals['profile-light.png']);
    await writeFile(file,JSON.stringify({...manifest,sha256:{...manifest.sha256,'profile-light-raw.png':'wrong-raw'}}));
    await expect(recomposeProfile('light',root)).rejects.toThrow('Raw profile capture hash mismatch');
  } finally {await rm(directory,{recursive:true,force:true});}
});
