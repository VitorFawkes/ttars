import { chromium, FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Global setup — roda uma vez antes de todos os testes.
 *
 * 1) Garante que existe o usuário de teste no Supabase (via service_role).
 *    - Em preview branches, o seed.sql pode ter criado. Admin API é fallback idempotente.
 * 2) Faz login via UI e salva storageState para reuso pelos testes.
 *    - Testes rodam já autenticados; só o teste de login faz login manual.
 */

const TEST_EMAIL = 'test@welcomecrm.test';
const TEST_PASSWORD = 'Test123!@#';

async function ensureTestUserExists() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn('[global-setup] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes — pulando criação do user via admin API. Assumindo que seed.sql já populou.');
    return;
  }

  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { nome: 'Test User' },
    }),
  });

  if (createRes.ok) {
    console.log('[global-setup] Usuário de teste criado via admin API.');
    return;
  }
  const body = await createRes.text();
  if (body.includes('already been registered') || body.includes('already exists') || createRes.status === 422) {
    console.log('[global-setup] Usuário de teste já existe — ok.');
    return;
  }
  console.warn(`[global-setup] Falha ao criar user via admin API (${createRes.status}): ${body.slice(0, 200)}`);
}

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.BASE_URL || 'http://localhost:5173';
  const authDir = path.join(__dirname, '.auth');
  const statePath = path.join(authDir, 'user.json');

  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }));
  }

  await ensureTestUserExists();

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`[global-setup] Login em ${baseURL}/login`);
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(TEST_PASSWORD);

    await Promise.all([
      page.waitForURL(/\/(dashboard|pipeline|home|$)/, { timeout: 20_000 }),
      page.getByRole('button', { name: /entrar|login|sign in/i }).first().click(),
    ]);

    await context.storageState({ path: statePath });
    console.log('[global-setup] Storage state salvo em', statePath);
  } catch (err) {
    console.error('[global-setup] Falha no login:', err);
    fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }
}
