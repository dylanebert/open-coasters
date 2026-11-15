import { expect, type Page } from '@playwright/test';
export const names: Record<string,string> = { ties:'Repeated ties', station:'Gap in repeated ties', supports:'Explicitly placed supports', assembly:'Rail offsets / separation', track:'Contributed Blitz assembly', witness:'Source witness' };
export function exampleMenu(page: Page) {
  return {
    async selectOption(id: string) {
      await page.getByRole('button', { name:'Example', exact:true }).click();
      await page.getByRole('button', { name:names[id], exact:true }).click();
    },
    async value(id: string) { await expect(page.getByRole('button', { name:'Example', exact:true })).toHaveText(names[id]); },
  };
}
