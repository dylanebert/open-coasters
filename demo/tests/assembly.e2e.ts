import { expect, test } from '@playwright/test';
import { exampleMenu } from './navigation';
for (const viewport of [{width:1280,height:800},{width:390,height:844}]) test(`rail offsets retain fixed reference ties and camera at ${viewport.width}`, async ({page}) => {
  await page.setViewportSize(viewport);
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./?example=assembly&stepped'); await page.locator('body[data-ready=true]').waitFor();
  const step=()=>page.evaluate(()=>(window as any).step());
  const groups=()=>page.evaluate(()=>(window as any).demo.instances());
  const orbit=()=>page.evaluate(()=>(window as any).demo.orbit());
  const camera=await page.evaluate(()=>(window as any).demo.camera);
  const path=page.locator('[name=assembly-path]'), separation=page.locator('[name=assembly-separation]');
  expect((await groups()).length).toBe(21);
  await path.selectOption('straight'); await step();
  const reference=(await groups()).slice(1), view=await orbit();
  expect(reference).toHaveLength(19);
  reference.forEach((group:any[],i:number)=>{expect(group[0].translation[2]).toBeCloseTo(-6+i*.65,6);group.forEach(e=>expect(e.scale).toEqual([1,1,1]));});
  for(const value of ['1.6','.6','1.35']) {
    await separation.fill(value);await separation.press('Enter');await step();
    expect((await groups()).slice(1)).toEqual(reference);
    const output:{positions:number[];positionError:number}=await page.evaluate(()=>(window as any).demo.trackPositions()[0]);
    const xs=output.positions.filter((_,i)=>i%3===0);
    // Actual standard-renderer unorm16 positions, not unquantized add inputs.
    // One measured quant lattice step plus the source/parameter f32 conversion.
    expect(Math.abs(Math.min(...xs)-(-Number(value)/2-.06))).toBeLessThan(output.positionError+1e-6);
    expect(Math.abs(Math.max(...xs)-(Number(value)/2+.06))).toBeLessThan(output.positionError+1e-6);
    expect(await orbit()).toEqual(view);
  }
  await separation.press('ControlOrMeta+z');await step();await expect(separation).toHaveValue('0.6');
  await separation.press('ControlOrMeta+Shift+z');await step();await expect(separation).toHaveValue('1.35');
  await path.selectOption('curve');await step();expect((await orbit()).yaw).toBe(view.yaw);expect((await orbit()).pitch).toBe(view.pitch);
  await exampleMenu(page).selectOption('supports');await step();expect((await groups()).length).toBe(22);
  await exampleMenu(page).selectOption('assembly');await step();await expect(separation).toHaveValue('1.35');await expect(path).toHaveValue('curve');
  expect(await page.evaluate(()=>(window as any).demo.camera)).toBe(camera);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const canvas=(await page.locator('canvas').boundingBox())!,aside=(await page.locator('aside').boundingBox())!;
  expect(canvas).toMatchObject({x:0,y:0,width:viewport.width,height:viewport.height});
  expect(aside.y).toBeGreaterThan(0);expect(aside.x+aside.width).toBeLessThanOrEqual(viewport.width);expect(aside.y+aside.height).toBeLessThan(viewport.height-60);
  expect(errors).toEqual([]);
});
