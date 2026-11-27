import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { Marked } from 'marked';
import { existsSync, cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { render } from './page';
import { buildPage } from '../scripts/build';
const root=resolve(import.meta.dir,'../..');
function fixture(run:(root:string)=>void){const dir=mkdtempSync(resolve(tmpdir(),'coasters-page-'));try{for(const name of ['spec.md',...render(root).sources.filter(s=>s!=='spec.md'),'part.ts','part.test.ts','part-rules.md','assets','demo','construction','examples','site'])cpSync(resolve(root,name),resolve(dir,name),{recursive:true,filter:s=>!s.includes('/node_modules')&&!s.includes('/out')&&!s.includes('/.git')});run(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('shared figure layout retains distinct tie and profile semantic groups',()=>{
 const {html}=render(root);
 expect([...html.matchAll(/class="figure-pair tie-pair"/g)]).toHaveLength(1);
 expect([...html.matchAll(/class="figure-pair profile-pair"/g)]).toHaveLength(1);
 expect(html).not.toContain('class="tie-pair profile-pair"');
});
test('tagline and plain lead-in stay separate from the two linked bullets',()=>{
  const {html}=render(root);
  const intro=html.slice(html.indexOf('<main>'),html.indexOf('<h2 id="asset-contract">'));
  expect(intro).toMatch(/<p>[^<]+<\/p>\s*<p>[^<]+<\/p>\s*<ul>/);
  const bullets=intro.match(/<ul>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  expect([...bullets.matchAll(/<li>/g)]).toHaveLength(2);
  expect([...bullets.matchAll(/href="#([^"]+)"/g)].map(m=>m[1])).toEqual(['asset-contract','construction-contract']);
  expect(intro).not.toContain('<h2');
  const entries=[...bullets.matchAll(/<li><a href="#([^"]+)">([^<]+)<\/a>: ([^<]+)<\/li>/g)];
  expect(entries.map(m=>m[2])).toEqual(['asset contract','recipe contract']);
  expect(entries[0]?.[3]).toContain('how assets (e.g. ties, rails, props) are defined');
  expect(entries[1]?.[3]).toBe('how recipes for placing assets and generating geometry are defined');
});
test('purpose precedes scoped authoring references',()=>{
  const {html}=render(root);
  for(const [id,subject] of [['asset-contract','Assets'],['instance-contract','A part defines reusable geometry'],['profile-contract','Profiles'],['construction-contract','A recipe places parts or sweeps profiles along a path.']]) {
    const opening=html.split(`id="${id}">`)[1]!.split('</p>')[0]!;
    expect(opening).toContain(subject!);
    expect(opening).not.toMatch(/quaternion|right-handed|normal \+Z|Native glTF/);
  }
  const ordered=['id="asset-contract"','id="instance-contract"','assets/figures/tie-frame-light.png','id="profile-contract"','assets/figures/profile-light.png','id="asset-conventions"','id="construction-contract"'];
  for(let i=1;i<ordered.length;i++)expect(html.indexOf(ordered[i]!)).toBeGreaterThan(html.indexOf(ordered[i-1]!));
  expect(html).toContain('<h3 id="asset-conventions">shared conventions</h3>');
  const partOpening=html.slice(html.indexOf('id="instance-contract"'),html.indexOf('id="profile-contract"'));
  expect([...partOpening.matchAll(/href="([^"]+)"/g)].map(m=>m[1])).toEqual(['#construction-contract']);
  const common=html.slice(html.indexOf('id="asset-conventions"'),html.indexOf('id="construction-contract"'));
  const rules=readFileSync(resolve(root,'asset-conventions.md'),'utf8').split('\n').filter(line=>line.startsWith('- ')).map(line=>line.slice(2));
  expect(rules).toHaveLength(3);
  for(const rule of rules){const rendered=rule.replaceAll("'",'&#39;');expect(common).toContain(rendered);expect(html.split(rendered)).toHaveLength(2);}
  const profile=html.slice(html.indexOf('id="profile-contract"'),html.indexOf('id="asset-conventions"'));
  expect(profile.replace(/<[^>]*>/g,'').replace(/\s+/g,' ')).toContain('A sweep carries a profile along a path to generate geometry.');
  expect(profile).toContain('assets/figures/profile-light.png');
});
test('each Contents source reaches HTML and complete LLM output',()=>fixture(dir=>{for(const source of render(dir).sources){const path=resolve(dir,source),text=readFileSync(path,'utf8');const marker='Mutation '+source;writeFileSync(path,text+'\n\n'+marker+'\n');const page=render(dir);expect(page.html).toContain(marker);expect(page.llms).toContain(marker);writeFileSync(path,text);}}));
test('Contents determines order within the asset contract',()=>fixture(dir=>{const path=resolve(dir,'spec.md'),text=readFileSync(path,'utf8');writeFileSync(path,text.replace('   - [parts](instance-contract.md)\n   - [profiles](profile-contract.md)','   - [profiles](profile-contract.md)\n   - [parts](instance-contract.md)'));const page=render(dir);expect(page.sources.slice(2,4)).toEqual(['profile-contract.md','instance-contract.md']);expect(page.html.indexOf('id="profile-contract"')).toBeLessThan(page.html.indexOf('id="instance-contract"'));expect(page.llms.indexOf('# profiles')).toBeLessThan(page.llms.indexOf('# parts'));}));
test('missing sources, figures and local anchors fail closed',()=>fixture(dir=>{const p=resolve(dir,'placement-reference.md'),text=readFileSync(p,'utf8');writeFileSync(p,text+'\n[bad](construction-contract.md#absent)');expect(()=>render(dir)).toThrow('Missing anchor');writeFileSync(p,text);rmSync(resolve(dir,'assets/figures/profile-dark.png'));expect(()=>render(dir)).toThrow('Missing local target');rmSync(p);expect(()=>render(dir)).toThrow();}));
test('actual static artifact contains HTML, complete LLM and unchanged images',()=>{const dir=mkdtempSync(resolve(tmpdir(),'coasters-artifact-'));try{mkdirSync(resolve(dir,'sources'));writeFileSync(resolve(dir,'sources/asset-contract.md'),'obsolete');buildPage(dir);expect(readFileSync(resolve(dir,'index.html'),'utf8')).toBe(render(root).html);expect(readFileSync(resolve(dir,'llms.txt'),'utf8')).toBe(render(root).llms);expect(existsSync(resolve(dir,'sources'))).toBe(false);for(const asset of render(root).assets)if(asset.endsWith('.png'))expect(readFileSync(resolve(dir,asset))).toEqual(readFileSync(resolve(root,asset)));}finally{rmSync(dir,{recursive:true,force:true});}});
test('H1 and nested fragments share the rendered heading mapping',()=>fixture(dir=>{const path=resolve(dir,'construction-contract.md');writeFileSync(path,readFileSync(path,'utf8')+'\n[title](profile-contract.md#profiles) [nested](construction-contract.md#repeated-ties) [own](#recipe-contract)\n');const page=render(dir);expect(page.html).toContain('href="#profile-contract">title');expect(page.html).toContain('href="#construction-contract--repeated-ties">nested');expect(page.html).toContain('href="#construction-contract">own');expect(page.llms).toContain('[title](/open-coasters/#profile-contract)');}));
test('Contents cannot read outside product root',()=>fixture(dir=>{const path=resolve(dir,'spec.md');for(const target of ['../outside.md','/tmp/outside.md']){const text=readFileSync(path,'utf8');writeFileSync(path,text.replace('instance-contract.md',target));expect(()=>render(dir)).toThrow('Path escapes root');writeFileSync(path,text);}}));
test('builder rejects symlinked output targets without writing outside',()=>{const dir=mkdtempSync(resolve(tmpdir(),'coasters-output-'));try{const out=resolve(dir,'out');mkdirSync(out);const control=resolve(dir,'control.txt');writeFileSync(control,'unchanged');symlinkSync(control,resolve(out,'index.html'));expect(()=>buildPage(out)).toThrow('Symlink escapes root');expect(readFileSync(control,'utf8')).toBe('unchanged');}finally{rmSync(dir,{recursive:true,force:true});}});
test('fresh artifact includes both font family license notices',()=>{const dir=mkdtempSync(resolve(tmpdir(),'coasters-font-notices-'));try{buildPage(dir);for(const family of ['plex','mono'])expect(readFileSync(resolve(dir,'fonts',family,'OFL.txt'))).toEqual(readFileSync(resolve(root,'demo/public/fonts',family,'OFL.txt')));expect(existsSync(resolve(dir,'fonts/mono/JetBrainsMono-Bold.woff2'))).toBe(false);}finally{rmSync(dir,{recursive:true,force:true});}});
test('obsolete views cleanup rejects escaping symlinks',()=>{const dir=mkdtempSync(resolve(tmpdir(),'coasters-stale-'));try{const out=resolve(dir,'out'),outside=resolve(dir,'outside');mkdirSync(out);mkdirSync(outside);writeFileSync(resolve(outside,'asset-contract.md'),'untouched');symlinkSync(outside,resolve(out,'sources'));expect(()=>buildPage(out)).toThrow('Symlink escapes root');expect(readFileSync(resolve(outside,'asset-contract.md'),'utf8')).toBe('untouched');}finally{rmSync(dir,{recursive:true,force:true});}});
test('complete LLM normalizes figures and internal guide links',()=>{const {llms}=render(root);expect(llms).toContain('![One tie in orthographic view');expect(llms).toContain('/open-coasters/assets/figures/tie-frame-light.png');expect(llms).toContain('![The same authored tie, solid with origin O and local XYZ axes');expect(llms).toContain('/open-coasters/assets/figures/tie-context-light.png');expect(llms).toContain('](/open-coasters/#construction-contract)');});
test('ordinary headings and useful footer links, without source controls or views',()=>{const p=render(root);expect(p.html).not.toContain('<nav');expect(p.html).not.toContain('/sources/');expect(p.html).not.toContain('Markdown source');expect(p).not.toHaveProperty('markdownViews');expect(p.html).toContain('<h2 id="asset-contract">asset contract</h2>');expect(p.html).toContain('<h3 id="instance-contract">parts</h3>');expect(p.html).toContain('<h3 id="profile-contract">profiles</h3>');expect(p.html).toContain('<footer><a href="/open-coasters/llms.txt">llms.txt</a>');for(const label of ['github','license'])expect(p.html).toContain(`>${label}</a>`);expect(p.html).not.toContain('CONTRIBUTING.md');expect(p.html).toContain('>◐</button>');expect(p.html).toContain('aria-label="GitHub"');});
test('unique headings, project paths, disclosure and repository links',()=>{const p=render(root);const ids=[...p.html.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(ids.length);for(const match of p.html.matchAll(/href="#([^"]+)"/g))expect(ids).toContain(match[1]);expect(p.llms).toContain('An illustrative polygonal profile');});

test('Markdown, HTML and llms.txt share the direct recipe and captured still', () => {
  const source = readFileSync(resolve(root, 'construction-contract.md'), 'utf8');
  const plain = new Marked().parse(source) as string;
  const image = plain.match(/<img src="(assets\/figures\/one-tie-light\.png)"[^>]*alt="([^"]+)"/);
  expect(image).not.toBeNull();
  const [, path, alt] = image!;
  const page = render(root);
  expect(page.html).toContain(`src="/open-coasters/${path}"`);
  expect(page.llms).toContain(`![${alt}](/open-coasters/${path})`);
  const snippet = 'const frames = sampleFrames(path, [2]);\nconst result = instance(tie, frames);';
  expect(page.html).toContain(snippet);
  expect(page.llms).toContain(snippet);
  expect(page.html).not.toMatch(/iframe|\/visualizer\//);
  const receipt = JSON.parse(readFileSync(resolve(root, 'assets/figures/one-tie-capture.json'), 'utf8'));
  const hash = (p: string) => createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex');
  expect(receipt.recipe).toBe('examples/one-tie.ts');
  expect(receipt.recipeSha256).toBe(hash(receipt.recipe));
  expect(receipt.captures.map(({ file }) => file)).toEqual(['one-tie-light.png', 'one-tie-dark.png']);
  for (const { file, sha256, distance, bounds, axes, deviceScaleFactor } of receipt.captures) {
    const asset = `assets/figures/${file}`;
    expect(page.assets.has(asset)).toBe(true);
    expect(hash(asset)).toBe(sha256);
    const png = readFileSync(resolve(root, asset));
    expect(deviceScaleFactor).toBe(2);
    expect(png.readUInt32BE(16) / deviceScaleFactor).toBe(bounds.width);
    expect(png.readUInt32BE(20) / deviceScaleFactor).toBe(bounds.height);
    expect(plain).toContain(`width="${bounds.width}" height="${bounds.height}"`);
    expect(distance).toBe(2);
    expect(axes).toEqual(['+X', '+Y', '−Z']);
  }
});

test('a mismatched Markdown still path fails the page build', () => fixture(dir => {
  const path = resolve(dir, 'construction-contract.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('one-tie-light.png', 'one-tie-absent.png'));
  expect(() => render(dir)).toThrow('Missing local target: assets/figures/one-tie-absent.png');
}));

test('recipes link to their function entries in the following section',()=>{
  const {html,llms,sources}=render(root);
  const recipe=html.slice(html.indexOf('<h2 id="construction-contract"'),html.indexOf('<h2 id="placement-reference"'));
  expect(recipe).toContain('<h2 id="construction-contract">recipe contract</h2>');
  expect(recipe).toContain('id="construction-contract--placements"');
  expect(recipe).toContain('Contributors can share an asset with or without a recipe.');
  expect(recipe).not.toContain('<details>');
  expect(sources.slice(-2)).toEqual(['construction-contract.md','placement-reference.md']);
  expect(html).not.toMatch(/(?:id="|href="#)examples(?:"|--)/);
  expect(llms).not.toMatch(/^# examples$|\/open-coasters\/#examples\b/m);
  const reference = readFileSync(resolve(root,'placement-reference.md'),'utf8');
  const referenceHtml = html.slice(html.indexOf('<h2 id="placement-reference"'), html.indexOf('</main>'));
  const table = referenceHtml.match(/<table>[\s\S]*?<\/table>/)![0];
  expect(referenceHtml.trim()).toEndWith('</table>');
  const lastRow = 'placements combined in input order |';
  expect(reference.trim()).toEndWith(lastRow);
  expect(llms.trim()).toEndWith(lastRow);
  expect(table.match(/<th>/g)).toHaveLength(2);
  expect(table.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(5);
  expect(table).toContain('<th>function</th>\n<th>returns</th>');
  expect(llms).toContain('| function | returns |');
  for (const [fn, [owner, args]] of Object.entries({
    sampleFrames: ['geometry', 'path, distances'], instance: ['geometry', 'content, frames'],
    repeat: ['repeat', 'content, options'], sweep: ['sweep', 'section, frames, material'],
    join: ['geometry', 'constructions'],
  })) {
    const fragment = fn.toLowerCase();
    const id = `placement-reference--${fragment}`;
    const source = `https://github.com/dylanebert/open-coasters/blob/main/construction/${owner}.ts`;
    expect(table).toContain(`<td><span id="${id}"><a href="${source}"><code>${fn}</code></a></span><code>(${args})</code></td>`);
    expect(llms).toContain(`| [\`${fn}\`](${source})\`(${args})\` |`);
    if (fn === 'sweep' || fn === 'join') continue;
    expect(recipe).toContain(`href="#${id}"><code>${fn}</code>`);
    expect(llms).toContain(`[\`${fn}\`](/open-coasters/#${id})`);
  }
  const section = 'https://github.com/dylanebert/open-coasters/blob/main/construction/section.ts';
  expect(reference).toContain('[decoded section](construction/section.ts)');
  expect(table).toContain(`<a href="${section}">decoded section</a>`);
  expect(llms).toContain(`[decoded section](${section})`);
  expect(recipe).not.toMatch(/Run only recipes|examples\/repeated-tie\.ts/);
  const link = '#placement-reference';
  expect(recipe).toContain(`href="${link}"`);
  expect(llms).toContain(`](/open-coasters/${link})`);
  for (const id of ['sweeps-and-supports','distances-and-frames','distance-and-frame-operations','recipes-and-results','execution']) {
    expect(html).not.toContain(`construction-contract--${id}`);
    expect(llms).not.toContain(`construction-contract--${id}`);
  }
});
