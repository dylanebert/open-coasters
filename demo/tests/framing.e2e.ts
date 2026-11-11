import { expect, test } from '@playwright/test';
import { pixels } from './pixels';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`initial loop centered without crop ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('./?configuration=loop&stepped');
    await page.locator('body[data-ready="true"]').waitFor();
    const step = () => page.evaluate(() => (window as any).step());
    await step();
    const initialOrbit = await page.evaluate(() => (window as any).demo.orbit());
    // Independently recorded default generated bounds; geometry stays in world space.
    for (const [axis, value] of [3.52908933, 8.17340931, 1.08367634].entries())
      expect(initialOrbit.pan[axis]).toBeCloseTo(value, 5);
    expect(initialOrbit.distance).toBe(26);
    await expect(page.getByRole('button', { name: /Undo|Redo|Build/ })).toHaveCount(0);
    const canvas = (await page.locator('canvas').boundingBox())!;
    const rgba = await pixels(page);
    const bounds = await rgba.evaluate((data, { width, height }) => {
      let left = width, right = 0, top = height, bottom = 0, count = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (g > r * 1.3 && b > r * 1.3 && g > 65) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
        }
      }
      return { left, right, top, bottom, count, width, height };
    }, { width: Math.round(canvas.width), height: Math.round(canvas.height) });
    await rgba.dispose();
    console.log('loop viewport bounds', viewport, bounds);
    expect(bounds.count).toBeGreaterThan(100);
    expect(bounds.left).toBeGreaterThan(10);
    expect(bounds.top).toBeGreaterThan(10);
    expect(bounds.right).toBeLessThan(bounds.width - 10);
    expect(bounds.bottom).toBeLessThan(bounds.height - 10);
    expect(Math.abs((bounds.left + bounds.right) / 2 / bounds.width - 0.5)).toBeLessThan(0.1);
    expect(Math.abs((bounds.top + bounds.bottom) / 2 / bounds.height - 0.5)).toBeLessThan(0.1);
    await page.screenshot({ path: info.outputPath(`loop-${viewport.width}.png`) });
    // An actual orbit survives parameter, paint and history edits in the same app.
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.down(); await step();
    await page.mouse.move(canvas.x + canvas.width / 2 + 20, canvas.y + canvas.height / 2 + 10);
    await step(); await page.mouse.up(); await step();
    const orbit = await page.evaluate(() => (window as any).demo.orbit());
    await page.locator('[name=width]').fill('0.4');
    await page.locator('[name=width]').blur();
    await step();
    await page.locator('[name=railsColor]').evaluate(input => {
      (input as HTMLInputElement).value = '#ff0000';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await step();
    await page.keyboard.press('ControlOrMeta+z'); await step();
    expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(orbit);
  });
}
