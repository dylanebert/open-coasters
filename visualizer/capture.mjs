import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { launchNative, nativeAdapter } from './native-browser.mjs';
import { signedAxisLabels } from './signed-axes.mjs';

const url = process.env.VISUALIZER_URL;
assert.ok(url, 'Set VISUALIZER_URL to the served built app');
const figures = new URL('../assets/figures/', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await launchNative();
try {
  const captures = [];
  const viewport = { width: 540, height: 400 };
  const deviceScaleFactor = 2;
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport, colorScheme: theme, deviceScaleFactor });
    await page.goto(url);
    const adapter = await nativeAdapter(page);
    const main = page.locator('main[data-ready=true]');
    await main.waitFor({ timeout: 8000 });
    const distance = Number(await main.getAttribute('data-distance'));
    assert.equal(distance, 2);
    assert.equal(await main.evaluate(el => getComputedStyle(el).colorScheme), theme);
    const axes = await signedAxisLabels(main);
    const bounds = await main.boundingBox();
    assert.deepEqual(bounds, { x: 0, y: 0, width: 540, height: 340 });
    const file = `one-tie-${theme}.png`;
    const png = await main.screenshot({ scale: 'device' });
    await writeFile(new URL(file, figures), png);
    captures.push({ file, theme, viewport, bounds, deviceScaleFactor, distance, axes, adapter, sha256: sha256(png) });
    await page.close();
  }
  const recipe = 'examples/one-tie.ts';
  const recipeSha256 = sha256(await readFile(new URL(`../${recipe}`, import.meta.url)));
  await writeFile(new URL('one-tie-capture.json', figures), JSON.stringify({ command: 'cd visualizer && VISUALIZER_URL=<built app URL> bun run capture', recipe, recipeSha256, captures }, null, 2) + '\n');
} finally { await browser.close(); }
