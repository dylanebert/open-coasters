import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchNative, nativeAdapter } from '../../visualizer/native-browser.mjs';
import { staticHandler } from '../scripts/serve.ts';
import sharp from 'sharp';

const stations = {
  '0.4': [.6, .2, -.2, -.6, -1],
  '0.5': [.6, .1, -.4, -.9],
  '0.6': [.6, 0, -.6, -1.2],
  '0.7': [.6, -.1, -.8],
  '0.8': [.6, -.2, -1],
};

async function checkTies(png, spacing, width) {
  // Fixed camera landmarks at x=.58, y=0, past the right rail:
  // z=-1.2 → (917.47,218.94), z=.75 → (641.33,518.86) on the 1200×650 plate.
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const centers = [];
  const step = .005;
  let start;
  for (let z = .9; z >= -1.35; z -= step) {
    const t = (z + 1.2) / 1.95;
    const x = Math.floor((917.47 - 276.14 * t) * info.width / 1200);
    const y = Math.floor((218.94 + 299.92 * t) * info.height / 650);
    const red = data[(y * info.width + x) * info.channels];
    if (Math.abs(red - data[0]) > 24) {
      start ??= z;
    } else if (start !== undefined) {
      if (start - z >= .025) centers.push(Number(((start + z + step) / 2).toFixed(3)));
      start = undefined;
    }
  }
  const expected = stations[spacing];
  assert.ok(centers.length === expected.length && centers.every((z, i) => Math.abs(z - expected[i]) < .045),
    `${width}px at ${spacing} m: rendered tie centers ${centers}; expected ${expected}`);
}

const root = resolve(process.argv[2]);
const staticRoot = resolve(process.argv[3]);
const serve = root => Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: staticHandler(root) });
const server = serve(root);
const staticServer = serve(staticRoot);
const url = new URL('/open-coasters/', server.url).href;
const browser = await launchNative();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 }, javaScriptEnabled: false });
    await page.goto(url);
    for (const fn of ['sampleFrames', 'instance', 'repeat']) {
      const link = page.getByRole('link', { name: fn, exact: true }).first();
      const target = await link.getAttribute('href');
      assert.equal(target, `#placement-reference--${fn.toLowerCase()}`);
      assert.equal(await page.locator(`table tbody tr ${target}`).textContent(), fn);
    }
    assert.ok(await page.locator('table').filter({ has: page.locator('#placement-reference--repeat') }).evaluate(table =>
      table.scrollWidth <= table.clientWidth && document.documentElement.scrollWidth <= window.innerWidth),
    `${width}px: table and page must fit`);
    console.log(`${width}px: recipe links target table rows; no horizontal overflow`);
    await page.close();
  }
  for (const width of [390, 1280]) {
    const theme = width === 390 ? 'light' : 'dark';
    const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: theme });
    await page.goto(url);
    console.log(width, await nativeAdapter(page));
    await page.evaluate(() => document.fonts.ready);
    const spacing = page.getByRole('slider', { name: 'Tie spacing in meters' });
    const distance = page.getByRole('slider', { name: 'Sampled distance in meters' });
    const code = page.locator('pre').filter({ has: spacing });
    const picture = page.locator('.repeated-ties picture');
    const still = picture.locator('img');
    const frame = picture.locator('iframe');
    const oneFrame = page.locator('.one-tie iframe');
    const boxes = () => page.evaluate(() => [...document.querySelectorAll('pre:has(input), .one-tie picture, .repeated-ties picture, .repeated-ties + p, .repeated-ties + p + p')]
      .map(el => { const { x, y, width, height } = el.getBoundingClientRect(); return [x, y + scrollY, width, height]; }));
    const before = await boxes();
    assert.equal(await frame.count(), 0);
    const literal = code.locator('.tie-argument');
    assert.ok(await code.evaluate(pre => {
      const right = pre.getBoundingClientRect().right;
      return pre.scrollWidth <= pre.clientWidth &&
        [...pre.querySelectorAll('.tie-argument, input')].every(el => el.getBoundingClientRect().right <= right);
    }), `${width}px: recipe, literal and slider must fit`);
    const href = await page.getByRole('link', { name: 'bun examples/repeated-tie.ts', exact: true }).getAttribute('href');
    assert.equal(href, '/open-coasters/draft/examples/repeated-tie.ts.txt');
    const response = await page.request.get(new URL(href, url).href);
    assert.equal(response.status(), 200);
    assert.equal(await response.text(), await Bun.file(new URL('../../examples/repeated-tie.ts', import.meta.url)).text());
    const committed = (selector, key, value) => page.waitForFunction(([selector, key, value]) => {
      const frame = document.querySelector(`${selector} iframe:not([hidden])`);
      return frame?.contentDocument?.querySelector('main')?.dataset[key] === value &&
        frame.closest('figure').previousElementSibling.querySelector('.tie-argument').textContent === value;
    }, [selector, key, value], { timeout: 8000 });
    const repeated = value => committed('.repeated-ties', 'spacing', value);
    const one = value => committed('.one-tie', 'distance', value);
    const screenshot = (locator, name) => locator.screenshot({ path: resolve(root, `${name}-${width}.png`) });
    // Hold renderer startup so visibility is checked before the first commit.
    let resume;
    const gate = new Promise(r => { resume = r; });
    const route = async route => { await gate; await route.continue(); };
    await page.route('**/visualizer/?preview&repeated', route);
    await distance.scrollIntoViewIfNeeded();
    await one('2');
    await screenshot(page.locator('.one-tie picture'), 'one-tie-reference');
    await spacing.scrollIntoViewIfNeeded();
    assert.ok(await still.isVisible());
    assert.equal(await literal.textContent(), '0.4');
    assert.match(await still.evaluate(img => img.currentSrc), new RegExp(`repeated-ties-${theme}\\.png$`));
    const stillPixels = await screenshot(picture, 'repeated-still');
    resume();
    await repeated('0.4');
    const livePixels = await screenshot(picture, 'repeated-default');
    function rmse(a, b) {
      const path = resolve(root, `repeated-compare-${width}.png`);
      writeFileSync(path, a);
      const { stderr } = Bun.spawnSync(['compare', '-metric', 'RMSE', path, 'png:-', 'null:'], { stdin: b });
      return Number(stderr.toString().match(/\(([\d.e+-]+)\)/)?.[1]);
    }
    function checkRail(pixels, theme) {
      // Interior of the right rail, midway between two default ties.
      const { stdout, exitCode } = Bun.spawnSync(['convert', 'png:-', '-resize', '1200x650!',
        '-format', '%[fx:p{786,302}.r]', 'info:'], { stdin: pixels });
      assert.equal(exitCode, 0);
      const red = Number(stdout.toString());
      assert.ok(theme === 'dark' ? red > .21 && red < .35 : red > .75 && red < .93,
        `quiet ${theme} rail: red=${red}`);
    }
    const defaultError = rmse(stillPixels, livePixels);
    assert.ok(defaultError < .025, `still/default RMSE ${defaultError}`);
    const counts = await spacing.evaluate(el => {
      const pre = el.closest('pre');
      const input = el.getBoundingClientRect(), code = pre.getBoundingClientRect();
      return [pre.scrollWidth <= pre.clientWidth && input.right < code.right,
        getComputedStyle(el).accentColor === getComputedStyle(pre.querySelector('.tie-argument')).color];
    });
    assert.deepEqual(counts, [true, true]);
    for (const locator of [frame, oneFrame]) await locator.evaluate(el => {
      const win = el.contentWindow;
      const transfer = win.OffscreenCanvas.prototype.transferToImageBitmap;
      win.exports = 0;
      win.OffscreenCanvas.prototype.transferToImageBitmap = function () { win.exports++; return transfer.call(this); };
    });
    const exports = locator => locator.evaluate(el => el.contentWindow.exports);
    const { x, y, width: w, height: h } = await spacing.boundingBox();
    await page.mouse.move(x + 8, y + h / 2);
    await page.mouse.down();
    const dragFrames = { '0.4': livePixels };
    for (const [i, value] of ['0.5', '0.6', '0.7', '0.8'].entries()) {
      await page.mouse.move(x + 8 + (w - 16) * (i + 1) / 4, y + h / 2, { steps: 3 });
      await repeated(value);
      dragFrames[value] = await screenshot(picture, `repeated-drag-${value}`);
    }
    for (const [i, value] of ['0.7', '0.6', '0.5', '0.4'].entries()) {
      await page.mouse.move(x + 8 + (w - 16) * (3 - i) / 4, y + h / 2, { steps: 3 });
      await repeated(value);
      await checkTies(await screenshot(picture, `repeated-drag-back-${value}`), value, width);
    }
    await page.mouse.up();
    for (const [value, pixels] of Object.entries(dragFrames)) await checkTies(pixels, value, width);
    assert.equal(await exports(oneFrame), 0, 'spacing commits must not present one tie');
    await one('2');
    await spacing.press('End');
    await repeated('0.8');
    await spacing.press('ArrowLeft');
    await repeated('0.7');
    await checkTies(await screenshot(picture, 'repeated-keyboard'), '0.7', width);
    const beforeOne = await exports(frame);
    await distance.press('ArrowRight');
    await one('2.1');
    await repeated('0.7');
    assert.equal(await exports(frame), beforeOne, 'distance commits must not present repeated ties');
    assert.deepEqual(await boxes(), before);
    await spacing.scrollIntoViewIfNeeded();
    const heading = page.locator('#construction-contract--repeated-ties');
    await heading.evaluate(el => el.scrollIntoView());
    assert.ok(await heading.evaluate(el => Math.abs(el.getBoundingClientRect().top - 24) < 1));
    await page.screenshot({ path: resolve(root, `repeated-page-${width}.png`) });
    // Reusing a warmed scene must switch rail material as well as background.
    await spacing.press('Home');
    await repeated('0.4');
    await page.getByRole('button', { name: 'Toggle light and dark' }).click();
    await repeated('0.4');
    const switched = await screenshot(picture, 'repeated-switched');
    const otherTheme = theme === 'dark' ? 'light' : 'dark';
    checkRail(livePixels, theme);
    checkRail(switched, otherTheme);
    const stillPage = await browser.newPage({ viewport: { width, height: 800 }, colorScheme: otherTheme, javaScriptEnabled: false });
    await stillPage.goto(url);
    await stillPage.evaluate(() => document.fonts.ready);
    const expected = await stillPage.locator('.repeated-ties picture').screenshot();
    await stillPage.close();
    const themeError = rmse(expected, switched);
    assert.ok(themeError < .025, `switched theme still/live RMSE ${themeError}`);
    if (width === 1280) {
      await frame.evaluate(el => {
        const proto = el.contentWindow.GPUCommandEncoder.prototype;
        const copy = proto.copyTextureToTexture;
        proto.copyTextureToTexture = function (src, dst, size) {
          if (src.texture.label !== 'camera final texture') return copy.call(this, src, dst, size);
          return copy.call(this, { ...src, origin: [1, 0] }, dst, size);
        };
      });
      await spacing.press('End');
      await spacing.waitFor({ state: 'detached', timeout: 3000 });
      assert.match(await picture.locator('xpath=ancestor::figure/preceding-sibling::pre[1]').textContent(), /const spacing = 0\.4;/);
      assert.ok(await still.isVisible());
      await one('2.1');
      console.log('repeated GPU copy refused; default still restored, one-tie commit retained');
    }
    console.log(`${width}px ${theme}: startup still/default RMSE ${defaultError}; tie centers matched at every drag step and after keyboard input; ownership passed`);
    await page.close();
  }
  for (const mode of ['no GPU', 'no JS', 'static']) {
    const page = await browser.newPage({ javaScriptEnabled: mode !== 'no JS' });
    if (mode === 'no GPU') await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto(mode === 'static' ? new URL('/open-coasters/', staticServer.url).href : url);
    assert.equal(await page.locator('input[type=range], iframe').count(), 0);
    assert.ok(await page.locator('.repeated-ties img').evaluate(img => img.complete && img.naturalWidth));
    assert.ok(!requests.some(url => url.includes('/visualizer/')));
    if (mode === 'static') assert.ok(!requests.some(url => url.includes('one-tie-preview.js')));
    console.log(`${mode}: still without renderer`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop(true);
  staticServer.stop(true);
}
