import assert from 'node:assert/strict';
import { defaultSpacing } from '../examples/repeated-tie-recipe.ts';
import { launchNative, nativeAdapter } from './native-browser.mjs';

const url = process.env.VISUALIZER_URL;
assert.ok(url);
const browser = await launchNative();
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 600, height: 350 }, colorScheme: theme, deviceScaleFactor: 2 });
    await page.goto(new URL('?repeated', url).href);
    console.log(theme, await nativeAdapter(page));
    const main = page.locator(`main[data-ready=true][data-spacing="${defaultSpacing}"]`);
    await main.waitFor({ timeout: 8000 });
    await main.screenshot({ path: new URL(`../assets/figures/repeated-ties-${theme}.png`, import.meta.url).pathname });
    await page.close();
  }
} finally { await browser.close(); }
