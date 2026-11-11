// Manual visual inspection only; run against a built preview, not the browser gate.
// bun tools/loop.oracle.ts http://127.0.0.1:4173/open-coasters/
import { expect, chromium, type Page } from "@playwright/test";
import { BROWSER_CONFIG } from "@dylanebert/shallot/testing";
const step = (page: Page) => page.evaluate(() => (window as any).step());
async function settle(page: Page) { for (let i = 0; i < 24; i++) await step(page); }
async function orbitTo(page: Page, yaw: number, pitch: number) {
  const orbit = await page.evaluate(() => (window as any).demo.orbit());
  const box = (await page.locator("canvas").boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await step(page);
  await page.mouse.move(x - (yaw - orbit.yaw) / 0.005, y + (pitch - orbit.pitch) / 0.005);
  await step(page);
  await page.mouse.up();
  await settle(page);
  const actual = await page.evaluate(() => (window as any).demo.orbit());
  expect(actual.yaw).toBeCloseTo(yaw, 4);
  expect(actual.pitch).toBeCloseTo(pitch, 4);
}
const browser = await chromium.launch({
  ...BROWSER_CONFIG.use.launchOptions,
  channel: BROWSER_CONFIG.use.channel,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const url = new URL(process.argv[2] ?? "http://127.0.0.1:4173/open-coasters/");
  url.search = "?stepped&configuration=loop";
  await page.goto(url.href);
  await page.locator('body[data-ready="true"]').waitFor();
  await settle(page);
  await page.screenshot({ path: "/tmp/coasters-stage4-perspective.png", fullPage: true });
  await orbitTo(page, Math.PI / 2, 0);
  await page.screenshot({ path: "/tmp/coasters-stage4-side.png", fullPage: true });
  await orbitTo(page, 0, 0);
  await page.screenshot({ path: "/tmp/coasters-stage4-front.png", fullPage: true });
  await orbitTo(page, 0.9, 0.25);
  // Zoom and lower the orbit target with actual input for the entry/exit detail.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.height / 2);
  await page.mouse.wheel(0, -160);
  await settle(page);
  await page.mouse.down({button: "middle"});
  await step(page);
  await page.mouse.move(box.x + box.width / 2, box.height / 2 - 180);
  await step(page);
  await page.mouse.up({button: "middle"});
  await settle(page);
  await page.screenshot({ path: "/tmp/coasters-stage4-entry-exit.png", fullPage: true });
  await expect(page.locator("[name=spacing]")).toBeEnabled();
  await expect(page.locator("[name=separation]")).toBeEnabled();
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
