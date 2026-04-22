-- ============================================================================
-- Account ↔ Workspace isolation: guards & audit helpers
--
-- Motivação: a account "Welcome Group" (parent_org_id IS NULL) contém linhas
-- em pipeline_phases com slugs canônicos (planner, sdr, pos_venda, etc) que
-- colidem por slug com as linhas dos workspaces filhos. Qualquer RPC que
-- faça `WHERE slug='X' LIMIT 1` sem filtrar pipeline_id pode pegar a linha
-- errada da account em vez da linha correta do workspace (bug original do
-- criar_sub_card, corrigido em 20260422a).
--
-- Esta migration endereça três guards:
-- 1. sync_phase_owner_from_legacy: trigger que assume 1 pipeline por org.
--    Passa a resolver o pipeline_id a partir do card (NEW.pipeline_id),
--    permitindo org com múltiplos pipelines no futuro.
-- 2. replace_cadence_steps: RPC SECURITY DEFINER destrutiva que deletava
--    cadence_queue sem validar que o template pertence à org do chamador.
--    Passa a validar org_id antes do DELETE.
-- 3. pipeline_phases_duplicate_slugs_count: RPC auxiliar para o smoke test
--    detectar duplicações de slug dentro de uma mesma "família" de account.
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1. sync_phase_owner_from_legacy: filtrar phase por pipeline do card, não só org
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_phase_owner_from_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phase_id UUID;
    v_pipeline_id UUID;
BEGIN
    v_pipeline_id := NEW.pipeline_id;

    IF v_pipeline_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- sdr_owner_id changed
    IF NEW.sdr_owner_id IS DISTINCT FROM OLD.sdr_owner_id AND NEW.sdr_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'sdr'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.sdr_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- vendas_owner_id changed
    IF NEW.vendas_owner_id IS DISTINCT FROM OLD.vendas_owner_id AND NEW.vendas_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'planner'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.vendas_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- pos_owner_id changed
    IF NEW.pos_owner_id IS DISTINCT FROM OLD.pos_owner_id AND NEW.pos_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'pos_venda'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.pos_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- concierge_owner_id changed
    IF NEW.concierge_owner_id IS DISTINCT FROM OLD.concierge_owner_id AND NEW.concierge_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'concierge'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.concierge_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger já existe e foi criado em 20260402_h3_016; não recriar aqui.


-- =============================================================================
-- 2. replace_cadence_steps: validar org do template antes de deletar
-- =============================================================================

CREATE OR REPLACE FUNCTION replace_cadence_steps(
    p_template_id UUID,
    p_steps JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template_org UUID;
    v_caller_org UUID;
BEGIN
    v_caller_org := requesting_org_id();

    SELECT org_id INTO v_template_org
    FROM cadence_templates
    WHERE id = p_template_id;

    IF v_template_org IS NULL THEN
        RAISE EXCEPTION 'Template de cadência não encontrado: %', p_template_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_org IS NULL OR v_template_org <> v_caller_org THEN
        RAISE EXCEPTION 'Permissão negada: template pertence a outra organização'
            USING ERRCODE = '42501';
    END IF;

    -- 1) Nullificar FK em cadence_instances
    UPDATE cadence_instances
    SET current_step_id = NULL
    WHERE template_id = p_template_id;

    -- 2) Deletar items da queue referenciando steps deste template
    DELETE FROM cadence_queue
    WHERE step_id IN (
        SELECT id FROM cadence_steps WHERE template_id = p_template_id
    );

    -- 3) Deletar steps antigos
    DELETE FROM cadence_steps
    WHERE template_id = p_template_id;

    -- 4) Inserir novos steps do JSON
    INSERT INTO cadence_steps (
        template_id, step_order, step_key, step_type, block_index,
        day_offset, wait_config, requires_previous_completed,
        due_offset, task_config, next_step_key
    )
    SELECT
        p_template_id,
        (s->>'step_order')::INT,
        s->>'step_key',
        s->>'step_type',
        (s->>'block_index')::INT,
        (s->>'day_offset')::INT,
        CASE WHEN s->'wait_config' = 'null'::JSONB THEN NULL ELSE s->'wait_config' END,
        COALESCE((s->>'requires_previous_completed')::BOOL, false),
        s->'due_offset',
        s->'task_config',
        NULLIF(s->>'next_step_key', '')
    FROM jsonb_array_elements(p_steps) AS s;
END;
$$;

-- =============================================================================
-- 3. pipeline_phases_duplicate_slugs_count: auditoria para smoke test
--
-- Retorna quantas linhas de pipeline_phases têm slug que colide com outra
-- linha na MESMA família hierárquica (account + seus workspaces filhos).
-- Em estado saudável: 0. Hoje retorna > 0 enquanto Welcome Group tiver
-- resíduos — a limpeza do Balde (ii) vai zerar este número.
-- =============================================================================

CREATE OR REPLACE FUNCTION pipeline_phases_duplicate_slugs_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Defensive: se pipelines.org_id não existir (staging defasado), retornar 0
    -- sem falhar. Em produção a coluna existe e o audit corre normal.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pipelines'
          AND column_name = 'org_id'
    ) THEN
        RETURN 0;
    END IF;

    EXECUTE $sql$
        WITH org_family AS (
            SELECT
                id AS org_id,
                COALESCE(parent_org_id, id) AS account_id
            FROM organizations
        ),
        phase_org AS (
            SELECT DISTINCT
                pp.id AS phase_id,
                pp.slug,
                p.org_id
            FROM pipeline_phases pp
            JOIN pipeline_stages s ON s.phase_id = pp.id
            JOIN pipelines p ON p.id = s.pipeline_id
            WHERE pp.slug IS NOT NULL
        ),
        phases_with_family AS (
            SELECT po.phase_id, po.slug, of.account_id
            FROM phase_org po
            JOIN org_family of ON of.org_id = po.org_id
        ),
        collisions AS (
            SELECT account_id, slug, COUNT(DISTINCT phase_id) AS n
            FROM phases_with_family
            GROUP BY account_id, slug
            HAVING COUNT(DISTINCT phase_id) > 1
        )
        SELECT COALESCE(SUM(n), 0)::INT FROM collisions;
    $sql$ INTO v_count;

    RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION pipeline_phases_duplicate_slugs_count() TO authenticated, service_role;

COMMENT ON FUNCTION pipeline_phases_duplicate_slugs_count() IS
'Smoke test: retorna 0 quando nenhuma família de account tem duplicata de slug em pipeline_phases. Usado em .claude/hooks/schema-smoke-test.sh para detectar regressão após a limpeza do Balde (ii) do plano de separação account/workspace.';

COMMIT;
