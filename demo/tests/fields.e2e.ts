import { expect, test } from '@playwright/test';
import { pixels, changedPixels } from './pixels';
test('repetition scrub changes actual instances/pixels and retains app/camera; native keyboard and bounded columns',async({page})=>{
 await page.goto('./?stepped');await page.locator('body[data-ready=true]').waitFor();
 const step=()=>page.evaluate(()=>(window as any).step());await step();
 const input=page.locator('[name=assembly-spacing]'),label=input.locator('..');
 await page.evaluate(()=>{const w=window as any;w.saved={document,app:w.demo.app,camera:w.demo.camera,orbit:w.demo.orbit()};});
 const before=await pixels(page,[480,400]);const count=await page.evaluate(()=>(window as any).demo.instances().length);
 const box=(await label.boundingBox())!;await page.mouse.move(box.x+8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+28,box.y+box.height/2);await page.mouse.up();await step();
 await expect(input).toHaveValue('0.9');expect(await page.evaluate(()=>(window as any).demo.instances().length)).not.toBe(count);
 const after=await pixels(page,[480,400]);expect(await changedPixels(after,before)).toBeGreaterThan(30);await before.dispose();await after.dispose();
 expect(await page.evaluate(()=>{const w=window as any;return w.saved.document===document&&w.saved.app===w.demo.app&&w.saved.camera===w.demo.camera&&JSON.stringify(w.saved.orbit)===JSON.stringify(w.demo.orbit());})).toBe(true);
 expect(await label.evaluate(e=>getComputedStyle(e).cursor)).toBe('ew-resize');expect(await label.evaluate(e=>getComputedStyle(e).touchAction)).toBe('pan-y');
 await input.focus();await input.press('ControlOrMeta+a');await input.pressSequentially('0.4');await expect(input).toBeFocused();await input.press('Enter');await step();
 expect(await page.evaluate(()=>(window as any).demo.instances().length)).toBe(33);
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:844});await step();
  const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,overflow:document.querySelector('aside')!.scrollWidth>document.querySelector('aside')!.clientWidth,controls:[...document.querySelectorAll('input,select')].filter(e=>e.getClientRects().length).map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height})),canvas:document.querySelector('canvas')!.getBoundingClientRect().height}));
  expect(layout.width).toBe(width);expect(layout.overflow).toBe(false);expect(new Set(layout.controls.map(c=>c.left)).size).toBe(1);expect(layout.canvas).toBeGreaterThan(300);
  for(const control of layout.controls){expect(control.right).toBeLessThanOrEqual(width);expect(control.height).toBeGreaterThanOrEqual(width<=480?44:32);}
 }
 const fonts=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.endsWith('.woff2')));expect(fonts).toHaveLength(3);expect(fonts.every(url=>new URL(url).pathname.startsWith('/open-coasters/fonts/'))).toBe(true);
});
