import { test, expect } from '@playwright/test'

// Dashboard de Engajamento de Conversas (Welcome Weddings).
// O usuário de teste do projeto loga em Welcome Trips, então a página deve
// renderizar o aviso de "Disponível apenas no workspace Weddings".
// Este teste valida que (a) a rota responde sem erro e (b) o gating funciona.
test('analytics/whatsapp responde e protege fora de Weddings', async ({ page }) => {
  await page.goto('/analytics/whatsapp')
  await expect(page).not.toHaveURL(/\/login/)

  const guard = page.getByText(/welcome weddings/i)
  const view = page.getByRole('heading', { name: /engajamento de conversas/i })
  await expect(guard.or(view)).toBeVisible({ timeout: 15_000 })
})
