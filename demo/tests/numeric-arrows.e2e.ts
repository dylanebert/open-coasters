import { test, expect } from '@playwright/test';
import { exampleMenu } from './navigation';

test('ordinary running native type, arrows, focus and history', async ({page}) => {
  await page.goto('./?example=assembly');
  await page.locator('body[data-ready=true]').waitFor();
  for(const [example,name,typed,incremented] of [
    ['assembly','assembly-separation','1.4','1.45'],
    ['ties','assembly-spacing','0.65','0.7'],
    ['station','assembly-spacing','0.65','0.7'],
  ]) {
    await exampleMenu(page).selectOption(example);
    const input=page.locator(`[name=${name}]`);
    await input.fill(typed);await input.press('Enter');await expect(input).toBeFocused();
    await input.press('ArrowUp');await expect(input).toHaveValue(incremented);await expect(input).toBeFocused();
    await input.blur();await input.press('ControlOrMeta+z');await expect(input).toHaveValue(typed);
    await input.press('ControlOrMeta+Shift+z');await expect(input).toHaveValue(incremented);
  }
});

test('stepped native arrows change independently expected rendered rails and placements', async ({ page }) => {
  await page.goto('./?example=assembly&stepped');
  await page.locator('body[data-ready=true]').waitFor();
  await page.locator('[name=assembly-path]').selectOption('straight');
  const separation = page.locator('[name=assembly-separation]');
  await separation.fill('1.4'); await separation.press('Enter');
  await separation.press('ArrowUp'); await separation.blur();
  await expect(separation).toHaveValue('1.45');
  const output = await page.evaluate(async () => {
    await (window as any).step();
    return (window as any).demo.trackPositions()[0] as {positions:number[];positionOffset:number[];positionScale:number[]};
  });
  // Public MeshQuant / encodePos / decodePos: independent physical x on the
  // selected immutable AABB-relative unorm16 lattice, not a vertex-derived oracle.
  const offset=output.positionOffset[0], scale=output.positionScale[0];
  const onLattice=(x:number)=>offset+Math.round(Math.max(0,Math.min(1,(x-offset)/scale))*65535)/65535*scale;
  const expected=onLattice(-.785); // -(1.45 / 2) - .06 section half-width
  expect(Math.min(...output.positions.filter((_,i)=>i%3===0))).toBeCloseTo(expected,5);
  // A stale pre-arrow 1.4m separation must not satisfy this same oracle/tolerance.
  await separation.press('ControlOrMeta+z');await expect(separation).toHaveValue('1.4');
  const stale=await page.evaluate(async()=>{await (window as any).step();return (window as any).demo.trackPositions()[0];});
  expect(stale.positionOffset).toEqual(output.positionOffset);expect(stale.positionScale).toEqual(output.positionScale);
  expect(Math.min(...stale.positions.filter((_:number,i:number)=>i%3===0))).not.toBeCloseTo(expected,5);
  await separation.press('ControlOrMeta+Shift+z');await expect(separation).toHaveValue('1.45');
  await separation.press('ControlOrMeta+z'); await expect(separation).toHaveValue('1.4');
  for (const example of ['ties', 'station']) {
    await exampleMenu(page).selectOption(example);
    if (example === 'station') {
      for (const name of ['gap-start', 'gap-end']) { const input=page.locator(`[name=${name}]`); await input.fill('0'); await input.press('Enter'); }
    }
    const spacing = page.locator('[name=assembly-spacing]');
    await expect(spacing).toHaveValue('0.65');
    await spacing.focus(); await spacing.press('ArrowUp'); await spacing.blur();
    await expect(spacing).toHaveValue('0.7');
    const count = 19; // 18 origins on either path at .7m, plus the rail mesh.
    await expect.poll(() => page.evaluate(async () => { await (window as any).step(); return (window as any).demo.instances().length; })).toBe(count);
    await spacing.press('ControlOrMeta+z'); await expect(spacing).toHaveValue('0.65');
  }
});
