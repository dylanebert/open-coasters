import { test, expect } from '@playwright/test';
import { exampleMenu } from './navigation';
for(const example of ['ties','station','supports','assembly','track'])test(`bootstrap earned selection ${example}`,async({page})=>{
 await page.goto(`./?example=${example}&stepped`);await page.locator('body[data-ready=true]').waitFor();
 await exampleMenu(page).value(example);
 await expect(page.locator('[name=component],input[type=color],[name=width],[name=depth],[name=appearance],[name=assembly-tie]')).toHaveCount(0);
});
test('ordinary entry is repetition and unknown examples do not select a legacy mode',async({page})=>{
 for(const query of ['', '?example=placed', '?example=unknown']){await page.goto(`./${query}`);await page.locator('body[data-ready=true]').waitFor();await exampleMenu(page).value('ties');}
});
