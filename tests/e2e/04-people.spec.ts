import { test, expect } from '@playwright/test';

test('página de pessoas/contatos carrega para usuário autenticado', async ({ page }) => {
  await page.goto('/people');

  await expect(page).not.toHaveURL(/\/login/);

  const marker = page
    .getByText(/contatos|pessoas|clientes|people/i)
    .first();

  await expect(marker).toBeVisible({ timeout: 15_000 });
});
