import { test, expect } from '@playwright/test';
test('native sessions and example switches have one history with retained values and actual render undo',async({page})=>{
 await page.goto('./?example=station&stepped');await page.locator('body[data-ready=true]').waitFor();
 const step=()=>page.evaluate(()=>(window as any).step()),input=page.locator('[name=gap-start]');
 const groups=()=>page.evaluate(()=>(window as any).demo.instances());
 const before=await groups();await input.fill('1.234');await input.press('Enter');await expect(input).toBeFocused();await step();const edited=await groups();expect(edited).not.toEqual(before);
 await input.press('ControlOrMeta+z');await step();expect(await groups()).toEqual(before);
 await input.press('ControlOrMeta+Shift+z');await step();expect(await groups()).toEqual(edited);
 await page.locator('[name=example]').selectOption('supports');await step();
 await page.locator('[name=assembly-post2]').fill('8.875');await page.locator('[name=assembly-post2]').press('Enter');await step();const supports=await groups();
 await page.locator('[name=example]').selectOption('station');await step();await expect(input).toHaveValue('1.234');expect(await groups()).toEqual(edited);
 await page.keyboard.press('ControlOrMeta+z');await step();await expect(page.locator('[name=example]')).toHaveValue('supports');expect(await groups()).toEqual(supports);
 await page.keyboard.press('ControlOrMeta+z');await step();expect((await groups()).at(-1)[0].translation[2]).toBe(4);
 await page.keyboard.press('ControlOrMeta+Shift+z');await step();expect(await groups()).toEqual(supports);
});
