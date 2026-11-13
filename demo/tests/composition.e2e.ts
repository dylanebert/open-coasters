import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`retained far and wide subjects are projected inside the view at ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto('./?stepped');
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  const example = page.getByRole('combobox', { name: 'Example', exact: true });
  const orbit = () => page.evaluate(() => (window as any).demo.orbit());
  const camera = await page.evaluate(() => (window as any).demo.camera);
  const fitInside = async (low: number[], high: number[]) => {
    // Same 2/3 s of Orbit's time-based damping; four 60 Hz ticks per draw.
    await page.evaluate(async () => { for (let i = 0; i < 10; i++) await (window as any).step(1 / 15); });
    const points = Array.from({ length: 8 }, (_, i) => low.map((v, a) => i & (1 << a) ? high[a] : v));
    const projected = await page.evaluate(points => points.map(p => (window as any).demo.project(p)), points);
    const box = (await page.locator('canvas').boundingBox())!;
    for (const point of projected) {
      expect(point).not.toBeNull();
      expect(point[0]).toBeGreaterThan(box.width * .02);
      expect(point[0]).toBeLessThan(box.width * .98);
      expect(point[1]).toBeGreaterThan(box.height * .02);
      expect(point[1]).toBeLessThan(box.height * .98);
    }
  };
  await example.selectOption('placed'); await step();
  const before = await orbit();
  for (const key of ['x', 'y', 'z']) {
    await page.locator(`[name=placement-${key}]`).fill('10');
    await page.locator(`[name=placement-${key}]`).blur(); await step();
  }
  expect(await orbit()).toEqual(before);
  await example.selectOption('track'); await step();
  await example.selectOption('placed'); await step();
  const far = await orbit();
  far.pan.slice(0,3).forEach((v: number,a: number) => expect(v).toBeCloseTo([10.25,10.6,10.05][a], 5));
  expect(far.yaw).toBe(before.yaw); expect(far.pitch).toBe(before.pitch);
  // Independently measured source bounds, translated without changing dimensions.
  await fitInside([9.3,10.3,9.4], [11.2,10.9,10.7]);
  const groups = await page.evaluate(() => (window as any).demo.instances());
  groups[0][1].translation.forEach((v: number,a: number) => expect(v).toBeCloseTo([10.25,10.6,10.45][a], 5));
  await page.getByRole('combobox', { name: 'Asset', exact: true }).selectOption('blitz-tie'); await step();
  await page.getByRole('combobox', { name: 'Asset', exact: true }).selectOption('wheel-carrier'); await step();
  await fitInside([9.3,10.3,9.4], [11.2,10.9,10.7]);
  await example.selectOption('repeated'); await step();
  const beforeWide = await orbit();
  for (const [key,value] of Object.entries({ count: '12', spacing: '5', offset: '-10' })) {
    await page.locator(`[name=placement-${key}]`).fill(value);
    await page.locator(`[name=placement-${key}]`).blur(); await step();
  }
  expect(await orbit()).toEqual(beforeWide);
  await example.selectOption('track'); await step();
  await example.selectOption('repeated'); await step();
  const wide = await orbit();
  wide.pan.slice(0,3).forEach((v: number,a: number) => expect(v).toBeCloseTo([17.75,.6,.05][a], 5));
  expect(wide.yaw).toBe(before.yaw); expect(wide.pitch).toBe(before.pitch);
  await fitInside([-10.7,.3,-.6], [46.2,.9,.7]);
  expect(await page.evaluate(() => (window as any).demo.camera)).toBe(camera);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`authored controls and history retain camera at ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto('./?stepped');
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  const example = page.getByRole('combobox', { name: 'Example', exact: true });
  await example.selectOption('placed'); await step();
  const camera = await page.evaluate(() => (window as any).demo.camera);
  const orbit = await page.evaluate(() => (window as any).demo.orbit());
  const placedValues: Record<string, number> = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  const nose = () => {
    const { yaw, pitch, roll, x, y, z } = placedValues;
    const [a,b,c] = [roll,pitch,yaw].map(v => v*Math.PI/180);
    // Independent successive source-landmark rotations, not placement-policy output.
    const rx = .25*Math.cos(a)-.6*Math.sin(a), ry = .25*Math.sin(a)+.6*Math.cos(a);
    const py = ry*Math.cos(b)-.45*Math.sin(b), pz = ry*Math.sin(b)+.45*Math.cos(b);
    return [x+rx*Math.cos(c)+pz*Math.sin(c), y+py, z-rx*Math.sin(c)+pz*Math.cos(c)];
  };
  const checkNose = async () => {
    const groups = await page.evaluate(() => (window as any).demo.instances());
    groups[0][1].translation.forEach((v: number,k: number) => expect(v).toBeCloseTo(nose()[k], 5));
    expect(groups[0][1].scale).toEqual([1,1,1]);
  };
  for (const [key, value] of Object.entries({ x: '1.2', y: '.5', z: '-1', yaw: '90', pitch: '30', roll: '-45' })) {
    const input = page.locator(`[name=placement-${key}]`);
    await input.fill(value); await input.press('Enter'); await step();
    await expect(input).toHaveValue(String(Number(value)));
    placedValues[key] = Number(value); await checkNose();
    await input.press('ControlOrMeta+z'); await step();
    await expect(input).toHaveValue('0');
    await input.press('ControlOrMeta+Shift+z'); await step();
    await expect(input).toHaveValue(String(Number(value)));
  }
  expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(orbit);
  await page.getByRole('combobox', { name: 'Asset', exact: true }).selectOption('blitz-tie'); await step();
  await example.selectOption('repeated'); await step();
  const repeatedOrbit = await page.evaluate(() => (window as any).demo.orbit());
  for (const [key,value] of Object.entries({ count: '5', spacing: '1.5', offset: '-3', yaw: '-90', pitch: '-30', roll: '45' })) {
    const input = page.locator(`[name=placement-${key}]`);
    await input.fill(value); await input.blur(); await step();
    await expect(input).toHaveValue(value);
  }
  const repeated = await page.evaluate(() => (window as any).demo.instances());
  expect(repeated).toHaveLength(5);
  repeated.forEach((group: any[], i: number) => group[0].translation.forEach((v: number,k: number) => expect(v).toBeCloseTo([-3+i*1.5,0,0][k], 5)));
  expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(repeatedOrbit);
  expect(await page.evaluate(() => (window as any).demo.camera)).toBe(camera);
  await page.getByRole('combobox', { name: 'Asset', exact: true }).selectOption('wheel-carrier'); await step();
  Object.assign(placedValues, { x: -3, y: 0, z: 0, yaw: -90, pitch: -30, roll: 45 });
  const wheelGroups = await page.evaluate(() => (window as any).demo.instances());
  wheelGroups.forEach((group: any[], i: number) => group[1].translation.forEach((v: number,k: number) => expect(v).toBeCloseTo(nose()[k] + (k === 0 ? i*1.5 : 0), 5)));
  await example.selectOption('track'); await step();
  for (const value of ['straight', 'curve', 'loop']) {
    await page.getByRole('combobox', { name: 'Track', exact: true }).selectOption(value); await step();
    await expect(page.getByRole('combobox', { name: 'Track', exact: true })).toHaveValue(value);
  }
  await example.selectOption('placed'); await step();
  await expect(page.locator('[name=placement-x]')).toHaveValue('1.2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const canvas = await page.locator('canvas').boundingBox();
  const aside = await page.locator('aside').boundingBox();
  if (viewport.width < 500) expect(aside!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height - 1);
});
