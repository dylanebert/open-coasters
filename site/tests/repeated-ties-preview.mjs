import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launchNative, nativeAdapter } from '../../visualizer/native-browser.mjs';
import { staticHandler } from '../scripts/serve.ts';

const [privateRoot, ordinaryRoot] = process.argv.slice(2);
const serve = root => Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: staticHandler(resolve(root)) });
const servers = [serve(privateRoot), serve(ordinaryRoot)];
const [privateUrl, ordinaryUrl] = servers.map(server => new URL('/open-coasters/', server.url).href);
const browser = await launchNative();
try {
  for (const [width, colorScheme] of [[390, 'light'], [1280, 'dark']]) {
    const options = { viewport: { width, height: 800 }, colorScheme };
    const page = await browser.newPage(options);
    const ordinary = await browser.newPage({ ...options, javaScriptEnabled: false });
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await Promise.all([page.goto(privateUrl), ordinary.goto(ordinaryUrl)]);
    await nativeAdapter(page);
    const oneTie = page.locator('.one-tie iframe:not([hidden])');
    await page.locator('.one-tie picture').scrollIntoViewIfNeeded();
    await oneTie.waitFor({ timeout: 9000 });
    const slider = page.getByRole('slider', { name: 'Sampled distance in meters' });
    assert.ok(await slider.evaluate(el => el.getBoundingClientRect().right <= el.closest('pre').getBoundingClientRect().right));

    await page.locator('.repeated-ties picture').scrollIntoViewIfNeeded();
    for (const p of [page, ordinary]) {
      const [oneTie, repeat] = await p.locator(':is(.one-tie,.repeated-ties) img').evaluateAll(async imgs =>
        Promise.all(imgs.map(async img => {
          await img.decode();
          return { path: new URL(img.currentSrc).pathname, aspect: img.naturalWidth / img.naturalHeight };
        })));
      assert.equal(repeat.path, `/open-coasters/assets/figures/curved-ties-${colorScheme}.png`);
      assert.equal(repeat.aspect, oneTie.aspect);
    }
    assert.equal(await page.locator('.repeated-ties iframe, pre:has(+ .repeated-ties) input').count(), 0);
    assert.ok(!requests.some(url => new URL(url).searchParams.has('repeated')));
    assert.match(await page.locator('pre:has(+ .repeated-ties)').innerText(), /const spacing = 0\.6;\nconst ties = repeat\(tie, \{\n  path,/);
    assert.ok(await page.locator('pre:has(+ :is(.repeated-ties,.swept-rail,.joined-track,.tie-gap))').evaluateAll(panels =>
      panels.length === 4 && panels.every(pre => pre.scrollWidth <= pre.clientWidth)));
    console.log(`${width}px ${colorScheme}: one-tie live, banked repeat static, four recipe panels fit`);
    await Promise.all([page.close(), ordinary.close()]);
  }
} finally {
  await browser.close();
  for (const server of servers) server.stop(true);
}
