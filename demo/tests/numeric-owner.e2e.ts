import { test, expect } from '@playwright/test';
for (const phone of [false, true]) test(`ordinary numeric owner ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?example=supports');
  await page.locator('body[data-ready=true]').waitFor();
  const first = page.locator('[name=assembly-post1]');
  const groups = () => page.evaluate(() => (window as any).demo.instances());
  const before = await groups();
  const camera = await page.evaluate(() => (window as any).demo.orbit());
  async function drag(name: string, dx = 40, end = 'up') {
    const label = page.locator(`label:has(input[name="${name}"])`);
    await label.scrollIntoViewIfNeeded(); const b = (await label.boundingBox())!;
    await page.mouse.move(b.x + 8, b.y + b.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + 8 + dx * i / 8, b.y + b.height / 2);
    if (end !== 'up') await label.evaluate((el, mode) => mode === 'cancel' ? el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })) : el.releasePointerCapture(1), end);
    await page.mouse.up();
  }
  await drag('assembly-post1');
  await expect(first).toHaveValue('2.5');
  await expect.poll(async () => (await groups()).at(-2)[0].translation[2]).toBeCloseTo(-3.5, 6);
  expect((await groups()).slice(0, -2)).toEqual(before.slice(0, -2));
  expect((await groups()).at(-1)).toEqual(before.at(-1));
  await first.press('ControlOrMeta+z'); await expect(first).toHaveValue('2');
  await first.press('ControlOrMeta+Shift+z'); await expect(first).toHaveValue('2.5');
  await first.fill('3.125'); await first.press('Enter'); await expect(first).toBeFocused();
  await expect.poll(async () => (await groups()).at(-2)[0].translation[2]).toBeCloseTo(-2.875, 6);
  await drag('assembly-post1', 8); await expect(first).toHaveValue('3.225');
  await first.focus(); await first.press('ArrowUp'); await first.blur(); await expect(first).toHaveValue('4.225');
  for (const value of ['', '13']) { await first.fill(value); await first.blur(); await expect(first).toHaveValue('4.225'); }
  for (const end of ['cancel', 'lost']) {
    await drag('assembly-post1', 8, end); await expect(first).toHaveValue('4.325');
    await first.press('ControlOrMeta+z'); await expect(first).toHaveValue('4.225');
    await first.press('ControlOrMeta+Shift+z'); await expect(first).toHaveValue('4.325');
    await first.press('ControlOrMeta+z');
  }
  await first.fill('11.99'); await first.press('Enter'); await drag('assembly-post1'); await expect(first).toHaveValue('12');
  expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(camera);
  await page.screenshot({ path: `/home/dylan/.local/share/open-coasters/placement-numeric-owner/${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
  for (const example of ['supports', 'assembly', 'placed', 'repeated', 'track']) {
    await page.locator('[name=example]').selectOption(example);
    if (example === 'track') await page.locator('[name=component]').selectOption('local');
    for (const input of await page.locator('input[type=number]:visible').all()) {
      const name = (await input.getAttribute('name'))!;
      if (await input.isDisabled()) continue;
      const value = Number(await input.inputValue());
      await drag(name, -8);
      expect(Number(await input.inputValue()), name).not.toBe(value);
      await input.press('ControlOrMeta+z'); await expect(input).toHaveValue(String(value));
    }
  }
  await page.locator('[name=component]').selectOption('fixed');
  const gauge = page.locator('[name=separation]'); const fixed = await gauge.inputValue();
  await drag('separation'); await expect(gauge).toBeDisabled(); await expect(gauge).toHaveValue(fixed);
});
