// From site/: bun tests/private-guide-preview.mjs <parent from build --private-guide>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { launchNative, nativeAdapter } from '../../visualizer/native-browser.mjs';
import { staticHandler } from '../scripts/serve.ts';

const options = { viewport: { width: 390, height: 800 }, colorScheme: 'light', deviceScaleFactor: 1 };
const panels = ['curved-ties', 'swept-rail', 'joined-track', 'tie-gap'];
const defaults = [['0.6'], ['5.00'], ['0.6', '5.00'], ['2.2']];
const figure = (page, name) => page.locator(`[data-recipe="${name}"]`);
const code = panel => panel.locator('xpath=preceding-sibling::pre[1]');
const inputs = panel => code(panel).locator('.recipe-range');
const literals = panel => code(panel).locator('.recipe-literal');

async function ready(panel) {
  await inputs(panel).first().scrollIntoViewIfNeeded();
  await panel.locator('iframe:not([hidden])').waitFor({ timeout: 7500 });
}

async function committed(panel, values) {
  // Wait for the host's commit, not a message from the iframe or the slider value.
  const name = await panel.getAttribute('data-recipe');
  await panel.page().waitForFunction(({ name, values }) => {
    const code = document.querySelector(`[data-recipe="${name}"]`).previousElementSibling;
    const actual = [...code.querySelectorAll('.recipe-literal')].map(node => node.textContent);
    return actual.length === values.length && actual.every((value, i) => value === values[i]);
  }, { name, values }, { timeout: 7500 });
}

const tie = (r, g, b) => Math.max(r, g, b) < 230 && Math.max(r, g, b) - Math.min(r, g, b) <= 1;
const wall = theme => {
  const rgb = theme === 'light' ? [119, 117, 111] : [170, 167, 156];
  return (r, g, b) => [r, g, b].every((value, i) => Math.abs(value - rgb[i]) <= 3);
};

// 540 × 340 display coordinates, from projecting the tie tops and rail walls.
const tie075 = [238, 271], tie095 = [246, 261], tie055 = [230, 281], tie495 = [283, 50];
const left250 = [239, 189], right250 = [339, 176];
const left485 = [238, 76], right485 = [336, 35];
const tie135 = [260, 241], tie255 = [289, 178];
const landmarks = theme => ({
  'one-tie': [['tie at 2 m', [264, 205], tie, true]],
  'curved-ties': [['tie at 0.75 m', tie075, tie, true], ['gap at 0.95 m', tie095, tie, false],
    ['last repeated tie at 4.95 m', tie495, tie, true]],
  'swept-rail': [['left rail at 2.50 m', left250, wall(theme), true],
    ['left rail at 4.85 m', left485, wall(theme), true]],
  'joined-track': [['left rail at 4.85 m', left485, wall(theme), true],
    ['right rail at 4.85 m', right485, wall(theme), true], ['tie at 0.75 m', tie075, tie, true],
    ['tie at 1.35 m', [260, 241], tie, true], ['setback at 4.95 m', tie495, tie, false]],
  'tie-gap': [['left rail at 4.85 m', left485, wall(theme), true],
    ['right rail at 4.85 m', right485, wall(theme), true], ['tie at 0.75 m', tie075, tie, true],
    ['omitted tie at 1.35 m', tie135, tie, false], ['tie at 2.55 m', tie255, tie, true]],
});

async function paint(panel, path) {
  const picture = panel.locator('picture');
  const { data, info: { width, height, channels } } = await sharp(await picture.screenshot({ path })).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  // Sample a small neighborhood in viewport pixels to allow fractional CSS placement.
  return (name, [x, y], matches, present) => {
    x = Math.round(x * width / 540);
    y = Math.round(y * height / 340);
    let hits = 0;
    for (let j = y - 2; j <= y + 2; j++) for (let i = x - 2; i <= x + 2; i++) {
      const p = (j * width + i) * channels;
      hits += Number(matches(data[p], data[p + 1], data[p + 2]));
    }
    assert.ok(present ? hits >= 5 : hits === 0, `${name}: expected ${present ? 'paint' : 'no paint'}, found ${hits}/25 matching pixels`);
  };
}

async function checkCurvedTies(panel) {
  await ready(panel);
  await inputs(panel).press('End');
  await committed(panel, ['0.8']);
  const after = await paint(panel);
  after('repeat obsolete tie at 0.75 m', tie075, tie, false);
  after('repeat new tie at 0.95 m', tie095, tie, true);
}

async function checkSweptRail(panel, theme) {
  await ready(panel);
  await inputs(panel).press('Home');
  await committed(panel, ['0.10']);
  const after = await paint(panel);
  after('sweep shortened rail near profile', [164, 286], wall(theme), true);
  after('sweep shortened rail has no stale tail at 2.50 m', left250, wall(theme), false);
  await inputs(panel).press('End');
  await committed(panel, ['5.00']);
  (await paint(panel))('sweep restored to 5 m', left485, wall(theme), true);
}

async function checkJoinedTrack(panel, theme, path) {
  await ready(panel);
  await inputs(panel).first().press('Home');
  await inputs(panel).last().evaluate(input => {
    input.value = '1.70';
    input.dispatchEvent(new Event('input'));
  });
  await committed(panel, ['0.4', '1.70']);
  const after = await paint(panel, path);
  after('joined shortened left rail', [220, 226], wall(theme), true);
  after('joined shortened right rail', [318, 232], wall(theme), true);
  after('joined obsolete left tail', left250, wall(theme), false);
  after('joined obsolete right tail', right250, wall(theme), false);
  after('joined obsolete tie at 0.75 m', tie075, tie, false);
  after('joined new tie at 0.55 m', tie055, tie, true);
  await inputs(panel).last().press('End');
  await committed(panel, ['0.4', '5.00']);
  const restored = await paint(panel);
  restored('joined restored left rail', left485, wall(theme), true);
  restored('joined restored right rail', right485, wall(theme), true);
  restored('joined restored setback', tie495, tie, false);
}

async function checkGap(panel, theme, prefix) {
  await ready(panel);
  assert.deepEqual(await literals(panel).allTextContents(), ['2.2']);
  await inputs(panel).press('Home');
  await committed(panel, ['1.2']);
  const minimum = await paint(panel, `${prefix}-gap-min.png`);
  minimum('minimum restores tie at 1.35 m', tie135, tie, true);
  minimum('minimum retains tie at 2.55 m', tie255, tie, true);
  await inputs(panel).evaluate(input => {
    for (const value of ['1.3', '2.4', '3.6']) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
  });
  await committed(panel, ['3.6']);
  const maximum = await paint(panel, `${prefix}-gap-max.png`);
  maximum('latest gap omits tie at 1.35 m', tie135, tie, false);
  maximum('latest gap omits tie at 2.55 m', tie255, tie, false);
  for (const sample of [minimum, maximum]) {
    sample('gap retains left rail', left485, wall(theme), true);
    sample('gap retains right rail', right485, wall(theme), true);
    sample('gap retains tie at 0.75 m', tie075, tie, true);
  }
}

async function checkAxes(one, prefix) {
  const svg = one.frameLocator('iframe').locator('svg');
  assert.deepEqual(await svg.locator('text').allTextContents(), ['+X', '+Y', '−Z']);
  const ends = () => svg.locator('path[marker-end^="url(#axis-"]').evaluateAll(paths => paths.map(path => {
    const { x, y } = path.getPointAtLength(path.getTotalLength());
    return [Math.round(x / 2), Math.round(y / 2)];
  }));
  assert.deepEqual(await ends(), [[340, 207], [273, 186], [294, 176]]);
  const range = one.page().locator('.tie-range');
  for (const [key, value, axes] of [
    ['ArrowRight', '2.1', [[342, 201], [275, 181], [296, 170]]],
    ['Home', '0', [[258, 328], [204, 285], [237, 278]]],
    ['End', '5', [[343, 22], [275, 29], [271, 14]]],
  ]) {
    await range.press(key);
    await one.page().waitForFunction(value => document.querySelector('.tie-argument').textContent === value, value);
    assert.deepEqual(await ends(), axes);
    assert.ok(await svg.locator('text').evaluateAll(labels => labels.every(label => {
      const { x, y, width, height } = label.getBBox();
      const { width: w, height: h } = label.ownerSVGElement.viewBox.baseVal;
      return x > 0 && y > 0 && x + width < w && y + height < h;
    })), `axis labels fit at ${value} m`);
  }
  await one.locator('picture').screenshot({ path: `${prefix}-one-tie-max.png` });
}

async function checkFraming(page, theme, live, prefix) {
  const checks = landmarks(theme);
  const sizes = {};
  for (const [name, samples] of Object.entries(checks)) {
    const panel = panels.includes(name) ? figure(page, name) : page.locator(`.${name}`);
    if (live) {
      if (name === 'one-tie') {
        await page.locator('.tie-range').scrollIntoViewIfNeeded();
        await panel.locator('iframe:not([hidden])').waitFor();
      } else await ready(panel);
    } else {
      const img = panel.locator('img');
      await img.scrollIntoViewIfNeeded();
      assert.match(await img.evaluate(async el => { await el.decode(); return el.currentSrc; }), new RegExp(`-${theme}\\.png$`));
    }
    const { width, height } = await panel.locator('picture').boundingBox();
    assert.ok(Math.abs(height - width * 340 / 540) <= 1);
    assert.equal(width, sizes['one-tie'] ?? width, `${name}: same displayed scale as one tie`);
    sizes[name] = width;
    const sample = await paint(panel, `${prefix}-${name}.png`);
    for (const [label, ...args] of samples) sample(`${name}: ${label}`, ...args);
  }
  return sizes;
}

async function checkDeviceRefusal(browser, url, width) {
  const page = await browser.newPage({ ...options, viewport: { ...options.viewport, width } });
  try {
    await page.addInitScript(() => {
      GPUAdapter.prototype.requestDevice = async function () {
        const recipe = new URL(location.href).searchParams.get('recipe');
        if (recipe) top.document.documentElement.setAttribute(`data-refused-${recipe}`, '');
        throw new Error('Test device refusal');
      };
    });
    await page.goto(url);
    for (const [i, name] of panels.entries()) {
      if (width !== options.viewport.width && name !== 'tie-gap') continue;
      const panel = figure(page, name);
      await inputs(panel).first().focus();
      await page.waitForFunction(name => document.documentElement.hasAttribute(`data-refused-${name}`), name, { timeout: 7500 });
      await inputs(panel).first().waitFor({ state: 'hidden', timeout: 2000 });
      assert.equal(await inputs(panel).count(), defaults[i].length);
      assert.equal(await code(panel).locator('input:visible').count(), 0, `${name}: hide controls on refusal`);
      assert.equal(await panel.locator('iframe').count(), 0, `${name}: return directly to still`);
      assert.deepEqual(await literals(panel).allTextContents(), defaults[i]);
      const still = panel.locator('img');
      assert.ok(await still.isVisible());
      assert.ok(await still.evaluate(async img => {
        await img.decode();
        return img.currentSrc === img.src && img.naturalWidth === 1080;
      }), `${name}: show the decoded default light still`);
    }
  } finally {
    await page.close();
  }
}

const root = resolve(process.argv[2]);
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: staticHandler(root) });
const url = new URL('/open-coasters/', server.url).href;
const browser = await launchNative();
try {
  for (const width of [390, 1280]) for (const colorScheme of ['light', 'dark']) {
    const settings = { ...options, viewport: { ...options.viewport, width }, colorScheme };
    const prefix = resolve(root, `${width}-${colorScheme}`);
    const still = await browser.newPage({ ...settings, javaScriptEnabled: false });
    still.setDefaultTimeout(8000);
    await still.goto(url);
    assert.equal(await still.locator('iframe, input[type=range]:visible').count(), 0);
    const staticSizes = await checkFraming(still, colorScheme, false, `${prefix}-still`);
    await still.close();
    const page = await browser.newPage(settings);
    page.setDefaultTimeout(8000);
    const rasters = new Set();
    page.on('request', request => {
      if (request.resourceType() === 'image' || /\.png$/i.test(new URL(request.url()).pathname)) rasters.add(request.url());
    });
    const response = await page.goto(url);
    await nativeAdapter(page);
    const declaredImages = new Set(await page.evaluate(html => {
      const source = new DOMParser().parseFromString(html, 'text/html');
      return [...source.querySelectorAll('img[src], picture source[srcset]')].map(node =>
        new URL(node.getAttribute('src') ?? node.getAttribute('srcset'), location.href).href);
    }, await response.text()));
    assert.deepEqual(await checkFraming(page, colorScheme, true, `${prefix}-live`), staticSizes);
    await checkAxes(page.locator('.one-tie'), prefix);
    await checkCurvedTies(figure(page, panels[0]));
    await checkSweptRail(figure(page, panels[1]), colorScheme);
    await checkJoinedTrack(figure(page, panels[2]), colorScheme, `${prefix}-shortened.png`);
    await checkGap(figure(page, 'tie-gap'), colorScheme, prefix);
    assert.deepEqual(await literals(figure(page, 'joined-track')).allTextContents(), ['0.4', '5.00']);
    assert.deepEqual([...rasters].filter(src => !declaredImages.has(src)), [], 'no off-default raster requests');
    await page.close();
  }
  await checkDeviceRefusal(browser, url, 390);
  await checkDeviceRefusal(browser, url, 1280);
  console.log('Private guide smoke passed: curved pixel landmarks, matching literals, no frame rasters, direct refusal.');
} finally {
  await browser.close();
  server.stop(true);
}
