import { holdFrames } from "@dylanebert/shallot/testing";
import { expect, test, type Page } from "@playwright/test";
import { pixels, nonblank, changedChannels, landmarks, type Pixels } from "./pixels";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("ordinary Pages route runs and presents a nonblank scene", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const frames = await holdFrames(page, 'body[data-ready="true"]');
  await page.goto("./");
  await page.locator('body[data-ready="true"]').waitFor();
  await frames.run(2);
  await expect(page.locator("canvas")).toBeVisible();
  const before = await pixels(page);
  expect(await nonblank(before)).toBeGreaterThan(1000);
  await page.locator("[name=spacing]").fill("1.2");
  await frames.run(2);
  const after = await pixels(page);
  expect(await changedChannels(after, before)).toBeGreaterThan(1000);
  await before.dispose();
  await after.dispose();
  expect(errors).toEqual([]);
});

test("Pages build presents metric scene and responds to orbit and zoom", async ({
  page,
}) => {
  const errors = watchErrors(page);
  const step = () =>
    page.evaluate(() =>
      (window as unknown as { step: () => Promise<void> }).step(),
    );
  await page.goto("./?stepped&asset=wheel-carrier");
  await page.locator('body[data-ready="true"]').waitFor();
  const before = await pixels(page);
  expect(await nonblank(before)).toBeGreaterThan(1000);
  // Fixed production viewport: independently visible blue carrier and orange
  // facing landmark on each side, not merely a nonblank grid.
  const size = await page.locator("canvas").boundingBox();
  const width = Math.round(size!.width),
    height = Math.round(size!.height);
  for (const { blue, orange } of await landmarks(before, width, height)) {
    expect(blue).toBeGreaterThan(100);
    expect(orange).toBeGreaterThan(20);
  }
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await step();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(800 + i * 16, 450 + i * 8);
    await step();
  }
  await page.mouse.up();
  await step();
  const changed = async (prior: Pixels) => {
    const next = await pixels(page);
    const count = await changedChannels(next, prior);
    await next.dispose();
    return count;
  };
  expect(await changed(before)).toBeGreaterThan(1000);
  const orbited = await pixels(page);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  await step();
  expect(await changed(orbited)).toBeGreaterThan(1000);
  await before.dispose();
  await orbited.dispose();
  expect(errors).toEqual([]);
});
