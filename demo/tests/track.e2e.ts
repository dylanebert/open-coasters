import { expect, test, type Page } from '@playwright/test';
import { pixels, changedPixels } from './pixels';
const step=(page:Page)=>page.evaluate(()=>(window as any).step());
test('contributed native composition changes actual mesh topology, caches source and retains camera on edits',async({page})=>{
 const errors:string[]=[], requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.(gltf|bin)$/.test(r.url()))requests.push(r.url());});
 await page.goto('./?example=track&stepped');await page.locator('body[data-ready=true]').waitFor();
 await page.evaluate(()=>{const w=window as any;w.witness=[document,w.demo.app,w.demo.app.world,w.demo.camera];});
 let count=0;
 for(const path of ['straight','curve','loop']){
  const before=await page.evaluate(()=>(window as any).demo.orbit());
  await page.locator('[name=configuration]').selectOption(path);await step(page);
  const view=await page.evaluate(()=>(window as any).demo.orbit());expect(view.yaw).toBe(before.yaw);expect(view.pitch).toBe(before.pitch);expect(view.distance).toBe(path==='loop'?26:19);
  for(const composition of ['single','double']){
   await page.locator('[name=spineAssembly]').selectOption(composition);await step(page);
   expect(await page.evaluate(()=>(window as any).demo.orbit())).toEqual(view);
   const meshes=await page.evaluate(()=>(window as any).demo.meshes());
   expect(meshes.find((m:any)=>m.name==='Track rails').indexCount).toBe(32*192*6+168);
   expect(meshes.find((m:any)=>m.name==='Track spine').indexCount).toBe((composition==='single'?24:48)*192*6+(composition==='single'?132:264));
  }
  if(count)expect(requests.length).toBe(count);else count=requests.length;
 }
 const meshes=await page.evaluate(()=>(window as any).demo.meshes());
 await page.locator('[name=spineAssembly]').press('ControlOrMeta+z');await step(page);
 expect(await page.evaluate(()=>(window as any).demo.meshes())).not.toEqual(meshes);
 await page.locator('[name=spineAssembly]').press('ControlOrMeta+Shift+z');await step(page);
 expect(await page.evaluate(()=>(window as any).demo.meshes())).toEqual(meshes);
 expect(await page.evaluate(()=>{const w=window as any;return w.witness.every((v:any,i:number)=>v===[document,w.demo.app,w.demo.app.world,w.demo.camera][i]);})).toBe(true);
 expect(errors).toEqual([]);
});
for(const asset of ['wheel-carrier','blitz-tie'])test(`source witness ${asset} retains hierarchy framing and immediate source selection`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`./?asset=${asset}&stepped`);await page.locator('body[data-ready=true]').waitFor();await step(page);
 await expect(page.locator('[name=example]')).toHaveValue('witness');await expect(page.locator('[name=asset]')).toHaveValue(asset);
 expect(await page.evaluate(()=>(window as any).demo.orbit().distance)).toBe(8);
 const groups=await page.evaluate(()=>(window as any).demo.instances());expect(groups).toHaveLength(2);expect(groups[0]).toHaveLength(asset==='wheel-carrier'?4:1);
 if(asset==='wheel-carrier')expect(groups[0][1].translation).toEqual(expect.arrayContaining([expect.closeTo(-1.25,5),expect.closeTo(.6,5),expect.closeTo(.45,5)]));
 const before=await pixels(page,[480,400]);const url=page.url();
 await page.locator('[name=asset]').selectOption(asset==='wheel-carrier'?'blitz-tie':'wheel-carrier');await step(page);
 const after=await pixels(page,[480,400]);expect(await changedPixels(after,before)).toBeGreaterThan(30);await before.dispose();await after.dispose();expect(page.url()).toBe(url);
 await page.getByRole('link',{name:'Open Coasters'}).click();await page.locator('body[data-ready=true]').waitFor();await expect(page.locator('[name=example]')).toHaveValue('ties');
 expect(errors).toEqual([]);
});
