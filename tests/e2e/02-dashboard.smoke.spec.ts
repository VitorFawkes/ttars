import { test, expect } from '@playwright/test';

test('dashboard carrega para usuário autenticado', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).not.toHaveURL(/\/login/);

  // Espera algum conteúdo carregar — heading, sidebar, etc
  const marker = page.locator('h1, h2, nav, [role="navigation"]').first();
  await expect(marker).toBeVisible({ timeout: 15_000 });
});
