-- H3-016: Milestones dinâmicos, Owners dinâmicos, Branding org
-- Permite que qualquer empresa tenha seus próprios milestones e owners por fase,
-- sem depender de colunas booleanas hardcoded.

-- =============================================================================
-- 1. card_milestones — substitui ganho_sdr, ganho_planner, ganho_pos
-- =============================================================================
CREATE TABLE IF NOT EXISTS card_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    milestone_key TEXT NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    achieved_by UUID REFERENCES profiles(id),
    org_id UUID NOT NULL REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001',
    UNIQUE(card_id, milestone_key)
);

CREATE INDEX IF NOT EXISTS idx_card_milestones_card ON card_milestones(card_id);
CREATE INDEX IF NOT EXISTS idx_card_milestones_org ON card_milestones(org_id);

ALTER TABLE card_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_milestones_org_select" ON card_milestones
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

CREATE POLICY "card_milestones_org_all" ON card_milestones
    FOR ALL TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "card_milestones_service_all" ON card_milestones
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Backfill from legacy boolean columns
INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
SELECT id, 'ganho_sdr', COALESCE(ganho_sdr_at, updated_at, now()), org_id
FROM cards WHERE ganho_sdr = true
ON CONFLICT (card_id, milestone_key) DO NOTHING;

INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
SELECT id, 'ganho_planner', COALESCE(ganho_planner_at, updated_at, now()), org_id
FROM cards WHERE ganho_planner = true
ON CONFLICT (card_id, milestone_key) DO NOTHING;

INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
SELECT id, 'ganho_pos', COALESCE(ganho_pos_at, updated_at, now()), org_id
FROM cards WHERE ganho_pos = true
ON CONFLICT (card_id, milestone_key) DO NOTHING;

-- =============================================================================
-- 2. card_phase_owners — substitui sdr_owner_id, vendas_owner_id, pos_owner_id
-- =============================================================================
CREATE TABLE IF NOT EXISTS card_phase_owners (
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    phase_id UUID NOT NULL REFERENCES pipeline_phases(id),
    owner_id UUID NOT NULL REFERENCES profiles(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    org_id UUID NOT NULL REFERENCES organizations(id) DEFAULT 'a0000000-0000-0000-0000-000000000001',
    PRIMARY KEY (card_id, phase_id)
);

CREATE INDEX IF NOT EXISTS idx_card_phase_owners_card ON card_phase_owners(card_id);
CREATE INDEX IF NOT EXISTS idx_card_phase_owners_owner ON card_phase_owners(owner_id);
CREATE INDEX IF NOT EXISTS idx_card_phase_owners_org ON card_phase_owners(org_id);

ALTER TABLE card_phase_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_phase_owners_org_select" ON card_phase_owners
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

CREATE POLICY "card_phase_owners_org_all" ON card_phase_owners
    FOR ALL TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

CREATE POLICY "card_phase_owners_service_all" ON card_phase_owners
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Backfill from legacy owner columns
-- SDR phase
INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
SELECT c.id, pp.id, c.sdr_owner_id, c.org_id
FROM cards c
JOIN pipeline_phases pp ON pp.slug = 'sdr' AND pp.org_id = c.org_id
WHERE c.sdr_owner_id IS NOT NULL AND c.deleted_at IS NULL
ON CONFLICT (card_id, phase_id) DO NOTHING;

-- Planner/Vendas phase
INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
SELECT c.id, pp.id, c.vendas_owner_id, c.org_id
FROM cards c
JOIN pipeline_phases pp ON pp.slug = 'planner' AND pp.org_id = c.org_id
WHERE c.vendas_owner_id IS NOT NULL AND c.deleted_at IS NULL
ON CONFLICT (card_id, phase_id) DO NOTHING;

-- Pos-venda phase
INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
SELECT c.id, pp.id, c.pos_owner_id, c.org_id
FROM cards c
JOIN pipeline_phases pp ON pp.slug = 'pos_venda' AND pp.org_id = c.org_id
WHERE c.pos_owner_id IS NOT NULL AND c.deleted_at IS NULL
ON CONFLICT (card_id, phase_id) DO NOTHING;

-- Concierge phase
INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
SELECT c.id, pp.id, c.concierge_owner_id, c.org_id
FROM cards c
JOIN pipeline_phases pp ON pp.slug = 'concierge' AND pp.org_id = c.org_id
WHERE c.concierge_owner_id IS NOT NULL AND c.deleted_at IS NULL
ON CONFLICT (card_id, phase_id) DO NOTHING;

-- =============================================================================
-- 3. Organization branding & settings
-- =============================================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- Seed Welcome Group
UPDATE organizations SET
    branding = '{"primary_color": "#4f46e5", "accent_color": "#0d9488"}',
    settings = '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- =============================================================================
-- 4. Trigger: dual-write milestones when legacy boolean columns are set
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_milestone_from_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ganho_sdr
    IF NEW.ganho_sdr = true AND (OLD.ganho_sdr IS NULL OR OLD.ganho_sdr = false) THEN
        INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
        VALUES (NEW.id, 'ganho_sdr', COALESCE(NEW.ganho_sdr_at, now()), NEW.org_id)
        ON CONFLICT (card_id, milestone_key) DO NOTHING;
    END IF;

    -- ganho_planner
    IF NEW.ganho_planner = true AND (OLD.ganho_planner IS NULL OR OLD.ganho_planner = false) THEN
        INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
        VALUES (NEW.id, 'ganho_planner', COALESCE(NEW.ganho_planner_at, now()), NEW.org_id)
        ON CONFLICT (card_id, milestone_key) DO NOTHING;
    END IF;

    -- ganho_pos
    IF NEW.ganho_pos = true AND (OLD.ganho_pos IS NULL OR OLD.ganho_pos = false) THEN
        INSERT INTO card_milestones (card_id, milestone_key, achieved_at, org_id)
        VALUES (NEW.id, 'ganho_pos', COALESCE(NEW.ganho_pos_at, now()), NEW.org_id)
        ON CONFLICT (card_id, milestone_key) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_milestone_from_legacy_trigger ON cards;
CREATE TRIGGER sync_milestone_from_legacy_trigger
    AFTER UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION sync_milestone_from_legacy();

-- =============================================================================
-- 5. Trigger: dual-write phase owners when legacy owner columns are set
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_phase_owner_from_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phase_id UUID;
BEGIN
    -- sdr_owner_id changed
    IF NEW.sdr_owner_id IS DISTINCT FROM OLD.sdr_owner_id AND NEW.sdr_owner_id IS NOT NULL THEN
        SELECT id INTO v_phase_id FROM pipeline_phases WHERE slug = 'sdr' AND org_id = NEW.org_id LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.sdr_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- vendas_owner_id changed
    IF NEW.vendas_owner_id IS DISTINCT FROM OLD.vendas_owner_id AND NEW.vendas_owner_id IS NOT NULL THEN
        SELECT id INTO v_phase_id FROM pipeline_phases WHERE slug = 'planner' AND org_id = NEW.org_id LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.vendas_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- pos_owner_id changed
    IF NEW.pos_owner_id IS DISTINCT FROM OLD.pos_owner_id AND NEW.pos_owner_id IS NOT NULL THEN
        SELECT id INTO v_phase_id FROM pipeline_phases WHERE slug = 'pos_venda' AND org_id = NEW.org_id LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.pos_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- concierge_owner_id changed
    IF NEW.concierge_owner_id IS DISTINCT FROM OLD.concierge_owner_id AND NEW.concierge_owner_id IS NOT NULL THEN
        SELECT id INTO v_phase_id FROM pipeline_phases WHERE slug = 'concierge' AND org_id = NEW.org_id LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.concierge_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_phase_owner_from_legacy_trigger ON cards;
CREATE TRIGGER sync_phase_owner_from_legacy_trigger
    AFTER UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION sync_phase_owner_from_legacy();
