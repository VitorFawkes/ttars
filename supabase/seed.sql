-- Seed file for Supabase Preview Branches
--
-- Roda depois das migrations, apenas em branches de preview (PRs).
-- Objetivo: popular minimamente a branch descartável com dados fictícios
-- suficientes para os testes Playwright exercerem a UI.
--
-- Produção NUNCA roda este arquivo. Dados reais continuam isolados.
--
-- Idempotente: ON CONFLICT DO NOTHING em tudo.

-- ============================================================
-- 1) Usuário de teste (auth.users)
-- ============================================================
-- Email: test@welcomecrm.test
-- Senha: Test123!@#
-- O global setup do Playwright também recria via admin API como fallback.

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'test@welcomecrm.test',
  crypt('Test123!@#', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nome":"Test User"}'::jsonb,
  false,
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2) Organização de teste
-- ============================================================
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-0000000000a0',
  'Preview Org',
  'preview-org',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3) Profile ligando usuário à organização
-- ============================================================
INSERT INTO profiles (id, nome, email, is_admin, org_id, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test User',
  'test@welcomecrm.test',
  true,
  '00000000-0000-0000-0000-0000000000a0',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4) Garantir que o JWT do user aponte pra org correta
-- ============================================================
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'org_id', '00000000-0000-0000-0000-0000000000a0',
  'is_admin', true
)
WHERE id = '00000000-0000-0000-0000-000000000001';
