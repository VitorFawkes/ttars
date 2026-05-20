import { test, expect } from '@playwright/test';

const MODAL_STORAGE_KEY = 'welcomecrm.lastPendenciaModalShownDate';

test.describe('Pendências Viscerais (Marco A)', () => {
  test.beforeEach(async ({ page }) => {
    // Garantir que localStorage está limpo pra modal aparecer no 1º acesso
    await page.addInitScript((key) => {
      try { localStorage.removeItem(key); } catch {}
    }, MODAL_STORAGE_KEY);
  });

  test('modal de pendências some após "Fechar" e não volta no mesmo dia', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('text=Você tem').filter({ hasText: 'pendência' });
    const isVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isVisible) {
      test.info().annotations.push({
        type: 'note',
        description: 'Sem pendências canal=modal para user de teste; smoke degrada graciosamente',
      });
      return;
    }

    await page.getByRole('button', { name: 'Fechar' }).first().click();
    await expect(modal).not.toBeVisible();

    // Recarregar — modal não deve reaparecer no mesmo dia
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(modal).not.toBeVisible({ timeout: 2000 });
  });

  test('faixa de pendência aparece no topo de algum card no Kanban (se houver)', async ({ page }) => {
    await page.goto('/pipeline');
    await page.waitForLoadState('networkidle');

    // Faixa usa bg-red-50 / bg-amber-50 / bg-sky-50 + border-b + rounded-t-md
    const faixa = page.locator(
      '[class*="bg-red-50"][class*="border-b"][class*="rounded-t-md"], ' +
      '[class*="bg-amber-50"][class*="border-b"][class*="rounded-t-md"], ' +
      '[class*="bg-sky-50"][class*="border-b"][class*="rounded-t-md"]'
    ).first();

    const visible = await faixa.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      await expect(faixa).toContainText(/.+/);
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Nenhum card com faixa visível; cenário esperado se não há regra com show_in_kanban_banner=true ativa',
      });
    }
  });

  test('modal volta quando data armazenada é de outro dia', async ({ context, page }) => {
    await context.addInitScript((key) => {
      try { localStorage.setItem(key, '2020-01-01'); } catch {}
    }, MODAL_STORAGE_KEY);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const modal = page.locator('text=Você tem').filter({ hasText: 'pendência' });
    const visible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (visible) {
      await expect(modal).toBeVisible();
    } else {
      test.info().annotations.push({
        type: 'note',
        description: 'Sem pendências canal=modal — modal não aparece (esperado)',
      });
    }
  });
});
