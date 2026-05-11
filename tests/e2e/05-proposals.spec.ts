import { test, expect } from '@playwright/test';

test('página de propostas carrega para usuário autenticado', async ({ page }) => {
  await page.goto('/proposals');

  await expect(page).not.toHaveURL(/\/login/);

  const marker = page.getByText(/propostas|proposals/i).first();
  await expect(marker).toBeVisible({ timeout: 15_000 });
});
