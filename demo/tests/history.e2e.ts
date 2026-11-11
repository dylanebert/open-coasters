import { expect, test } from '@playwright/test';
import { pixels, changedPixels } from './pixels';

test('native sessions, grouped drag/color, shortcuts, gauge memory and render undo', async ({ page }) => {
  await page.goto('./?stepped');
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  await step();
  const width = page.locator('[name=width]');
  await width.focus(); await width.press('ControlOrMeta+A'); await width.pressSequentially('0.4');
  await width.press('ArrowUp');
  await expect(width).toHaveValue('0.41');
  await width.press('Enter');
  await width.press('ControlOrMeta+z');
  await expect(width).toHaveValue('0.28');
  await width.press('ControlOrMeta+Shift+z');
  await expect(width).toHaveValue('0.41');
  await width.blur();
  const spacing = page.locator('[name=spacing]');
  const box = (await page.locator('label:has([name=spacing])').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2); await page.mouse.down();
  for (const dx of [4, 8, 20]) await page.mouse.move(box.x + 40 + dx, box.y + box.height / 2);
  await page.mouse.up();
  await expect(spacing).toHaveValue('0.9');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(spacing).toHaveValue('0.65');
  await expect(width).toHaveValue('0.41');
  await page.keyboard.press('Control+y');
  await expect(spacing).toHaveValue('0.9');
  const gauge = page.locator('[name=separation]');
  await gauge.fill('1.4'); await gauge.blur();
  await page.locator('[name=component]').selectOption('fixed');
  await expect(gauge).toBeDisabled(); await expect(gauge).toHaveValue('1');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(gauge).toBeEnabled(); await expect(gauge).toHaveValue('1.4');
  await step();
  const before = await pixels(page, [480, 400]);
  const color = page.locator('[name=railsColor]');
  // Native picker emits a stream of input previews, then change on acceptance.
  await color.evaluate(input => {
    const e = input as HTMLInputElement;
    for (const value of ['#ff0000', '#ff00ff', '#00ff00']) { e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); }
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await step();
  await expect(color).toHaveValue('#00ff00');
  const painted = await pixels(page, [480, 400]);
  expect(await changedPixels(painted, before)).toBeGreaterThan(30);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(color).toHaveValue('#50d3dd');
  await step();
  const restored = await pixels(page, [480, 400]);
  expect(await changedPixels(restored, before)).toBe(0);
  await before.dispose(); await painted.dispose(); await restored.dispose();
  await width.fill('0.5'); await width.blur();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(width).toHaveValue('0.5');
  await expect(color).toHaveValue('#50d3dd');
});
