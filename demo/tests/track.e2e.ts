import { expect, test, type Page } from "@playwright/test";
async function pixels(page: Page) {
  const png = await page.locator("canvas").screenshot();
  return page.evaluate(async (base64) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(480, 400),
      context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 480, 400);
    image.close();
    return Array.from(context.getImageData(0, 0, 480, 400).data);
  }, png.toString("base64"));
}
const step = (page: Page) => page.evaluate(() => (window as any).step());
test("Pages: edits immediately change geometry in one document/app/camera and retain orbit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/\.(gltf|bin)(\?|$)/.test(request.url())) requests.push(request.url());
  });
  await page.goto("./?stepped");
  await page.locator('body[data-ready="true"]').waitFor();
  await step(page);
  const originalUrl = page.url();
  await expect(page.getByRole("button")).toHaveCount(0);
  await page.evaluate(() => {
    const w = window as any;
    w.witness = {
      document,
      app: w.demo.app,
      world: w.demo.app.world,
      camera: w.demo.camera,
    };
  });
  const requestCount = requests.length;
  // Real orbit and zoom, not a synthetic storage write.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.height / 2);
  await page.mouse.down();
  await step(page);
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(
      box.x + box.width / 2 + i * 8,
      box.height / 2 + i * 4,
    );
    await step(page);
  }
  await page.mouse.up();
  await step(page);
  await page.mouse.wheel(0, -100);
  await step(page);
  const orbit = await page.evaluate(() => (window as any).demo.orbit());
  let prior = await pixels(page);
  const edited = async () => {
    await step(page);
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
    expect(page.url()).toBe(originalUrl);
    expect(
      await page.evaluate(() => {
        const w = window as any;
        return (
          w.witness.document === document &&
          w.witness.app === w.demo.app &&
          w.witness.world === w.demo.app.world &&
          w.witness.camera === w.demo.camera
        );
      }),
    ).toBe(true);
    expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(
      orbit,
    );
  };
  for (const kind of ["straight", "curve", "loop"]) {
    await page.locator("[name=configuration]").selectOption(kind);
    await edited();
    await page.screenshot({
      path: `/tmp/coasters-stage2-${kind}.png`,
      fullPage: true,
    });
  }
  for (const [name, value] of [
    ["spacing", "1.2"],
    ["separation", "1.5"],
    ["width", "0.6"],
    ["depth", "0.8"],
  ]) {
    await page.locator(`[name=${name}]`).fill(value);
    await edited();
  }
  await page.locator("[name=spacing]").fill("0.8");
  await edited();
  const latest = await page.evaluate(() => (window as any).demo.meshes());
  // Multiple edits before a frame: compare actual registered geometry with the presented final value.
  await page.locator("[name=spacing]").fill("0.4");
  await page.locator("[name=spacing]").fill("0.8");
  await step(page);
  expect(await page.evaluate(() => (window as any).demo.meshes())).toEqual(
    latest,
  );
  prior = await pixels(page);
  await page.locator("[name=component]").selectOption("fixed");
  await edited();
  await expect(page.locator("[name=separation]")).toHaveValue("1");
  await expect(page.locator("[name=separation]")).toBeDisabled();
  await expect(page.locator("#meaning")).toContainText("unscaled");
  await page.screenshot({
    path: "/tmp/coasters-stage2-fixed.png",
    fullPage: true,
  });
  await page.locator("[name=component]").selectOption("local");
  await edited();
  await expect(page.locator("[name=separation]")).toBeEnabled();
  await expect(page.locator("[name=separation]")).toHaveValue("1.5");
  await expect(page.locator("[name=asset]")).toBeHidden();
  await page.locator("[name=configuration]").selectOption("isolated");
  await edited();
  await expect(page.locator("[name=asset]")).toBeVisible();
  await expect(page.locator("#ties")).toBeHidden();
  await expect(page.locator("#spine")).toBeHidden();
  await page.locator("[name=asset]").selectOption("blitz-tie");
  await edited();
  await page.screenshot({
    path: "/tmp/coasters-stage2-isolated.png",
    fullPage: true,
  });
  expect(requests.length).toBe(requestCount);
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return [
        '13px "IBM Plex Sans"',
        '12px "JetBrains Mono"',
        '700 15px "JetBrains Mono"',
      ].every((font) => document.fonts.check(font));
    }),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("desktop and phone fields are aligned, keyboard editable, locally fonted and contained", async ({
  page,
}) => {
  await page.goto("./?stepped");
  await page.locator('body[data-ready="true"]').waitFor();
  await expect(page.locator("[name=width]")).toHaveValue("0.28");
  await page.locator("canvas").click();
  await step(page);
  const orbit = await page.evaluate(() => (window as any).demo.orbit());
  await page.locator("[name=width]").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("0.4");
  await expect(page.locator("[name=width]")).toBeFocused();
  await page.keyboard.down("ArrowUp");
  await step(page);
  await page.keyboard.up("ArrowUp");
  await expect(page.locator("[name=width]")).toHaveValue("0.41");
  expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(
    orbit,
  );
  await step(page);
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).search).toBe("?stepped");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await step(page);
    const layout = await page.evaluate(() => {
      const panel = document.querySelector("aside")!;
      const controls = [
        ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "input,select",
        ),
      ].filter((e) => e.getClientRects().length);
      return {
        width: document.documentElement.scrollWidth,
        panelOverflow: panel.scrollWidth > panel.clientWidth,
        controls: controls.map((e) => ({
          left: e.getBoundingClientRect().left,
          right: e.getBoundingClientRect().right,
          height: e.getBoundingClientRect().height,
        })),
        canvasHeight: document.querySelector("canvas")!.getBoundingClientRect()
          .height,
      };
    });
    expect(layout.width).toBe(width);
    expect(layout.panelOverflow).toBe(false);
    expect(new Set(layout.controls.map((c) => c.left)).size).toBe(1);
    for (const control of layout.controls) {
      expect(control.right).toBeLessThanOrEqual(width);
      expect(control.height).toBeGreaterThanOrEqual(width <= 480 ? 44 : 32);
    }
    expect(layout.canvasHeight).toBeGreaterThan(300);
    if (width === 390)
      await page.screenshot({
        path: "/tmp/coasters-stage2-phone.png",
        fullPage: true,
      });
  }
  const fontRequests = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((name) => name.endsWith(".woff2")),
  );
  expect(fontRequests).toHaveLength(3);
  expect(
    fontRequests.every((url) =>
      new URL(url).pathname.startsWith("/open-coasters/fonts/"),
    ),
  ).toBe(true);
});
