import type { Page } from "@playwright/test";

// The PNG is the presented canvas, not a second render or geometry proxy.
// Keep decoded pixels in the page; only predicate counts cross back to Node.
export async function pixels(page: Page, size?: [number, number]) {
  const png = await page.locator("canvas").screenshot();
  return page.evaluateHandle(async ({ base64, size }) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))]),
    );
    const canvas = new OffscreenCanvas(size?.[0] ?? image.width, size?.[1] ?? image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  }, { base64: png.toString("base64"), size });
}

export type Pixels = Awaited<ReturnType<typeof pixels>>;
export const nonblank = (rgba: Pixels) => rgba.evaluate(data => {
  let count = 0;
  for (let i = 0; i < data.length; i++)
    if (Math.abs(data[i] - data[i % 4]) > 8) count++;
  return count;
});
export const changedChannels = (next: Pixels, prior: Pixels) =>
  next.evaluate((data, before) => {
    let count = 0;
    for (let i = 0; i < data.length; i++)
      if (Math.abs(data[i] - before[i]) > 8) count++;
    return count;
  }, prior);
export const changedPixels = (next: Pixels, prior: Pixels) =>
  next.evaluate((data, before) => {
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (Math.max(...[0, 1, 2].map(c => Math.abs(data[i + c] - before[i + c]))) > 8) count++;
    return count;
  }, prior);
export const landmarks = (rgba: Pixels, width: number, height: number) =>
  rgba.evaluate((data, { width, height }) =>
    [[0, width / 2], [width / 2, width]].map(([left, right]) => {
      let blue = 0, orange = 0;
      for (let y = 0; y < height; y++)
        for (let x = Math.floor(left); x < right; x++) {
          const i = (y * width + x) * 4;
          const [r, g, b] = data.slice(i, i + 3);
          if (b > r * 1.25 && b > g * 1.1 && b > 60) blue++;
          if (r > g * 1.2 && g > b * 1.3 && r > 80) orange++;
        }
      return { blue, orange };
    }), { width, height });
