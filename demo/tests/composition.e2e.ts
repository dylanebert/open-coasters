import { expect, test } from '@playwright/test';

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
