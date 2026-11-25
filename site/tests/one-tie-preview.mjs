// bun tests/one-tie-preview.mjs <private build parent directory>
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launchNative } from '../../visualizer/native-browser.mjs';
import { staticHandler } from '../scripts/serve.ts';

const root = resolve(process.argv[2]);
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: staticHandler(root) });
const url = new URL('/open-coasters/', server.url).href;
const browser = await launchNative();
try {
  const argument = '.tie-argument';
  const boxes = page => page.evaluate(() => ['#construction-contract ~ pre', '.one-tie picture', '.one-tie + p'].map(selector => {
    const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
    return [x, y + scrollY, width, height];
  }));
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 780 } });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const before = await boxes(page);
    const { above, below, vertical, inset } = await page.locator('#construction-contract ~ pre').first().evaluate(pre => {
      const rect = pre.getBoundingClientRect();
      const style = getComputedStyle(pre);
      return {
        above: rect.top - pre.previousElementSibling.getBoundingClientRect().bottom,
        below: pre.nextElementSibling.getBoundingClientRect().top - rect.bottom,
        vertical: parseFloat(style.paddingBlockStart),
        inset: parseFloat(style.paddingInlineStart),
      };
    });
    assert.ok(above >= 24 && below >= 24, 'separate the code panel from adjacent content');
    assert.ok(vertical >= 20 && inset >= (width === 390 ? 16 : 24), 'keep code comfortably inset');
    const slider = page.getByRole('slider');
    assert.equal(await slider.isVisible(), true, 'distance slider must be visible before interaction');
    const styles = await slider.evaluate(el => {
      const native = document.createElement('input');
      native.type = 'range';
      el.after(native);
      const read = input => { const style = getComputedStyle(input); return [style.appearance, style.cursor]; };
      const result = [read(el), read(native)];
      native.remove();
      return result;
    });
    assert.deepEqual(...styles, 'use the browser’s native range appearance and cursor');
    assert.equal(await page.locator('.tie-preview').count(), 0, 'do not load the renderer below the fold');
    const startup = performance.now();
    await slider.scrollIntoViewIfNeeded();
    const rail = await slider.boundingBox();
    const digit = await page.locator(argument).boundingBox();
    const sample = await page.locator('.tie-sample').boundingBox();
    const code = await page.locator('#construction-contract ~ pre').first().boundingBox();
    assert.ok(rail.x - (sample.x + sample.width) >= 8, 'leave space after the code');
    assert.ok(rail.x + rail.width <= code.x + code.width, `do not clip the slider at ${width}px: ${rail.x + rail.width} > ${code.x + code.width}`);
    assert.ok(rail.y <= digit.y + digit.height / 2 && rail.y + rail.height >= digit.y + digit.height / 2);
    const committed = value => page.waitForFunction(value => {
      const frame = document.querySelector('.tie-preview:not([hidden])');
      return frame?.contentDocument.querySelector('main')?.dataset.distance === value &&
        document.querySelector('.tie-argument').textContent === value;
    }, value, { timeout: 8000 });
    const canvas = page.frameLocator('.tie-preview').locator('canvas');
    const cdp = await page.context().newCDPSession(page);
    let clip;
    const bitmap = async () => Buffer.from((await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, clip,
    })).data, 'base64');
    async function withoutAnnotations() {
      await canvas.evaluate(el => {
        const style = el.ownerDocument.createElement('style');
        style.textContent = 'svg { visibility: hidden }';
        el.ownerDocument.head.append(style);
      });
    }
    function colors(buffer) {
      const { exitCode, stdout } = Bun.spawnSync(['convert', 'png:-', '-format', '%k', 'info:'], { stdin: buffer });
      assert.equal(exitCode, 0);
      return Number(stdout.toString());
    }
    const checkAccent = async () => {
      const [literal, accent, code] = await page.evaluate(() => [
        getComputedStyle(document.querySelector('.tie-argument')).color,
        getComputedStyle(document.querySelector('.tie-range')).accentColor,
        getComputedStyle(document.querySelector('.tie-sample').parentElement).color,
      ]);
      assert.equal(literal, accent, 'the slider and the number it changes share an accent');
      assert.notEqual(code, accent, 'the rest of the code keeps its ordinary color');
    };
    await checkAccent();
    await committed('2');
    console.log(`${width}px in view to warm pose: ${Math.round(performance.now() - startup)}ms`);
    assert.equal(await slider.evaluate(el => el === document.activeElement), false, 'warm before any slider interaction');
    const x = fraction => rail.x + rail.width * fraction;
    const y = rail.y + rail.height / 2;
    await page.mouse.move(x(.57), y);
    await page.mouse.down();
    await page.mouse.move(x(.9), y);
    const first = await slider.inputValue();
    await committed(first);
    await withoutAnnotations();
    await page.locator('.one-tie img').evaluate(el => { el.style.visibility = 'hidden'; });
    const bounds = await canvas.boundingBox();
    const [sx, sy] = await page.evaluate(() => [scrollX, scrollY]);
    clip = { x: Math.ceil(bounds.x + sx), y: Math.ceil(bounds.y + sy),
      width: Math.floor(bounds.width) - 1, height: Math.floor(bounds.height) - 1, scale: 1 };
    const startPixels = await bitmap();
    const colorCount = colors(startPixels);
    await Bun.write(resolve(root, `tie-start-${width}.png`), startPixels);
    assert.ok(colorCount > 16, `tie-start-${width}.png: ${colorCount} colors without annotations`);
    const warm = performance.now();
    await page.mouse.move(x(.15), y + 28, { steps: 5 });
    const second = await slider.inputValue();
    assert.ok(Number(first) > 2.5 && Number(second) < 1, `drag stopped tracking: ${first} → ${second}`);
    let changed;
    do { changed = await bitmap(); } while (changed.equals(startPixels) && performance.now() - warm < 1000);
    console.log(`${width}px warm drag to changed screenshot: ${Math.round(performance.now() - warm)}ms`);
    await Bun.write(resolve(root, `tie-drag-${width}.png`), changed);
    await committed(second);
    assert.ok(!changed.equals(startPixels) && colors(changed) > 16, `tie-drag-${width}.png: unchanged=${changed.equals(startPixels)}, colors=${colors(changed)}`);
    await page.mouse.up();
    await slider.focus();
    assert.equal(await slider.evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => {
      const slider = document.querySelector('.tie-range');
      slider.value = '2';
      slider.dispatchEvent(new Event('input'));
    });
    await committed('2');
    const initial = await bitmap();
    await page.evaluate(() => {
      const frame = document.querySelector('.tie-preview');
      const argument = document.querySelector('.tie-argument');
      window.mismatches = [];
      new MutationObserver(() => {
        const distance = frame.contentDocument?.querySelector('main')?.dataset.distance;
        if (frame.isConnected && !frame.hidden && distance !== argument.textContent) window.mismatches.push(distance);
      }).observe(argument, { characterData: true, subtree: true });
    });
    await page.keyboard.press('ArrowRight');
    assert.equal(await slider.inputValue(), '2.1');
    await committed('2.1');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await slider.inputValue(), '3.3');
    await committed('3.3');
    const keyboardPixels = await bitmap();
    assert.ok(!keyboardPixels.equals(initial) && colors(keyboardPixels) > 16, 'keyboard must change visible mesh pixels');
    assert.deepEqual(await page.evaluate(() => window.mismatches), []);
    assert.deepEqual(await boxes(page), before);
    assert.deepEqual(await slider.boundingBox(), rail);
    if (width === 1280) {
      await page.getByRole('button', { name: 'Toggle light and dark' }).click();
      await committed('3.3');
      await checkAccent();
      assert.equal(await page.frameLocator('.tie-preview').locator('main').evaluate(el => getComputedStyle(el).colorScheme), 'dark');
      const dark = await bitmap();
      assert.ok(!dark.equals(keyboardPixels) && colors(dark) > 16, 'theme must repaint visible mesh pixels');
    }
    await page.locator('pre:has(.tie-argument)').screenshot({ path: resolve(root, `slider-${width}.png`) });
    assert.equal(await page.locator(argument).textContent(), '3.3');
    if (width === 1280) {
      await canvas.evaluate(canvas => {
        const win = canvas.ownerDocument.defaultView;
        const copy = win.GPUCommandEncoder.prototype.copyTextureToTexture;
        const pop = win.GPUDevice.prototype.popErrorScope;
        const transfer = win.OffscreenCanvas.prototype.transferToImageBitmap;
        win.parent.previewExports = 0;
        win.OffscreenCanvas.prototype.transferToImageBitmap = function () {
          win.parent.previewExports++;
          return transfer.call(this);
        };
        win.GPUCommandEncoder.prototype.copyTextureToTexture = function (src, ...rest) {
          if (src.texture.label === 'camera final texture') {
            win.GPUCommandEncoder.prototype.copyTextureToTexture = copy;
            win.GPUDevice.prototype.popErrorScope = function () {
              win.GPUDevice.prototype.popErrorScope = pop;
              const checked = pop.call(this);
              const gate = new Promise(resolve => { win.releasePreview = resolve; });
              return gate.then(() => checked);
            };
          }
          return copy.call(this, src, ...rest);
        };
      });
      const input = value => slider.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input'));
      }, value);
      const previous = await bitmap();
      await input('1');
      await page.waitForFunction(() => !!document.querySelector('.tie-preview').contentWindow.releasePreview,
        undefined, { timeout: 1000 });
      assert.equal(await page.locator(argument).textContent(), '3.3');
      const held = await bitmap();
      assert.ok(held.equals(previous), 'an unchecked frame must not replace the committed pose');
      await input('3.3');
      await canvas.evaluate(canvas => canvas.ownerDocument.defaultView.releasePreview());
      await page.waitForFunction(() => window.previewExports > 0,
        undefined, { timeout: 1000 });
      assert.ok((await bitmap()).equals(held), 'a superseded frame must not replace the committed pose');
      assert.equal(await page.evaluate(() => window.previewExports), 1,
        'only the newest accepted frame may export a bitmap');
      await page.locator('.one-tie img').evaluate(el => { el.style.visibility = ''; });
      await page.frameLocator('.tie-preview').locator('canvas').evaluate(canvas => {
        const win = canvas.ownerDocument.defaultView;
        const copy = win.GPUCommandEncoder.prototype.copyTextureToTexture;
        win.GPUCommandEncoder.prototype.copyTextureToTexture = function (src, dst, size) {
          if (src.texture.label !== 'camera final texture') return copy.call(this, src, dst, size);
          win.GPUCommandEncoder.prototype.copyTextureToTexture = copy;
          // Real asynchronous validation refusal: the source region overruns the texture.
          return copy.call(this, { ...src, origin: [1, 0] }, dst, size);
        };
      });
      await slider.press('ArrowLeft');
      await slider.waitFor({ state: 'detached', timeout: 3000 });
      assert.equal(await page.evaluate(() => window.previewExports), 1, 'a refused GPU copy must not export a bitmap');
      assert.match(await page.locator('pre', { hasText: 'sampleFrames(path, [2])' }).textContent(), /sampleFrames\(path, \[2\]\)/);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.ok(await page.locator('.one-tie img').isVisible());
      assert.deepEqual(await boxes(page), before);
    }
    await page.close();
  }
  for (const javaScriptEnabled of [true, false]) {
    const page = await browser.newPage({ javaScriptEnabled });
    if (javaScriptEnabled) await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await page.goto(url);
    assert.equal(await page.locator('.tie-range, iframe').count(), 0);
    assert.match(await page.locator('pre', { hasText: 'sampleFrames(path, [2])' }).textContent(), /sampleFrames\(path, \[2\]\)/);
    assert.ok(await page.locator('.one-tie img').evaluate(img => img.complete && img.naturalWidth));
    assert.ok(!requested.some(url => url.includes('/visualizer/')));
    await page.close();
  }
  console.log('One-tie preview passed at 390 and 1280px; no-GPU and no-JS fallback passed.');
} finally {
  await browser.close();
  server.stop(true);
}
