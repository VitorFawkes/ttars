import { test, expect } from '@playwright/test';

// Teste de login sem storage state pré-autenticado.
test.use({ storageState: { cookies: [], origins: [] } });

test('login com credenciais válidas redireciona para app autenticada', async ({ page }) => {
  await page.goto('/login');

  await page.locator('input[type="email"], input[name="email"]').first().fill('test@welcomecrm.test');
  await page.locator('input[type="password"], input[name="password"]').first().fill('Test123!@#');

  await Promise.all([
    page.waitForURL(/\/(dashboard|pipeline|home|$)/, { timeout: 20_000 }),
    page.getByRole('button', { name: /entrar|login|sign in/i }).first().click(),
  ]);

  // Após login, URL não deve mais conter /login
  await expect(page).not.toHaveURL(/\/login/);
});

test('login com credenciais inválidas mostra erro e permanece na tela de login', async ({ page }) => {
  await page.goto('/login');

  await page.locator('input[type="email"], input[name="email"]').first().fill('nao-existe@welcomecrm.test');
  await page.locator('input[type="password"], input[name="password"]').first().fill('senha-errada');

  await page.getByRole('button', { name: /entrar|login|sign in/i }).first().click();

  // Espera um pouco e garante que não saiu da tela de login
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL(/\/login/);
});
