import { expect, test } from '@playwright/test';
import { exampleMenu } from './navigation';
import { pixels } from './pixels';

test('ordinary loop selection exposes rail controls', async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.locator('body[data-ready=true]').waitFor();
  await exampleMenu(page).selectOption('ties');
  await page.locator('[name=assembly-path]').selectOption('loop');
  await expect(page.locator('[name=assembly-path]')).toHaveValue('loop');
  await expect(page.locator('[name=assembly-separation]')).toBeVisible();
  await expect(page.locator('[name=assembly-separation]')).toHaveValue('1.2');
  // Allow the ordinary render loop to present the asynchronously loaded subject.
  await page.waitForTimeout(1000);
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({path: testInfo.outputPath('loop-perspective.png'), fullPage:true});
  await exampleMenu(page).selectOption('track');
  await page.locator('[name=configuration]').selectOption('loop');
  await expect(page.locator('[name=configuration]')).toHaveValue('loop');
  await expect(page.locator('[name=spineAssembly]')).toHaveValue('single');
  await page.waitForTimeout(1000);
  await page.screenshot({path: testInfo.outputPath('loop-blitz.png'), fullPage:true});
  const rgba = await pixels(page);
  const bounds = await rgba.evaluate(data => {
    const width = 1280, height = 800;
    let left=width, right=0, top=height, bottom=0, count=0;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const i=(y*width+x)*4, r=data[i], g=data[i+1], b=data[i+2];
      if(g>r*1.3 && b>r*1.3 && g>65) {
        left=Math.min(left,x);right=Math.max(right,x);
        top=Math.min(top,y);bottom=Math.max(bottom,y);count++;
      }
    }
    return {left,right,top,bottom,count};
  });
  await rgba.dispose();
  console.log('ordinary loop viewport bounds', bounds);
  expect(bounds.count).toBeGreaterThan(100);
  expect(bounds.left).toBeGreaterThan(10);
  expect(bounds.top).toBeGreaterThan(10);
  expect(bounds.right).toBeLessThan(1270);
  expect(bounds.bottom).toBeLessThan(790);
  expect(errors).toEqual([]);
});
