import { expect, test } from '@playwright/test';
import { pixels, changedPixels } from './pixels';

for(const viewport of [{width:1280,height:800},{width:390,height:844}]) test(`public track composition and recorded appearance at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./?stepped');await page.locator('body[data-ready="true"]').waitFor();
  const step=()=>page.evaluate(()=>(window as any).step());
  const settle=()=>page.evaluate(async()=>{for(let i=0;i<10;i++)await(window as any).step(1/15);});
  const example=page.locator('[name=example]');
  expect(await example.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value))).toEqual(['track','assembly']);
  const camera=await page.evaluate(()=>(window as any).demo.camera);
  await example.selectOption('assembly');await step();
  await page.locator('[name=assembly-path]').selectOption('loop');await step();await settle();
  // Side view via ordinary orbit input; no section or source-data scaling.
  const prior=await page.evaluate(()=>(window as any).demo.orbit());
  const box=(await page.locator('canvas').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await step();
  await page.mouse.move(x-(Math.PI/2-prior.yaw)/.005,y-prior.pitch/.005);await step();await page.mouse.up();await settle();
  const orbit=await page.evaluate(()=>(window as any).demo.orbit());
  const plain=await pixels(page);
  const appearance=page.locator('[name=appearance]');
  await appearance.selectOption('normal-force');await step();
  await expect(page.locator('.force-scale')).toHaveAccessibleName('Normal support derived from recorded motion');
  await expect(page.locator('.force-scale')).toContainText('Derived');
  await expect(page.locator('.force-scale')).toContainText('1 g = 9.81 m/s²');
  await expect(page.locator('.force-ticks')).toHaveText('024');
  const colored=await pixels(page);
  expect(await changedPixels(colored,plain)).toBeGreaterThan(50);
  const hues=await colored.evaluate(data=>{
    let red=0,blue=0;
    for(let i=0;i<data.length;i+=4){if(data[i]>data[i+2]*1.3&&data[i]>data[i+1]*1.3)red++;if(data[i+2]>data[i]*1.3&&data[i+2]>data[i+1]*1.1)blue++;}
    return {red,blue};
  });
  expect(hues.red).toBeGreaterThan(5);expect(hues.blue).toBeGreaterThan(5);
  expect(await page.evaluate(()=>(window as any).demo.orbit())).toEqual(orbit);
  const meshes=await page.evaluate(()=>(window as any).demo.meshes());
  for(let i=0;i<4;i++){await appearance.selectOption(i%2?'normal-force':'material');await step();}
  expect(await page.evaluate(()=>(window as any).demo.meshes())).toEqual(meshes);
  // Existing scrub gesture and keyboard history operate on a useful loop edit.
  const gauge=page.locator('[name=assembly-separation]'),label=gauge.locator('..');
  await label.scrollIntoViewIfNeeded();const lb=(await label.boundingBox())!;
  await page.mouse.move(lb.x+20,lb.y+lb.height/2);await page.mouse.down();
  await page.mouse.move(lb.x+32,lb.y+lb.height/2);await step();await page.mouse.up();await step();
  await expect(gauge).toHaveValue('1.35');
  expect(await changedPixels(await pixels(page),colored)).toBeGreaterThan(20);
  await page.keyboard.press('ControlOrMeta+z');await step();await expect(gauge).toHaveValue('1.2');
  await page.keyboard.press('ControlOrMeta+Shift+z');await step();await expect(gauge).toHaveValue('1.35');
  await page.locator('[name=assembly-tie]').selectOption('assembly-tie-fork');await step();
  expect(await page.evaluate(()=>(window as any).demo.instances()[1].length)).toBe(3);
  expect(await page.evaluate(()=>(window as any).demo.orbit())).toEqual(orbit);
  await appearance.selectOption('material');await step();await page.keyboard.press('ControlOrMeta+z');await step();
  await expect(appearance).toHaveValue('normal-force');
  expect(await page.evaluate(()=>(window as any).demo.camera)).toBe(camera);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  const aside=(await page.locator('aside').boundingBox())!;
  const currentCanvas=(await page.locator('canvas').boundingBox())!;
  if(viewport.width<500)expect(aside.y).toBeGreaterThanOrEqual(currentCanvas.y+currentCanvas.height-1);
  await page.screenshot({path:`test-results/loop-force-${viewport.width}.png`,fullPage:true});
  await plain.dispose();await colored.dispose();
  expect(errors).toEqual([]);
});
