import { test, expect } from '@playwright/test';
for(const phone of [false,true])test(`independent support distances ${phone?'phone':'desktop'}`,async({page})=>{
 if(phone)await page.setViewportSize({width:390,height:844});
 await page.goto('./?example=supports&stepped');await page.locator('body[data-ready=true]').waitFor();
 const step=()=>page.evaluate(()=>(window as any).step()), groups=()=>page.evaluate(()=>(window as any).demo.instances());
 const initial=await groups(),camera=await page.evaluate(()=>(window as any).demo.orbit());
 for(const [key,value] of [['post1','3.125'],['post2','8.875']] as const){
  const input=page.locator(`[name=assembly-${key}]`);await input.fill(value);await input.press('Enter');await step();const current=await groups();
  expect(current.slice(0,-2)).toEqual(initial.slice(0,-2));expect(current.at(key==='post1'?-2:-1)[0].translation).toEqual([0,0,6-Number(value)]);
 }
 const edited=await groups();await page.locator('[name=assembly-post2]').press('ControlOrMeta+z');await step();expect((await groups()).at(-1)).toEqual(initial.at(-1));expect((await groups()).at(-2)).toEqual(edited.at(-2));
 expect(await page.evaluate(()=>(window as any).demo.orbit())).toEqual(camera);
 await expect(page.locator('[name=assembly-spacing],[name=assembly-separation],[name=assembly-path]')).toHaveCount(0);
 if(process.env.SUPPORT_CONTACT_EVIDENCE)await page.screenshot({path:`${process.env.SUPPORT_CONTACT_EVIDENCE}/supports-${phone?'phone':'desktop'}.png`});
});
