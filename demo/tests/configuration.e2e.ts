import { expect, test } from '@playwright/test';

for (const [query, component] of [['', 'fixed'], ['&component=local', 'local'], ['&component=fixed', 'fixed'], ['&asset=wheel-carrier', 'fixed']] as const) {
  test(`bootstrap selection ${query || 'default'}`, async ({ page }) => {
    await page.goto(`./?stepped${query}`);
    await page.locator('body[data-ready="true"]').waitFor();
    await expect(page.locator('[name=component]')).toHaveValue(component);
    await expect(page.locator('[name=component] option[value=local]')).toHaveText('Parametric');
    if (!query.includes('asset')) {
      if (component === 'fixed') await expect(page.locator('[name=separation]')).toBeDisabled();
      else await expect(page.locator('[name=separation]')).toBeEnabled();
      await page.locator('[name=component]').selectOption('local');
      await page.evaluate(() => (window as any).step());
      await expect(page.locator('[name=width]')).toHaveValue('0.28');
    }
  });
}
