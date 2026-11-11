import { holdFrames } from "@dylanebert/shallot/testing";
import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function pixels(page: Page) {
  const png = await page.locator("canvas").screenshot();
  return page.evaluate(async (base64) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    image.close();
    return Array.from(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    );
  }, png.toString("base64"));
}

function expectNonblank(rgba: number[]) {
  expect(
    rgba.filter((value, i) => Math.abs(value - rgba[i % 4]) > 8).length,
  ).toBeGreaterThan(1000);
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
  expectNonblank(before);
  await page.locator("[name=spacing]").fill("1.2");
  await frames.run(2);
  const after = await pixels(page);
  expect(
    after.filter((value, i) => Math.abs(value - before[i]) > 8).length,
  ).toBeGreaterThan(1000);
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
  await page.goto("./?stepped&configuration=isolated");
  await page.locator('body[data-ready="true"]').waitFor();
  const before = await pixels(page);
  expectNonblank(before);
  // Fixed production viewport: independently visible blue carrier and orange
  // facing landmark on each side, not merely a nonblank grid.
  const size = await page.locator("canvas").boundingBox();
  const width = Math.round(size!.width),
    height = Math.round(size!.height);
  for (const [left, right] of [
    [0, width / 2],
    [width / 2, width],
  ]) {
    let blue = 0,
      orange = 0;
    for (let y = 0; y < height; y++)
      for (let x = Math.floor(left); x < right; x++) {
        const i = (y * width + x) * 4;
        const [r, g, b] = before.slice(i, i + 3);
        if (b > r * 1.25 && b > g * 1.1 && b > 60) blue++;
        if (r > g * 1.2 && g > b * 1.3 && r > 80) orange++;
      }
    expect(blue).toBeGreaterThan(100);
    expect(orange).toBeGreaterThan(20);
  }
  await page.screenshot({ path: "/tmp/open-coasters-instance-candidate.png" });
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await step();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(800 + i * 16, 450 + i * 8);
    await step();
  }
  await page.mouse.up();
  await step();
  const changed = async (prior: number[]) => {
    const next = await pixels(page);
    return next.filter((value, i) => Math.abs(value - prior[i]) > 8).length;
  };
  expect(await changed(before)).toBeGreaterThan(1000);
  const orbited = await pixels(page);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  await step();
  expect(await changed(orbited)).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
