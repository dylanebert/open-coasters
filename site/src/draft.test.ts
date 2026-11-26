import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { render } from './page';
import { buildPage, root } from '../scripts/build';
import { staticHandler } from '../scripts/serve';

const recipeOwners = { sampleFrames: 'geometry', instance: 'geometry', repeat: 'repeat', sweep: 'sweep', join: 'geometry' };
const owners = ['examples/one-tie.ts', 'examples/repeated-tie.ts', 'construction/section.ts', ...new Set(Object.values(recipeOwners).map(owner => `construction/${owner}.ts`))];
test('draft authority is linked and served byte-for-byte without leaking draft routes', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'coasters-draft-'));
  const destination = resolve(dir, 'open-coasters');
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: staticHandler(dir) });
  try {
    buildPage(destination, { draft: true });
    const page = render(root, { draft: true });
    const html = await (await fetch(new URL('open-coasters/', server.url))).text();
    const llms = await (await fetch(new URL('open-coasters/llms.txt', server.url))).text();
    expect(html).toBe(page.html); expect(llms).toBe(page.llms);
    expect(html).not.toContain('/sources/');
    const guide = html.slice(html.indexOf('id="construction-contract"'), html.indexOf('id="examples"'));
    expect(guide).not.toContain('<details>');
    expect(guide).toContain('href="/open-coasters/draft/examples/one-tie.ts.txt"');
    expect(llms).toContain('](/open-coasters/draft/examples/one-tie.ts.txt)');
    expect(guide).toContain('<figure class="one-tie">');
    const still = await fetch(new URL('open-coasters/assets/figures/one-tie-light.png', server.url));
    expect(still.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await still.arrayBuffer())).toEqual(new Uint8Array(readFileSync(resolve(root, 'assets/figures/one-tie-light.png'))));
    expect(await (await fetch(new URL('open-coasters/visualizer/one-tie.json', server.url))).status).toBe(404);
    for (const owner of owners) {
      const path = `/open-coasters/draft/${owner}.txt`;
      expect(html).toContain(`href="${path}"`);
      expect(llms).toContain(`](${path})`);
      const response = await fetch(new URL(path, server.url));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(readFileSync(resolve(root, owner))));
      expect(render(root).html).toContain(`https://github.com/dylanebert/open-coasters/blob/main/${owner}`);
      expect(render(root).llms).toContain(`https://github.com/dylanebert/open-coasters/blob/main/${owner}`);
    }
    const table = html.slice(html.indexOf('id="placement-reference"')).match(/<table>[\s\S]*?<\/table>/)![0];
    for (const [fn, owner] of Object.entries(recipeOwners)) {
      const path = `/open-coasters/draft/construction/${owner}.ts.txt`;
      expect(table).toContain(`<a href="${path}"><code>${fn}</code></a>`);
      expect(llms).toContain(`| [\`${fn}\`](${path}) |`);
    }
    expect(table).toContain('<a href="/open-coasters/draft/construction/section.ts.txt">decoded section</a>');
    expect(guide).not.toContain('repeated-tie-recipe.ts');
    expect(llms).not.toContain('repeated-tie-recipe.ts');
    for (const path of ['draft/examples/repeated-tie-recipe.ts.txt', 'draft/construction/normal-track.ts.txt', 'draft/part.test.ts.txt', 'draft/part-rules.md.txt', 'draft/AGENTS.md.txt', 'draft/%2f..%2f..%2f..%2fAGENTS.md', 'draft/%zz']) {
      expect((await fetch(new URL(`open-coasters/${path}`, server.url))).status).not.toBe(200);
    }
    buildPage(destination);
    expect(readFileSync(resolve(destination, 'index.html'), 'utf8')).toBe(render(root).html);
    expect(readFileSync(resolve(destination, 'llms.txt'), 'utf8')).toBe(render(root).llms);
    for (const owner of owners) expect((await fetch(new URL(`open-coasters/draft/${owner}.txt`, server.url))).status).toBe(404);
  } finally { await server.stop(true); rmSync(dir, { recursive: true, force: true }); }
});

test('draft cleanup refuses an escaping output symlink', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'coasters-draft-symlink-'));
  try {
    const destination = resolve(dir, 'output'), outside = resolve(dir, 'outside');
    mkdirSync(destination); mkdirSync(outside);
    writeFileSync(resolve(outside, 'control.txt'), 'unchanged');
    symlinkSync(outside, resolve(destination, 'draft'));
    for (const options of [{ draft: true }, {}]) expect(() => buildPage(destination, options)).toThrow('Symlink escapes root');
    expect(readFileSync(resolve(outside, 'control.txt'), 'utf8')).toBe('unchanged');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
