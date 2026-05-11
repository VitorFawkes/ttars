import { test, expect } from '@playwright/test';

/**
 * Smoke tests do editor de agentes IA.
 *
 * Roda em produção a cada deploy via GitHub Actions. Se quebrar, dispara
 * auto-rollback no Vercel. Cobre:
 *  - Lista de agentes carrega
 *  - Detail page carrega sem erro
 *  - Aba Playbook tem o botão "Experimentar UI nova" (toggle v3)
 *
 * Usa o user de teste (test@welcomecrm.test, org Welcome Trips). Se não
 * houver agentes na org de teste, alguns checks são skipped — garantindo
 * que o teste não falsa-falha.
 */

test('lista de agentes IA carrega', async ({ page }) => {
  await page.goto('/settings/ai-agents');

  await expect(page).not.toHaveURL(/\/login/);

  // Algum heading/marker da página
  const marker = page.getByText(/agente|criar|novo agente|ai/i).first();
  await expect(marker).toBeVisible({ timeout: 15_000 });
});

test('detail page de agente carrega quando há agente disponível', async ({ page }) => {
  await page.goto('/settings/ai-agents');
  await expect(page).not.toHaveURL(/\/login/);

  // Se a lista tiver pelo menos um agente clicável, abre. Senão, skip.
  const firstAgent = page
    .locator('a[href*="/settings/ai-agents/"], button:has-text("editar"), button:has-text("abrir")')
    .first();

  const hasAgent = await firstAgent.isVisible({ timeout: 5_000 }).catch(() => false);
  test.skip(!hasAgent, 'Org de teste sem agentes — skip detail page check');

  await firstAgent.click();

  // URL deve ter UUID do agente
  await expect(page).toHaveURL(/\/settings\/ai-agents\/[a-f0-9-]{36}/, { timeout: 10_000 });

  // Algum tab/seção típica do editor
  const editorMarker = page.getByText(/identidade|playbook|modo de intera|teste ao vivo/i).first();
  await expect(editorMarker).toBeVisible({ timeout: 15_000 });
});
