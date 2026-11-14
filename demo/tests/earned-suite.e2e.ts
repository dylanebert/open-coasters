import { test, expect } from '@playwright/test';
const root = '/home/dylan/.local/share/open-coasters/placement-earned-suite';
for (const phone of [false, true]) test(`earned placement suite ${phone ? 'phone' : 'desktop'}`, async ({ page }) => {
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?example=station');
  await page.locator('body[data-ready=true]').waitFor();
  const menu = page.locator('[name=example]');
  expect(await menu.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(['ties','station','supports','assembly','track']);
  const fields: Record<string,string[]> = {ties:['assembly-spacing'],station:['assembly-spacing','gap-start','gap-end'],supports:['assembly-post1','assembly-post2'],assembly:['assembly-separation'],track:[]};
  for (const [example,names] of Object.entries(fields)) {
    await menu.selectOption(example);
    expect(await page.locator('input:visible').evaluateAll(inputs => inputs.map(i => (i as HTMLInputElement).name))).toEqual(names);
    expect(await page.locator('select:visible').evaluateAll(inputs => inputs.map(i => (i as HTMLSelectElement).name))).toEqual(['example',...(['ties','assembly','track'].includes(example)?[example==='track'?'configuration':'assembly-path']:[]),...(example==='track'?['spineAssembly']:[])]);
  }
  await menu.selectOption('station');
  const spacing=page.locator('[name=assembly-spacing]'), start=page.locator('[name=gap-start]'), end=page.locator('[name=gap-end]');
  const positions=()=>page.evaluate(()=>(window as any).demo.instances().slice(1).map((g:any)=>g[0].translation[2]));
  await spacing.fill('1'); await spacing.press('Enter');
  await start.fill('2'); await start.press('Enter'); await end.fill('5'); await end.press('Enter');
  await expect.poll(positions).toEqual([-6,-5,-1,0,1,2,3,4,5]);
  const camera=await page.evaluate(()=>(window as any).demo.orbit());
  await start.fill('2.125'); await start.press('Enter');
  await expect.poll(positions).toEqual([-6,-5,-4,-1,0,1,2,3,4,5]);
  await start.press('ControlOrMeta+z'); await expect(start).toHaveValue('2');
  await expect.poll(positions).toEqual([-6,-5,-1,0,1,2,3,4,5]);
  await start.press('ControlOrMeta+Shift+z'); await expect(start).toHaveValue('2.125');
  expect(await page.evaluate(()=>(window as any).demo.orbit())).toEqual(camera);
  await menu.selectOption('ties'); await menu.selectOption('station'); await expect(start).toHaveValue('2.125');
  await page.screenshot({path:`${root}/${phone?'phone':'desktop'}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
