-- Org Split Fase 1: Criar organizações Welcome Trips e Welcome Weddings
-- TRIPS e WEDDING são empresas diferentes (marcas, P&L, equipes, clientes separados)
-- e devem ser organizações independentes, não "produtos" dentro da mesma org.
--
-- O que esta migration faz:
-- 1. Adiciona parent_org_id para agrupar orgs (Welcome Group = holding)
-- 2. Cria orgs Welcome Trips e Welcome Weddings como filhas
-- 3. Cria tabela org_members para membership multi-org
-- 4. Adiciona active_org_id em profiles para org switching
-- 5. Popula org_members para admins existentes

-- =========================================================================
-- 1. parent_org_id — agrupamento de organizações
-- =========================================================================
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS parent_org_id UUID REFERENCES organizations(id);

CREATE INDEX IF NOT EXISTS idx_organizations_parent
    ON organizations(parent_org_id)
    WHERE parent_org_id IS NOT NULL;

COMMENT ON COLUMN organizations.parent_org_id IS
    'Org pai (holding/grupo). NULL = org raiz ou independente.';

-- =========================================================================
-- 2. Garantir colunas branding/settings existem (pode faltar no staging)
-- =========================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB;

-- =========================================================================
-- 3. Criar Welcome Trips e Welcome Weddings
-- =========================================================================
INSERT INTO organizations (id, name, slug, parent_org_id, active, branding, settings)
VALUES
    (
        'b0000000-0000-0000-0000-000000000001',
        'Welcome Trips',
        'welcome-trips',
        'a0000000-0000-0000-0000-000000000001',
        true,
        '{"primary_color": "#0d9488", "accent_color": "#4f46e5"}',
        '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        'Welcome Weddings',
        'welcome-weddings',
        'a0000000-0000-0000-0000-000000000001',
        true,
        '{"primary_color": "#e11d48", "accent_color": "#4f46e5"}',
        '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
    )
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- 3. Tabela org_members — membership multi-org
-- =========================================================================
CREATE TABLE IF NOT EXISTS org_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member',
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);

COMMENT ON TABLE org_members IS
    'Membership multi-org: um usuário pode pertencer a N organizações com roles diferentes.';

-- RLS para org_members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_own" ON org_members
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "org_members_admin_all" ON org_members
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM org_members om
            WHERE om.user_id = auth.uid()
              AND om.org_id = org_members.org_id
              AND om.role = 'admin'
        )
    );

CREATE POLICY "org_members_service_all" ON org_members
    FOR ALL TO service_role
    USING (true);

-- =========================================================================
-- 4. active_org_id — permite trocar org ativa sem re-login
-- =========================================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS active_org_id UUID REFERENCES organizations(id);

COMMENT ON COLUMN profiles.active_org_id IS
    'Org ativa para o usuário. NULL = usa org_id padrão. JWT hook lê COALESCE(active_org_id, org_id).';

-- =========================================================================
-- 5. Popula org_members para admins existentes
-- =========================================================================
-- Admins da Welcome Group ganham acesso a ambas as orgs filhas
INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'b0000000-0000-0000-0000-000000000001', 'admin', true
FROM profiles p
WHERE p.is_admin = true
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (user_id, org_id) DO NOTHING;

INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'b0000000-0000-0000-0000-000000000002', 'admin', false
FROM profiles p
WHERE p.is_admin = true
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Também adicionar ao Welcome Group (holding)
INSERT INTO org_members (user_id, org_id, role, is_default)
SELECT p.id, 'a0000000-0000-0000-0000-000000000001', 'admin', false
FROM profiles p
WHERE p.is_admin = true
  AND p.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (user_id, org_id) DO NOTHING;

-- =========================================================================
-- 6. RPC switch_organization — troca org ativa via frontend
-- =========================================================================
CREATE OR REPLACE FUNCTION switch_organization(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verificar que o usuário tem acesso a esta org
    IF NOT EXISTS (
        SELECT 1 FROM org_members
        WHERE user_id = auth.uid() AND org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'Acesso negado a esta organização';
    END IF;

    -- Atualizar org ativa no profile
    UPDATE profiles SET active_org_id = p_org_id WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION switch_organization(UUID) TO authenticated;

COMMENT ON FUNCTION switch_organization IS
    'Troca a organização ativa do usuário. Requer membership em org_members. '
    'Após chamar, o frontend deve refreshSession() para obter novo JWT.';
