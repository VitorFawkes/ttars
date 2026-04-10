-- Org Split Fase 2: Migrar products e usuários para orgs filhas
--
-- O que esta migration faz:
-- 1. Cria products TRIPS na Welcome Trips org e WEDDING na Welcome Weddings org
-- 2. Adiciona usuários não-admin ao org_members da org correta (baseado em profiles.produtos)
-- 3. Seta active_org_id para usuários com apenas 1 org
-- 4. Usuários com múltiplos produtos recebem ambas as orgs

-- =========================================================================
-- 1. Products nas orgs filhas (cópia dos atuais com org_id correto)
-- =========================================================================

-- TRIPS product na Welcome Trips org
INSERT INTO products (org_id, slug, name, name_short, icon_name, color_class, pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
SELECT
    'b0000000-0000-0000-0000-000000000001',  -- Welcome Trips org
    p.slug, p.name, p.name_short, p.icon_name, p.color_class,
    p.pipeline_id, p.deal_label, p.deal_plural, p.main_date_label, p.not_found_label,
    p.active, p.display_order
FROM products p
WHERE p.org_id = 'a0000000-0000-0000-0000-000000000001' AND p.slug = 'TRIPS'
ON CONFLICT (org_id, slug) DO NOTHING;

-- WEDDING product na Welcome Weddings org
INSERT INTO products (org_id, slug, name, name_short, icon_name, color_class, pipeline_id, deal_label, deal_plural, main_date_label, not_found_label, active, display_order)
SELECT
    'b0000000-0000-0000-0000-000000000002',  -- Welcome Weddings org
    p.slug, p.name, p.name_short, p.icon_name, p.color_class,
    p.pipeline_id, p.deal_label, p.deal_plural, p.main_date_label, p.not_found_label,
    p.active, p.display_order
FROM products p
WHERE p.org_id = 'a0000000-0000-0000-0000-000000000001' AND p.slug = 'WEDDING'
ON CONFLICT (org_id, slug) DO NOTHING;

-- =========================================================================
-- 2. Migrar usuários não-admin para org_members
-- =========================================================================

-- Usuários com TRIPS no array de produtos → Welcome Trips org
INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'b0000000-0000-0000-0000-000000000001', 'member', true
FROM profiles p
WHERE p.is_admin = false
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND p.produtos IS NOT NULL
  AND 'TRIPS' = ANY(p.produtos::TEXT[])
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Usuários com WEDDING no array de produtos → Welcome Weddings org
INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'b0000000-0000-0000-0000-000000000002', 'member',
    -- is_default = true apenas se NÃO tem TRIPS (WEDDING é a única org)
    NOT ('TRIPS' = ANY(p.produtos::TEXT[]))
FROM profiles p
WHERE p.is_admin = false
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND p.produtos IS NOT NULL
  AND 'WEDDING' = ANY(p.produtos::TEXT[])
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Também adicionar ao Welcome Group (holding) para todos não-admin
INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'a0000000-0000-0000-0000-000000000001', 'member', false
FROM profiles p
WHERE p.is_admin = false
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND p.produtos IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- =========================================================================
-- 3. Setar active_org_id default para quem tem apenas 1 org filha
-- =========================================================================

-- Usuários com apenas TRIPS → active_org_id = Welcome Trips
UPDATE profiles SET active_org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE is_admin = false
  AND org_id = 'a0000000-0000-0000-0000-000000000001'
  AND active_org_id IS NULL
  AND produtos IS NOT NULL
  AND 'TRIPS' = ANY(produtos::TEXT[])
  AND NOT ('WEDDING' = ANY(produtos::TEXT[]));

-- Usuários com apenas WEDDING → active_org_id = Welcome Weddings
UPDATE profiles SET active_org_id = 'b0000000-0000-0000-0000-000000000002'
WHERE is_admin = false
  AND org_id = 'a0000000-0000-0000-0000-000000000001'
  AND active_org_id IS NULL
  AND produtos IS NOT NULL
  AND 'WEDDING' = ANY(produtos::TEXT[])
  AND NOT ('TRIPS' = ANY(produtos::TEXT[]));

-- Usuários com múltiplos produtos → default para TRIPS (is_default=true no org_members)
UPDATE profiles SET active_org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE is_admin = false
  AND org_id = 'a0000000-0000-0000-0000-000000000001'
  AND active_org_id IS NULL
  AND produtos IS NOT NULL
  AND 'TRIPS' = ANY(produtos::TEXT[])
  AND 'WEDDING' = ANY(produtos::TEXT[]);

-- Admins sem active_org_id → default para Welcome Trips
UPDATE profiles SET active_org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE is_admin = true
  AND org_id = 'a0000000-0000-0000-0000-000000000001'
  AND active_org_id IS NULL;
