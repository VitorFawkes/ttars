import { test, expect } from '@playwright/test';

// Sem autenticação — valida que a aplicação está online e servindo HTML.
test.use({ storageState: { cookies: [], origins: [] } });

test('aplicação responde com HTML válido na raiz', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(500);

  // Espera o root do React carregar
  await expect(page.locator('#root, [data-reactroot], main, body > *').first()).toBeVisible({
    timeout: 15_000,
  });
});

test('tela de login renderiza', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('input[type="password"], input[name="password"]').first()).toBeVisible();
});
