-- Tabela lead_sources: gerenciamento per-workspace das fontes de lead (origem)
-- Substitui a CHECK constraint estática em cards.origem por uma tabela editável.

-- =========================================================================
-- 1. Criar tabela
-- =========================================================================
CREATE TABLE IF NOT EXISTS lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Tag',
    color TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-700 border-gray-200',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_integration BOOLEAN NOT NULL DEFAULT FALSE,
    ordem INT NOT NULL DEFAULT 0,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, value)
);

CREATE INDEX IF NOT EXISTS lead_sources_org_idx ON lead_sources(org_id);
CREATE INDEX IF NOT EXISTS lead_sources_org_ativa_idx ON lead_sources(org_id, ativa);

COMMENT ON TABLE lead_sources IS
    'Fontes de lead editáveis per-workspace. is_system=TRUE não permite delete (apenas hide via ativa=FALSE).';

-- =========================================================================
-- 2. RLS
-- =========================================================================
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sources_org_all ON lead_sources;
CREATE POLICY lead_sources_org_all ON lead_sources TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS lead_sources_service_all ON lead_sources;
CREATE POLICY lead_sources_service_all ON lead_sources TO service_role
    USING (true) WITH CHECK (true);

-- =========================================================================
-- 3. Seed para TODAS as orgs existentes (system sources)
-- =========================================================================
INSERT INTO lead_sources (org_id, value, label, icon, color, is_system, is_integration, ordem)
SELECT o.id, v.value, v.label, v.icon, v.color, TRUE, v.is_integration, v.ordem
FROM organizations o
CROSS JOIN (VALUES
    ('mkt',              'Marketing',         'Megaphone',      'bg-violet-100 text-violet-700 border-violet-200', FALSE, 10),
    ('indicacao',        'Indicação',         'Users',          'bg-blue-100 text-blue-700 border-blue-200',       FALSE, 20),
    ('carteira_propria', 'Carteira Própria',  'Wallet',         'bg-emerald-100 text-emerald-700 border-emerald-200', FALSE, 30),
    ('carteira_wg',      'Carteira WG',       'Briefcase',      'bg-amber-100 text-amber-700 border-amber-200',    FALSE, 40),
    ('sorrento',         'Sorrento',          'Building2',      'bg-rose-100 text-rose-700 border-rose-200',       FALSE, 50),
    ('weddings',         'Weddings',          'Heart',          'bg-pink-100 text-pink-700 border-pink-200',       FALSE, 60),
    ('carteira',         'Carteira',          'Wallet',         'bg-emerald-100 text-emerald-700 border-emerald-200', FALSE, 100),
    ('manual',           'Manual',            'PenTool',        'bg-slate-100 text-slate-700 border-slate-200',    FALSE, 110),
    ('outro',            'Outro',             'MoreHorizontal', 'bg-gray-100 text-gray-600 border-gray-200',       FALSE, 120),
    ('site',             'Site',              'Globe',          'bg-cyan-100 text-cyan-700 border-cyan-200',       TRUE,  200),
    ('active_campaign',  'Active Campaign',   'Zap',            'bg-orange-100 text-orange-700 border-orange-200', TRUE,  210),
    ('whatsapp',         'WhatsApp',          'MessageCircle',  'bg-green-100 text-green-700 border-green-200',    TRUE,  220)
) AS v(value, label, icon, color, is_integration, ordem)
ON CONFLICT (org_id, value) DO NOTHING;

-- =========================================================================
-- 4. Substituir CHECK constraint por trigger de validação
-- =========================================================================
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_origem_check;

CREATE OR REPLACE FUNCTION public.validate_card_origem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- NULL é permitido
    IF NEW.origem IS NULL OR NEW.origem = '' THEN
        RETURN NEW;
    END IF;

    -- Origem deve existir em lead_sources para a org do card
    IF NOT EXISTS (
        SELECT 1 FROM lead_sources
        WHERE org_id = NEW.org_id
        AND value = NEW.origem
    ) THEN
        RAISE EXCEPTION 'Origem "%" não existe nas fontes de lead da org %. Cadastre em Configurações > Fontes de Lead.', NEW.origem, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cards_validate_origem ON cards;
CREATE TRIGGER trg_cards_validate_origem
    BEFORE INSERT OR UPDATE OF origem, org_id ON cards
    FOR EACH ROW
    WHEN (NEW.origem IS NOT NULL AND NEW.origem != '')
    EXECUTE FUNCTION public.validate_card_origem();

-- =========================================================================
-- 5. Trigger de updated_at
-- =========================================================================
CREATE OR REPLACE FUNCTION public.touch_lead_sources_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_sources_updated_at ON lead_sources;
CREATE TRIGGER trg_lead_sources_updated_at
    BEFORE UPDATE ON lead_sources
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_lead_sources_updated_at();
