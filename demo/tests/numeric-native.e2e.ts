import { test, expect } from '@playwright/test';
for (const phone of [false, true]) test(`numeric native focus and vertical intent ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?example=supports'); await page.locator('body[data-ready=true]').waitFor();
  const input = page.locator('[name=assembly-post1]');
  await input.fill('3.125'); await input.press('Enter'); await expect(input).toBeFocused();
  await input.press('ControlOrMeta+a'); await input.press('4'); await input.press('.'); await input.press('2');
  await expect(input).toBeFocused(); await input.blur(); await expect(input).toHaveValue('4.2');
  const label = page.locator('label:has(input[name=assembly-post1])'); await label.scrollIntoViewIfNeeded();
  const b = (await label.boundingBox())!;
  await page.mouse.move(b.x + 8, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 9, b.y + b.height / 2 + 20); await page.mouse.up();
  await expect(input).toHaveValue('4.2');
  expect(await label.evaluate(el => el.hasPointerCapture(1))).toBe(false);
  expect(await label.evaluate(el => getComputedStyle(el).touchAction)).toContain('pan-y');
  if (phone) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await page.setViewportSize({ width: 390, height: 500 });
    const scroller = page.locator('aside');
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const startScroll = await scroller.evaluate(el => el.scrollTop);
    expect(startScroll).toBeGreaterThan(0);
    const box = (await label.boundingBox())!;
    const x = box.x + 8, y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 15 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeLessThan(startScroll);
    await expect(input).toHaveValue('4.2');
    await session.detach();
  }
});
