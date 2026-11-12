import { expect, test, type Page } from "@playwright/test";
import { pixels, changedPixels } from './pixels';
const step = (page: Page) => page.evaluate(() => (window as any).step());
async function start(page: Page) {
  await page.goto("./?stepped&component=local");
  await page.locator('body[data-ready="true"]').waitFor();
  await step(page);
}
async function down(page: Page, name = "spacing") {
  const box = (await page.locator(`label:has([name=${name}])`).boundingBox())!;
  const point = { x: box.x + 50, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  return point;
}
test("label scrub updates rendered geometry through native input and retains scene identity", async ({ page }) => {
  await start(page);
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 200, 200); await page.mouse.down(); await step(page);
  await page.mouse.move(box.x + 230, 215); await step(page);
  await page.mouse.up(); await step(page);
  await page.evaluate(() => {
    const w = window as any;
    w.saved = { document, app: w.demo.app, camera: w.demo.camera, orbit: w.demo.orbit() };
  });
  const before = await pixels(page, [480, 400]);
  const meshes = await page.evaluate(() => (window as any).demo.meshes());
  const p = await down(page);
  await page.mouse.move(p.x + 20, p.y);
  await expect(page.locator('[name=spacing]')).toHaveValue("0.9");
  await step(page);
  expect(await page.evaluate(() => (window as any).demo.meshes())).not.toEqual(meshes);
  const after = await pixels(page, [480, 400]);
  expect(await changedPixels(after, before)).toBeGreaterThan(30);
  await before.dispose(); await after.dispose();
  expect(await page.evaluate(() => {
    const w = window as any;
    return w.saved.document === document && w.saved.app === w.demo.app && w.saved.camera === w.demo.camera && JSON.stringify(w.saved.orbit) === JSON.stringify(w.demo.orbit());
  })).toBe(true);
  await page.mouse.up();
  await page.mouse.move(p.x + 80, p.y);
  await expect(page.locator('[name=spacing]')).toHaveValue("0.9");

});
test("scrub bounds, cleanup, disabled labels and native editing", async ({ page }) => {
  await start(page);
  const input = page.locator('[name=spacing]');
  const label = page.locator('label:has([name=spacing])');
  expect(await label.evaluate(e => getComputedStyle(e).cursor)).toBe("ew-resize");
  expect(await label.evaluate(e => getComputedStyle(e).touchAction)).toBe("pan-y");
  let p = await down(page);
  await page.mouse.up();
  await expect(input).toBeFocused();
  await input.fill("0.7"); await input.press("ArrowUp");
  await expect(input).toHaveValue("0.75");
  p = await down(page);
  await page.mouse.move(p.x + 400, p.y);
  await expect(input).toHaveValue("1.5");
  await page.mouse.move(p.x - 200, p.y);
  await expect(input).toHaveValue("0.3");
  await page.mouse.up();
  for (const event of ["pointercancel", "lostpointercapture", "blur"]) {
    await input.fill("0.65"); p = await down(page);
    await page.mouse.move(p.x + 4, p.y);
    await expect(input).toHaveValue("0.7");
    await label.evaluate((e, type) => {
      (type === "blur" ? window : e).dispatchEvent(new Event(type));
    }, event);
    await page.mouse.move(p.x + 40, p.y);
    await expect(input).toHaveValue("0.7");
    await page.mouse.up();
  }
  await page.locator('[name=component]').selectOption("fixed");
  const disabled = page.locator('label:has([name=separation])');
  expect(await disabled.evaluate(e => getComputedStyle(e).cursor)).not.toBe("ew-resize");
  p = await down(page, "separation"); await page.mouse.move(p.x + 40, p.y); await page.mouse.up();
  await expect(page.locator('[name=separation]')).toHaveValue("1.2");
});
test("all field columns align on desktop and phone", async ({ page }) => {
  await start(page);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await step(page);
    const rows = await page.locator('input, select').evaluateAll(elements => elements.filter(e => e.getClientRects().length).map(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, label: e.parentElement!.getBoundingClientRect().left })));
    expect(new Set(rows.map(r => r.left)).size).toBe(1);
    expect(new Set(rows.map(r => r.label)).size).toBe(1);
    expect(rows.every(r => r.right <= width)).toBe(true);

  }
});
