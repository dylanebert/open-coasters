import { expect, test } from "@playwright/test";

for (const stepped of [false, true]) {
  test(`entry delay covers cold load and refresh (${stepped ? "stepped" : "normal"})`, async ({ page }) => {
    for (const refresh of [false, true]) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let requested!: () => void;
      const seen = new Promise<void>((resolve) => { requested = resolve; });
      await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
        requested();
        await gate;
        await route.continue();
      });
      let releaseAsset!: () => void;
      const assetGate = new Promise<void>((resolve) => { releaseAsset = resolve; });
      await page.route(/\/assets\/.*\.gltf$/, async (route) => {
        await assetGate;
        await route.continue();
      });
      const navigation = refresh
        ? page.reload({ waitUntil: "commit" })
        : page.goto(`./${stepped ? "?stepped" : ""}`, { waitUntil: "commit" });
      await navigation;
      await seen;
      await expect(page.locator("aside")).toBeHidden();
      await expect(page.locator("main")).toBeHidden();
      const bootstrap = page.locator("[data-shallot-bootstrap]");
      await expect(bootstrap).toBeVisible();
      await expect(bootstrap).toHaveCSS("position", "fixed");
      await expect(bootstrap).toHaveCSS("background-color", "rgb(28, 25, 23)");
      release();
      await expect(page.locator("[data-shallot-loading]")).toBeVisible();
      await expect(bootstrap).toHaveCount(0);
      await expect(page.locator("aside")).toBeHidden();
      await expect(page.locator("main")).toBeHidden();
      releaseAsset();
      await page.locator('body[data-ready="true"]').waitFor();
      await expect(bootstrap).toHaveCount(0);
      await expect(page.locator("[data-shallot-loading]")).toHaveCount(0);
      await expect(page.locator("aside")).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
      await expect(page.locator("aside")).toHaveCSS("background-color", "rgb(28, 25, 23)");
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("failed entry leaves a visible error, not controls", async ({ page }) => {
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort("failed"));
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Unable to start");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("aside")).toBeHidden();
});
