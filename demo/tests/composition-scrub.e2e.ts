import { expect, test } from '@playwright/test';

for (const example of ['assembly', 'placed', 'repeated']) test(`${example} numeric labels scrub geometry with bounded single-gesture history`, async ({ page }) => {
  await page.goto(`./?example=${example}&stepped`);
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  await step();
  await page.locator('[name=example]').selectOption(example); await step();
  const snapshot = () => page.evaluate(example => {
    const d = (window as any).demo;
    return example === 'assembly' ? { meshes: d.meshes(), instances: d.instances() } : d.instances();
  }, example);
  await page.evaluate(() => { const w = window as any; w.savedScrub = { camera: w.demo.camera, orbit: w.demo.orbit() }; });
  const names = example === 'assembly' ? ['separation', 'spacing'] : example === 'placed' ? ['x', 'y', 'z', 'yaw', 'pitch', 'roll'] : ['count', 'spacing', 'offset', 'yaw', 'pitch', 'roll'];
  for (const key of names) {
    const input = page.locator(`[name=${example === 'assembly' ? 'assembly' : 'placement'}-${key}]`);
    const label = input.locator('..');
    const initial = Number(await input.inputValue());
    const increment = Number(await input.getAttribute('step'));
    const before = await snapshot();
    const drag = async (dx: number[]) => {
      await label.scrollIntoViewIfNeeded();
      const box = (await label.boundingBox())!;
      const x = box.x + 20, y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      for (const delta of dx) { await page.mouse.move(x + delta, y); await step(); }
      await page.mouse.up(); await step();
    };
    expect(await label.evaluate(e => getComputedStyle(e).touchAction)).toBe('pan-y');
    await drag([4, 8, 12]);
    await expect(input).toHaveValue(String(Number((initial + 3 * increment).toFixed(10))));
    const after = await snapshot();
    expect(after).not.toEqual(before);
    await page.keyboard.press('ControlOrMeta+z'); await step();
    await expect(input).toHaveValue(String(initial));
    expect(await snapshot()).toEqual(before);
    await page.keyboard.press('ControlOrMeta+Shift+z'); await step();
    expect(await snapshot()).toEqual(after);
    // Large displacements reach the native limits; continued motion cannot exceed them.
    await drag([10000, 12000]);
    await expect(input).toHaveValue((await input.getAttribute('max'))!);
    await drag([-10000, -12000]);
    await expect(input).toHaveValue((await input.getAttribute('min'))!);
    // Restore this field so later fields still have a non-degenerate subject.
    await input.fill(String(initial)); await input.blur(); await step();
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() => {
      const w = window as any;
      return w.savedScrub.camera === w.demo.camera && JSON.stringify(w.savedScrub.orbit) === JSON.stringify(w.demo.orbit());
    })).toBe(true);
  }
});
