import { expect, test, type Page } from "@playwright/test";
async function pixels(page: Page) {
  const png = await page.locator("canvas").screenshot();
  return page.evaluate(async (base64) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(480, 400);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 480, 400);
    image.close();
    return Array.from(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
    );
  }, png.toString("base64"));
}
test("Pages playground: selections and every metric control change rendered geometry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("./?stepped");
  const ready = async () => {
    await page.locator('body[data-ready="true"]').waitFor();
    await page.evaluate(() =>
      (window as unknown as { step: () => Promise<void> }).step(),
    );
  };
  await ready();
  let prior = await pixels(page);
  const build = async () => {
    const old = page.url();
    await page.getByRole("button").click();
    await page.waitForURL((url) => url.href !== old);
    await ready();
    const next = await pixels(page);
    let changed = 0;
    for (let i = 0; i < next.length; i += 4)
      if (
        Math.max(
          ...[0, 1, 2].map((c) => Math.abs(next[i + c] - prior[i + c])),
        ) > 8
      )
        changed++;
    expect(changed).toBeGreaterThan(30);
    prior = next;
  };
  for (const kind of ["straight", "curve", "loop"]) {
    await page.locator("[name=configuration]").selectOption(kind);
    await build();
    await page.screenshot({ path: `/tmp/coasters-track-${kind}.png` });
  }
  for (const [name, value] of [
    ["spacing", "1.2"],
    ["separation", "1.5"],
    ["width", "0.6"],
    ["depth", "0.8"],
  ]) {
    await page.locator(`[name=${name}]`).fill(value);
    await build();
  }
  await page.locator("[name=component]").selectOption("fixed");
  await build();
  await expect(page.locator("[name=separation]")).toHaveValue("1");
  await expect(page.locator("#explanation")).toContainText("never scaled");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  // Form edits do not orbit the camera before Build.
  prior = await pixels(page);
  await page.locator("[name=spacing]").fill("0.8");
  expect(await pixels(page)).toEqual(prior);
  expect(errors).toEqual([]);
});
