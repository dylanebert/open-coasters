import { test, expect } from '@playwright/test';
import { exampleMenu } from './navigation';
for (const phone of [false, true]) test(`ordinary numeric owner ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?example=supports&stepped');
  await page.locator('body[data-ready=true]').waitFor();
  const first = page.locator('[name=assembly-post1]');
  const groups = () => page.evaluate(async () => { await (window as any).step(); return (window as any).demo.instances(); });
  const before = await groups();
  const camera = await page.evaluate(() => (window as any).demo.orbit());
  async function drag(name: string, dx = 40, end = 'up') {
    const label = page.locator(`label:has(input[name="${name}"])`);
    await label.scrollIntoViewIfNeeded(); const b = (await label.boundingBox())!;
    await page.mouse.move(b.x + 8, b.y + b.height / 2); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + 8 + dx * i / 8, b.y + b.height / 2);
    if (end !== 'up') await label.evaluate((el, mode) => mode === 'cancel' ? el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })) : el.releasePointerCapture(1), end);
    await page.mouse.up();
  }
  await drag('assembly-post1');
  await expect(first).toHaveValue('2.5');
  await expect.poll(async () => (await groups()).at(-2)[0].translation[2]).toBeCloseTo(6-2.5, 6);
  expect((await groups()).slice(0, -2)).toEqual(before.slice(0, -2));
  expect((await groups()).at(-1)).toEqual(before.at(-1));
  await first.press('ControlOrMeta+z'); await expect(first).toHaveValue('2');
  await first.press('ControlOrMeta+Shift+z'); await expect(first).toHaveValue('2.5');
  await first.fill('3.125'); await first.press('Enter'); await expect(first).toBeFocused();
  await expect.poll(async () => (await groups()).at(-2)[0].translation[2]).toBeCloseTo(6-3.125, 6);
  await drag('assembly-post1', 8); await expect(first).toHaveValue('3.225');
  await first.focus(); await first.press('ArrowUp'); await first.blur(); await expect(first).toHaveValue('4.225');
  for (const value of ['', '13']) { await first.fill(value); await first.blur(); await expect(first).toHaveValue('4.225'); }
  for (const end of ['cancel', 'lost']) {
    await drag('assembly-post1', 8, end); await expect(first).toHaveValue('4.325');
    await first.press('ControlOrMeta+z'); await expect(first).toHaveValue('4.225');
    await first.press('ControlOrMeta+Shift+z'); await expect(first).toHaveValue('4.325');
    await first.press('ControlOrMeta+z');
  }
  await first.fill('11.99'); await first.press('Enter'); await drag('assembly-post1'); await expect(first).toHaveValue('12');
  expect(await page.evaluate(() => (window as any).demo.orbit())).toEqual(camera);
  await page.screenshot({ path: `/home/dylan/.local/share/open-coasters/placement-navigation/numeric-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
  for (const example of ['supports', 'ties', 'station', 'track']) {
    await exampleMenu(page).selectOption(example);
    for (const input of await page.locator('input[type=number]:visible').all()) {
      const name = (await input.getAttribute('name'))!;
      if (await input.isDisabled()) continue;
      const value = Number(await input.inputValue());
      const geometry = () => page.evaluate(async () => { await (window as any).step(); return JSON.stringify([(window as any).demo.instances(), (window as any).demo.trackPositions()]); });
      const before = await geometry();
      await drag(name, -8);
      expect(Number(await input.inputValue()), name).not.toBe(value);
      // Rail offset changes mesh bytes; repetition and supports change placements.
      // A small gap boundary move need not cross a tie, so its effect is checked below.
      if (!name.startsWith('gap-')) await expect.poll(geometry).not.toBe(before);
      await input.press('ControlOrMeta+z'); await expect(input).toHaveValue(String(value));
    }
  }
  await exampleMenu(page).selectOption('station');
  const start = page.locator('[name=gap-start]'), end = page.locator('[name=gap-end]');
  async function type(name: string, text: string) { const input=page.locator(`[name=${name}]`); await input.fill(text); await input.press('Enter'); }
  const zs=()=>page.evaluate(async()=>{await (window as any).step();return (window as any).demo.instances().slice(1).map((g:any)=>g[0].translation[2]);});
  await type('assembly-spacing','1'); await type('gap-start','2'); await type('gap-end','5');
  await expect.poll(zs).toEqual([0,1,5,6,7,8,9,10,11].map(s=>6-s));
  await drag('gap-start',8); await expect(start).toHaveValue('2.1');
  await expect.poll(zs).toEqual([0,1,2,5,6,7,8,9,10,11].map(s=>6-s));
  await start.press('ControlOrMeta+z'); await expect.poll(zs).toEqual([0,1,5,6,7,8,9,10,11].map(s=>6-s));
  await type('gap-end','2'); await expect.poll(zs).toEqual([0,1,2,3,4,5,6,7,8,9,10,11].map(s=>6-s));
  await type('gap-start','2.001'); await expect(start).toHaveValue('2');
  await drag('gap-start',80); await expect(start).toHaveValue('2');
  await type('gap-start','0');await type('gap-end','12');await expect.poll(zs).toEqual([]);
  await type('gap-end','0');await expect.poll(zs).toEqual([0,1,2,3,4,5,6,7,8,9,10,11].map(s=>6-s));
  await type('gap-start','0.001');await expect(start).toHaveValue('0');
  await expect(end).toHaveAttribute('min','0');
});
