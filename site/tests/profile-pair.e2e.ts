import {test,expect} from '@playwright/test';
test('profile pair keeps native panels legible in themes, narrow widths and no-JS',async({browser},info)=>{
 for(const javaScriptEnabled of [true,false])for(const width of [390,1280])for(const theme of ['light','dark'] as const){
 const context=await browser.newContext({javaScriptEnabled,colorScheme:theme,viewport:{width,height:900}}),page=await context.newPage();
 await page.goto('/open-coasters/');const pair=page.locator('.profile-pair');await expect(pair.locator('img')).toHaveCount(2);
 await expect.poll(()=>pair.locator('img').last().evaluate((i:HTMLImageElement)=>i.currentSrc)).toContain(`profile-extrusion-${theme}.png`);
 const panels=await pair.locator('img').evaluateAll(imgs=>imgs.map(i=>{const r=i.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 for(const r of panels){expect(r.width).toBeGreaterThan(300);expect(r.width/r.height).toBeCloseTo(1200/650,2);}
 if(width>700){expect(panels[0]!.y).toBeCloseTo(panels[1]!.y,1);expect(panels[0]!.x).toBeLessThan(panels[1]!.x);}else expect(panels[1]!.y).toBeGreaterThan(panels[0]!.y);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await pair.screenshot({path:info.outputPath(`profile-pair-${width}-${theme}-${javaScriptEnabled?'js':'nojs'}.png`)});await context.close();
 }
});
