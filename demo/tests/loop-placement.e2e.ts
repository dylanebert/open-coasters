import { expect, test } from '@playwright/test';
import { exampleMenu } from './navigation';

test('ordinary loop selection exposes rail controls', async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.locator('body[data-ready=true]').waitFor();
  await exampleMenu(page).selectOption('assembly');
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
  expect(errors).toEqual([]);
});
