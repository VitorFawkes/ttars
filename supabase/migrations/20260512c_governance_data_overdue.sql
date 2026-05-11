-- ============================================================================
-- MIGRATION: Pipeline governance settings + trigger de bloqueio de stage move
-- quando a Data Prevista de Fechamento está no passado
-- Date: 2026-05-12
--
-- CONTEXTO
-- Quando o cliente atrasa pra fechar e a data prevista virou passado, o card
-- precisa avisar e bloquear. O nível de bloqueio é configurável pelo admin
-- de cada pipeline:
-- - 'warn_only'  → só badge visual, nada bloqueia
-- - 'block_move' → bloqueia avanço de etapa, resto editável
-- - 'block_all'  → UI trava todos os campos exceto o próprio campo data
--                  (default, é o que o Vitor pediu)
--
-- IMPORTANTE
-- O trigger no banco SEMPRE bloqueia apenas transição de etapa (UPDATE em
-- pipeline_stage_id) — independente da severidade configurada. O nível
-- 'block_all' é decisão de UI (modal full-screen no CardDetail), não de banco.
-- Bloquear UPDATE no banco indistintamente quebraria integrações (cadência,
-- webhook AC, sync Monde, n8n) que precisam atualizar campos de cards mesmo
-- em estado "atrasado".
--
-- BYPASS
-- O trigger respeita os mesmos mecanismos do enforce_stage_requirements_on_card_move:
-- - GUC app.bypass_stage_requirements='true' → usado por bulk_create_pos_venda_cards,
--   handle_card_auto_advance, revert_pos_venda_import_items.
-- - JWT role='service_role' → edge functions, integrações.
--
-- PROVISIONING DE NOVAS ORGS
-- Em vez de recriar provision_workspace (já rebaseada em 2 migrations:
-- 20260413 + 20260426c — recriar tem alto risco de reverter correções),
-- usamos um trigger AFTER INSERT em pipelines que insere automaticamente a
-- linha em pipeline_governance_settings quando um pipeline TRIPS nasce.
-- Funciona pra novas orgs sem tocar em provision_workspace.
-- ============================================================================

BEGIN;

-- ─── 1. Tipo de severidade ──────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'governance_overdue_severity') THEN
        CREATE TYPE governance_overdue_severity AS ENUM ('warn_only', 'block_move', 'block_all');
    END IF;
END $$;

-- ─── 2. Tabela pipeline_governance_settings ─────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_governance_settings (
    pipeline_id UUID PRIMARY KEY REFERENCES pipelines(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    data_overdue_severity governance_overdue_severity NOT NULL DEFAULT 'block_all',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pgs_org_id ON pipeline_governance_settings(org_id);

-- RLS — multi-tenant
ALTER TABLE pipeline_governance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pgs_org_all ON pipeline_governance_settings;
CREATE POLICY pgs_org_all ON pipeline_governance_settings TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS pgs_service_all ON pipeline_governance_settings;
CREATE POLICY pgs_service_all ON pipeline_governance_settings TO service_role
    USING (TRUE) WITH CHECK (TRUE);

COMMENT ON TABLE pipeline_governance_settings IS
    'Configurações de governança por pipeline. data_overdue_severity controla como o sistema reage quando produto_data.data_prevista_fechamento está no passado (block_all=UI bloqueia tudo, block_move=só transição, warn_only=só badge). Trigger trg_cards_block_overdue_stage_move lê esta tabela.';

-- ─── 3. Seed para pipelines TRIPS existentes ─────────────────────────────────

INSERT INTO pipeline_governance_settings (pipeline_id, org_id, data_overdue_severity)
SELECT p.id, p.org_id, 'block_all'::governance_overdue_severity
FROM pipelines p
WHERE p.produto::TEXT = 'TRIPS'
ON CONFLICT (pipeline_id) DO NOTHING;

-- ─── 4. Trigger: auto-seed em pipelines TRIPS novas ──────────────────────────
-- Evita rebase de provision_workspace. Quando um pipeline TRIPS é inserido
-- (seja via provision_workspace, seja manualmente), cria a linha de
-- governance settings com severidade default 'block_all'.

CREATE OR REPLACE FUNCTION public.auto_seed_pipeline_governance_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- Só pra TRIPS por enquanto; produtos futuros entram caso a caso
    IF NEW.produto::TEXT = 'TRIPS' THEN
        INSERT INTO pipeline_governance_settings (pipeline_id, org_id, data_overdue_severity)
        VALUES (NEW.id, NEW.org_id, 'block_all'::governance_overdue_severity)
        ON CONFLICT (pipeline_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pipelines_auto_governance_seed ON pipelines;
CREATE TRIGGER trg_pipelines_auto_governance_seed
    AFTER INSERT ON pipelines
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_seed_pipeline_governance_settings();

COMMENT ON FUNCTION public.auto_seed_pipeline_governance_settings() IS
    'Cria linha em pipeline_governance_settings automaticamente quando um pipeline TRIPS nasce. Evita rebase de provision_workspace.';

-- ─── 5. Trigger principal: bloqueia stage move quando data prevista passou ──

CREATE OR REPLACE FUNCTION public.block_stage_move_if_overdue_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_severity governance_overdue_severity;
    v_data_prevista DATE;
BEGIN
    -- Bypass via GUC (mesmo mecanismo do quality gate existente)
    IF current_setting('app.bypass_stage_requirements', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Bypass via service_role (edge functions, integrações, scripts admin)
    IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Só interessa quando está mudando de etapa
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Cards ganhos/perdidos: não bloqueia (permite arquivamento e correções)
    IF NEW.status_comercial IN ('ganho', 'perdido') THEN
        RETURN NEW;
    END IF;

    -- Lê data prevista de produto_data
    v_data_prevista := NULLIF(NEW.produto_data->>'data_prevista_fechamento', '')::DATE;

    -- Data ausente ou no futuro: deixa passar
    IF v_data_prevista IS NULL OR v_data_prevista >= CURRENT_DATE THEN
        RETURN NEW;
    END IF;

    -- Busca severidade configurada do pipeline
    SELECT data_overdue_severity INTO v_severity
    FROM pipeline_governance_settings
    WHERE pipeline_id = NEW.pipeline_id;

    -- Default 'block_all' se não houver config (defesa em profundidade)
    v_severity := COALESCE(v_severity, 'block_all');

    -- warn_only não bloqueia no banco; só UI badge
    IF v_severity = 'warn_only' THEN
        RETURN NEW;
    END IF;

    -- block_move e block_all bloqueiam transição de etapa
    RAISE EXCEPTION 'DATA_PREVISTA_FECHAMENTO_OVERDUE'
        USING DETAIL = jsonb_build_object(
            'data_prevista', v_data_prevista,
            'severity', v_severity
        )::TEXT,
        HINT = format('Atualize a Data Prevista de Fechamento (atual: %s) para uma data futura antes de mover o card.', v_data_prevista),
        ERRCODE = 'check_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cards_block_overdue_stage_move ON cards;

-- Nome do trigger começa com "trg_cards_block" propositalmente: ordem alfabética
-- coloca DEPOIS de "trg_enforce_stage_requirements" (E < T), então o quality gate
-- (campos preenchidos) valida primeiro; se passar, o overdue valida em seguida.
CREATE TRIGGER trg_cards_block_overdue_stage_move
    BEFORE UPDATE OF pipeline_stage_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.block_stage_move_if_overdue_data();

COMMENT ON FUNCTION public.block_stage_move_if_overdue_data() IS
    'Bloqueia transição de etapa quando produto_data.data_prevista_fechamento < CURRENT_DATE e severidade do pipeline_governance_settings é block_move ou block_all. Respeita bypass via app.bypass_stage_requirements GUC e role service_role. NÃO bloqueia UPDATEs de outros campos — esses ficam por conta da UI quando severidade=block_all.';

-- ─── 6. updated_at automático ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_pgs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pgs_updated_at ON pipeline_governance_settings;
CREATE TRIGGER trg_pgs_updated_at
    BEFORE UPDATE ON pipeline_governance_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pgs_updated_at();

COMMIT;
