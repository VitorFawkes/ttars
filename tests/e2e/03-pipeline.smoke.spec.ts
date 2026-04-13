import { test, expect } from '@playwright/test';

test('página de pipeline carrega o kanban', async ({ page }) => {
  await page.goto('/pipeline');

  await expect(page).not.toHaveURL(/\/login/);

  // Qualquer texto característico do pipeline ou estrutura de colunas
  const kanbanMarker = page.getByText(/pipeline|novo card|kanban/i).first();
  await expect(kanbanMarker).toBeVisible({ timeout: 15_000 });
});

test('botão de criar novo card está presente no pipeline', async ({ page }) => {
  await page.goto('/pipeline');

  const newCardButton = page
    .getByRole('button', { name: /novo|criar|adicionar|novo card/i })
    .first();

  await expect(newCardButton).toBeVisible({ timeout: 15_000 });
});
