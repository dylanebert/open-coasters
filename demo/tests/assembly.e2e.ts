import { expect, test } from '@playwright/test';

for (const viewport of [{width:1280,height:800},{width:390,height:844}]) test(`asset assembly controls, history, framing and retained camera at ${viewport.width}`, async ({page}) => {
  await page.setViewportSize(viewport);
  const errors: string[] = []; page.on('pageerror',e => errors.push(e.message));
  await page.goto('./?example=assembly&stepped');
  await page.locator('body[data-ready="true"]').waitFor();
  const step = () => page.evaluate(() => (window as any).step());
  const orbit = () => page.evaluate(() => (window as any).demo.orbit());
  const groups = () => page.evaluate(() => (window as any).demo.instances());
  const example = page.locator('[name=example]'), path = page.locator('[name=assembly-path]'), tie = page.locator('[name=assembly-tie]');
  const camera = await page.evaluate(() => (window as any).demo.camera);
  await expect(example).toHaveValue('assembly');
  // Entry includes both rails, static ties and asymmetric fitting. Independent
  // conservative envelope of the banked quarter circle (including native meshes).
  const fits = async (low: number[],high: number[]) => {
    // Same 2/3 s of Orbit's time-based damping; four 60 Hz ticks per draw.
    await page.evaluate(async () => { for(let i=0;i<10;i++) await (window as any).step(1 / 15); });
    const points = Array.from({length:8},(_,i) => low.map((v,a) => i&(1<<a) ? high[a] : v));
    const projected = await page.evaluate(points => points.map(p => (window as any).demo.project(p)),points);
    const canvas = (await page.locator('canvas').boundingBox())!;
    for(const p of projected) { expect(p).not.toBeNull(); expect(p[0]).toBeGreaterThan(0); expect(p[0]).toBeLessThan(canvas.width); expect(p[1]).toBeGreaterThan(0); expect(p[1]).toBeLessThan(canvas.height); }
  };
  await fits([-1.1,.8,-6.4],[2.9,2.1,6.4]);
  await path.selectOption('straight'); await step();
  await fits([-.95,1.32,-6.09],[.95,1.895,6.20]);
  const before = await orbit();
  for(const [key,value] of Object.entries({separation:'1.6',spacing:'.3'})) {
    const input = page.locator(`[name=assembly-${key}]`);
    await input.fill(value); await input.press('Enter'); await step();
    await expect(input).toHaveValue(String(Number(value)));
    await input.press('ControlOrMeta+z'); await step();
    await expect(input).toHaveValue(key==='separation' ? '1.2' : '0.65');
    await input.press('ControlOrMeta+Shift+z'); await step();
    await expect(input).toHaveValue(String(Number(value)));
    expect(await orbit()).toEqual(before);
  }
  expect((await groups()).length).toBe(42); // rails + 40 ties + fitting
  (await groups()).at(-1)[0].translation.forEach((v: number,k: number) => expect(v).toBeCloseTo([.8,1.5,6][k],5));
  for(let i=0;i<4;i++) { await tie.selectOption(i%2 ? 'assembly-tie-bar':'assembly-tie-fork'); await step(); }
  expect(await orbit()).toEqual(before);
  await tie.selectOption('assembly-tie-fork'); await step();
  const g = await groups(); expect(g[1]).toHaveLength(3); expect(g.at(-1)).toHaveLength(2);
  g.forEach((group: any[]) => group.forEach(e => expect(e.scale).toEqual([1,1,1])));
  await path.selectOption('curve'); await step();
  expect((await orbit()).yaw).toBe(before.yaw); expect((await orbit()).pitch).toBe(before.pitch);
  (await groups()).at(-1)[0].translation.forEach((v: number,k: number) => expect(v).toBeCloseTo([4*Math.SQRT2-6+.2*Math.sqrt(6),1.9,4*Math.SQRT2+.2*Math.sqrt(6)][k],5));
  const retained = await orbit();
  for(const n of ['.35','.4','.45','.5']) { const input = page.locator('[name=assembly-spacing]'); await input.fill(n); await input.blur(); await step(); }
  expect(await orbit()).toEqual(retained);
  await example.selectOption('repeated'); await step();
  await example.selectOption('assembly'); await step();
  await expect(tie).toHaveValue('assembly-tie-fork'); await expect(path).toHaveValue('curve');
  expect(await page.evaluate(() => (window as any).demo.camera)).toBe(camera);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const canvas = (await page.locator('canvas').boundingBox())!, aside = (await page.locator('aside').boundingBox())!;
  if(viewport.width<500) expect(aside.y).toBeGreaterThanOrEqual(canvas.y+canvas.height-1);
  const form = (await page.locator('form').boundingBox())!;
  expect(form.height).toBeLessThan(viewport.width<500 ? 430 : 500);
  // A headless capture is evidence for review, not human acceptance.
  await page.screenshot({path:`test-results/assembly-${viewport.width}.png`,fullPage:true});
  expect(errors).toEqual([]);
});
