import { test, expect } from '@playwright/test';

test('ordinary native arrows preserve spacing and separation steps', async ({ page }) => {
  await page.goto('./?example=assembly');
  await page.locator('body[data-ready=true]').waitFor();
  await page.locator('[name=assembly-path]').selectOption('straight');
  const separation = page.locator('[name=assembly-separation]');
  await separation.fill('1.4'); await separation.press('Enter');
  await separation.press('ArrowUp'); await separation.blur();
  await expect(separation).toHaveValue('1.45');
  await expect.poll(() => page.evaluate(() => {
    const positions: number[] = (window as any).demo.trackPositions()[0]?.positions ?? [];
    return Math.min(...positions.filter((_, i) => i % 3 === 0));
  })).toBeCloseTo(-.785, 5);
  await separation.press('ControlOrMeta+z'); await expect(separation).toHaveValue('1.4');
  for (const example of ['ties', 'station']) {
    await page.locator('[name=example]').selectOption(example);
    if (example === 'station') {
      for (const name of ['gap-start', 'gap-end']) { const input=page.locator(`[name=${name}]`); await input.fill('0'); await input.press('Enter'); }
    }
    const spacing = page.locator('[name=assembly-spacing]');
    await expect(spacing).toHaveValue('0.65');
    await spacing.focus(); await spacing.press('ArrowUp'); await spacing.blur();
    await expect(spacing).toHaveValue('0.7');
    const count = 19; // 18 origins on either path at .7m, plus the rail mesh.
    await expect.poll(() => page.evaluate(() => (window as any).demo.instances().length)).toBe(count);
    await spacing.press('ControlOrMeta+z'); await expect(spacing).toHaveValue('0.65');
  }
});
