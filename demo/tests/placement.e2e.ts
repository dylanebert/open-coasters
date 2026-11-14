import { test, expect } from '@playwright/test';
for (const phone of [false, true]) test(`flat placement examples ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?stepped');
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  const groups = () => page.evaluate(() => (window as any).demo.instances());
  const orbit = () => page.evaluate(() => (window as any).demo.orbit());
  const example = page.locator('[name=example]');
  await expect(example.locator('option[value=placed]')).toHaveCount(1);
  await expect(page.locator('[name=assembly-witness]')).toHaveCount(0);
  await example.selectOption('placed');
  await expect(page.locator('[name=placement-x]')).toBeVisible();
  await step();
  await page.screenshot({path:`test-results/placed-${phone ? 'phone' : 'desktop'}.png`,fullPage:true});
  await example.selectOption('supports'); await step();
  await expect(page.locator('[name=assembly-post1]')).toHaveValue('2');
  await expect(page.locator('[name=assembly-post2]')).toHaveValue('10');
  await expect(page.locator('[name=assembly-path]')).toHaveCount(0);
  const before = await groups(), camera = await orbit();
  const first = page.locator('[name=assembly-post1]');
  await first.fill('3.125'); await first.press('Enter'); await step();
  const moved = await groups();
  expect(moved.slice(0,-2)).toEqual(before.slice(0,-2));
  expect(moved.at(-1)).toEqual(before.at(-1));
  expect(moved.at(-2)[0].translation[2]).toBeCloseTo(-2.875,6);
  await first.press('ControlOrMeta+z'); await step(); expect(await groups()).toEqual(before);
  await first.press('ControlOrMeta+Shift+z'); await step(); expect(await groups()).toEqual(moved);
  await page.locator('[name=assembly-spacing]').fill('.375');
  await page.locator('[name=assembly-spacing]').press('Enter'); await step();
  expect((await groups()).slice(-2)).toEqual(moved.slice(-2));
  expect(await orbit()).toEqual(camera);
  await first.fill('13'); await first.blur(); await step(); await expect(first).toHaveValue('3.125');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone ? 390 : 1280);
  await page.screenshot({path:`test-results/supports-${phone ? 'phone' : 'desktop'}.png`,fullPage:true});
  for(const key of ['station','switch','repeated','assembly','track']) { await example.selectOption(key); await step(); await expect(example).toHaveValue(key); }
  for (const key of ['supports', 'station', 'switch']) {
    await page.goto(`./?example=${key}&stepped`);
    await expect(example).toHaveValue(key);
    if (key === 'supports') await expect(first).toHaveValue('2');
  }
});
