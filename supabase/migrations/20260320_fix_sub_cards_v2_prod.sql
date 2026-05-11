-- ============================================================================
-- Fix: Sub-Cards V2 — corrigir itens que falharam na promoção para produção
-- Date: 2026-03-20
--
-- A migration principal falhou em produção porque:
-- 1. view_dashboard_funil tem colunas diferentes — precisa DROP + CREATE
-- 2. O restante da transaction foi rollback junto
--
-- Esta migration re-aplica APENAS o que falhou.
-- Primeiro verifica o que já existe para ser idempotente.
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. Colunas novas (idempotente — IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cards ADD COLUMN IF NOT EXISTS valor_proprio NUMERIC;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sub_card_agregado_em TIMESTAMPTZ;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS sub_card_default_stage_id UUID REFERENCES pipeline_stages(id);

-- Backfill valor_proprio para cards que não são sub-cards e ainda não têm valor
UPDATE cards SET valor_proprio = COALESCE(valor_final, valor_estimado, 0)
WHERE valor_proprio IS NULL
  AND (card_type IS NULL OR card_type != 'sub_card');

-- ══════════════════════════════════════════════════════════════
-- 2. Status 'completed' na constraint
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_sub_card_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_sub_card_status_check
    CHECK (sub_card_status IS NULL OR sub_card_status IN ('active', 'merged', 'cancelled', 'completed'));

-- ══════════════════════════════════════════════════════════════
-- 3. Trigger de agregação
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION aggregate_sub_card_values() RETURNS TRIGGER AS $$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Determinar fase atual do sub-card
    IF NEW.pipeline_stage_id IS NOT NULL THEN
        SELECT pp.slug INTO v_phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.id = NEW.pipeline_stage_id;
    END IF;

    -- Marcar timestamp de agregação quando entra em Pós-Venda pela primeira vez
    IF v_phase_slug = 'pos_venda' AND NEW.sub_card_agregado_em IS NULL THEN
        UPDATE cards SET sub_card_agregado_em = NOW() WHERE id = NEW.id;
    END IF;

    -- Recalcular valor do pai: soma APENAS sub-cards já em Pós-Venda ou completed
    IF NEW.parent_card_id IS NOT NULL THEN
        UPDATE cards SET valor_final = (
            COALESCE(valor_proprio, 0) + COALESCE((
                SELECT SUM(COALESCE(sc.valor_final, sc.valor_estimado, 0))
                FROM cards sc
                WHERE sc.parent_card_id = NEW.parent_card_id
                  AND sc.card_type = 'sub_card'
                  AND sc.sub_card_status IN ('active', 'completed')
                  AND sc.sub_card_agregado_em IS NOT NULL
            ), 0)
        )
        WHERE id = NEW.parent_card_id
          AND EXISTS (SELECT 1 FROM cards c2 WHERE c2.id = NEW.parent_card_id
                      AND (c2.card_type IS NULL OR c2.card_type != 'sub_card'));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop e recria trigger (idempotente)
DROP TRIGGER IF EXISTS trg_aggregate_sub_card_values ON cards;
CREATE TRIGGER trg_aggregate_sub_card_values
    AFTER INSERT OR UPDATE OF valor_final, valor_estimado, sub_card_status, pipeline_stage_id
    ON cards
    FOR EACH ROW
    WHEN (NEW.card_type = 'sub_card' AND NEW.parent_card_id IS NOT NULL)
    EXECUTE FUNCTION aggregate_sub_card_values();

-- ══════════════════════════════════════════════════════════════
-- 4. RPC criar_sub_card (V2 — qualquer fase, múltiplos, sem merge)
-- ══════════════════════════════════════════════════════════════

-- Dropar overloads antigos para evitar ambiguidade no PostgREST
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS criar_sub_card(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
BEGIN
    -- 1. Buscar card pai
    SELECT c.*, s.fase
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- 2. Validações
    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de uma oportunidade futura');
    END IF;

    IF v_parent.is_group_parent = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um grupo');
    END IF;

    -- 3. Resolver estágio inicial
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT pp.id INTO v_planner_phase_id
        FROM pipeline_phases pp WHERE pp.name = 'Planner' LIMIT 1;

        IF v_planner_phase_id IS NOT NULL THEN
            SELECT id INTO v_target_stage_id
            FROM pipeline_stages
            WHERE phase_id = v_planner_phase_id
              AND pipeline_id = v_parent.pipeline_id
              AND nome = 'Proposta em Construção'
            LIMIT 1;

            IF v_target_stage_id IS NULL THEN
                SELECT id INTO v_target_stage_id
                FROM pipeline_stages
                WHERE phase_id = v_planner_phase_id
                  AND pipeline_id = v_parent.pipeline_id
                ORDER BY ordem ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa Planner encontrada');
    END IF;

    -- 4. Criar sub-card (modo sempre incremental, sem merge)
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, moeda,
        valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_parent.moeda,
        0,
        COALESCE(v_parent.vendas_owner_id, v_parent.dono_atual_id),
        v_parent.sdr_owner_id, v_parent.vendas_owner_id,
        v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Log
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'valor_estimado', 0),
        jsonb_build_object('target_stage_id', v_target_stage_id)
    );

    -- 6. Activity
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        p_parent_id,
        'sub_card_created',
        'Item da viagem criado: ' || p_titulo,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'mode', 'incremental'),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'parent_id', p_parent_id,
        'mode', 'incremental'
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. Deprecar merge_sub_card
-- ══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS merge_sub_card(UUID, JSONB);
CREATE OR REPLACE FUNCTION merge_sub_card(p_sub_card_id UUID, p_options JSONB DEFAULT '{}')
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object('success', false, 'error', 'Merge depreciado. Valores agregam automaticamente no card pai.');
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- 6. get_sub_cards enriquecido
-- ══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_sub_cards(UUID);
CREATE OR REPLACE FUNCTION get_sub_cards(p_parent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.created_at), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT
            c.id,
            c.titulo,
            c.sub_card_mode,
            c.sub_card_status,
            c.valor_estimado,
            c.valor_final,
            c.status_comercial,
            c.ganho_planner,
            COALESCE(c.ganho_planner, false) AS is_planner_won,
            s.nome AS etapa_nome,
            s.fase,
            c.merged_at,
            c.merge_metadata,
            c.merge_config,
            c.created_at,
            c.data_fechamento,
            c.sub_card_agregado_em,
            p.nome AS dono_nome,
            -- V2: progresso
            CASE
                WHEN total_stages.cnt > 0
                THEN ROUND((current_stage.pos::numeric / total_stages.cnt::numeric) * 100)
                ELSE 0
            END AS progress_percent,
            -- V2: fase atual
            pp.slug AS phase_slug,
            -- V2: financeiro
            COALESCE(fi.total_count, 0) AS financial_items_count,
            COALESCE(fi.ready_count, 0) AS financial_items_ready
        FROM cards c
        LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
        LEFT JOIN pipeline_phases pp ON s.phase_id = pp.id
        LEFT JOIN profiles p ON c.dono_atual_id = p.id
        -- Progresso: posição do estágio atual
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS pos
            FROM pipeline_stages ps2
            WHERE ps2.pipeline_id = c.pipeline_id
              AND ps2.ativo = true
              AND ps2.ordem <= s.ordem
        ) current_stage ON true
        -- Total de estágios no pipeline
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS cnt
            FROM pipeline_stages ps3
            WHERE ps3.pipeline_id = c.pipeline_id
              AND ps3.ativo = true
        ) total_stages ON true
        -- Financeiro
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS total_count,
                COUNT(*) FILTER (WHERE cfi.is_ready = true) AS ready_count
            FROM card_financial_items cfi
            WHERE cfi.card_id = c.id
        ) fi ON true
        WHERE c.parent_card_id = p_parent_id
          AND c.card_type = 'sub_card'
          AND c.deleted_at IS NULL
    ) sub;

    RETURN v_result;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. Analytics RPCs — dropar overloads simplificados e aplicar versões completas
-- ══════════════════════════════════════════════════════════════

-- Dropar overloads simplificados (TEXT, TEXT, TEXT, UUID, UUID[]) que conflitam
DROP FUNCTION IF EXISTS analytics_overview_kpis(TEXT, TEXT, TEXT, UUID, UUID[]);
DROP FUNCTION IF EXISTS analytics_financial_breakdown(TEXT, TEXT, TEXT, UUID, UUID[]);

-- Dropar e recriar versão completa (a que o frontend usa)
DROP FUNCTION IF EXISTS analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_taxa_paga_id UUID;
    v_briefing_id UUID;
    v_proposta_id UUID;
    v_viagem_id UUID;
BEGIN
    SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'taxa_paga' LIMIT 1;
    SELECT s.id INTO v_briefing_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'briefing' LIMIT 1;
    SELECT s.id INTO v_proposta_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'proposta' LIMIT 1;
    SELECT s.id INTO v_viagem_id FROM pipeline_stages s WHERE s.ativo = true AND s.milestone_key = 'viagem_confirmada' LIMIT 1;

    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (c.card_type IS NULL OR c.card_type != 'sub_card')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    outcomes_pool AS (
        SELECT c.id, c.status_comercial, c.valor_final, c.receita,
               c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (c.card_type IS NULL OR c.card_type != 'sub_card')
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    milestone_proof AS (
        SELECT DISTINCT a.card_id, (a.metadata->>'new_stage_id')::UUID AS proved_stage_id
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.card_id IN (SELECT lp.id FROM leads_pool lp)
          AND (a.metadata->>'new_stage_id')::UUID IN (v_taxa_paga_id, v_briefing_id, v_proposta_id, v_viagem_id)
    )
    SELECT json_build_object(
        'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
        'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio', CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(
                EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
            ), 1), 0)
            FROM outcomes_pool o
            WHERE o.status_comercial = 'ganho'
              AND o.data_fechamento IS NOT NULL
              AND o.data_fechamento::TIMESTAMPTZ > o.created_at
        ),
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'taxa_paga_count', CASE WHEN v_taxa_paga_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_taxa_paga_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
        ) ELSE 0 END,
        'taxa_paga_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_taxa_paga_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_taxa_paga_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_taxa_paga_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'briefing_count', CASE WHEN v_briefing_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_briefing_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
        ) ELSE 0 END,
        'briefing_agendado_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_briefing_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_briefing_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_briefing_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'proposta_count', CASE WHEN v_proposta_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_proposta_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
        ) ELSE 0 END,
        'proposta_enviada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_proposta_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_proposta_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_proposta_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END,
        'viagem_confirmada_count', CASE WHEN v_viagem_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM leads_pool lp
            WHERE lp.pipeline_stage_id = v_viagem_id
               OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
        ) ELSE 0 END,
        'viagem_confirmada_rate', CASE WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_viagem_id IS NOT NULL THEN ROUND(
            (SELECT COUNT(*) FROM leads_pool lp
             WHERE lp.pipeline_stage_id = v_viagem_id
                OR EXISTS (SELECT 1 FROM milestone_proof mp WHERE mp.card_id = lp.id AND mp.proved_stage_id = v_viagem_id)
            )::NUMERIC / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
        ELSE 0 END
    ) INTO result;

    RETURN result;
END;
$$;

-- 7b. analytics_financial_breakdown — versão completa
DROP FUNCTION IF EXISTS analytics_financial_breakdown(DATE, DATE, TEXT, TEXT, TEXT, UUID, UUID, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION analytics_financial_breakdown(
    p_date_start  DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_granularity TEXT DEFAULT 'month', p_product TEXT DEFAULT NULL,
    p_mode        TEXT DEFAULT 'entries', p_stage_id UUID DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL, p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids     UUID[] DEFAULT NULL
)
RETURNS TABLE(period TEXT, valor_final_sum NUMERIC, receita_sum NUMERIC, count_won BIGINT, ticket_medio NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE p_granularity
            WHEN 'day'  THEN TO_CHAR(c.data_fechamento, 'YYYY-MM-DD')
            WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', c.data_fechamento), 'YYYY-MM-DD')
            ELSE TO_CHAR(DATE_TRUNC('month', c.data_fechamento), 'YYYY-MM')
        END AS period,
        COALESCE(SUM(c.valor_final), 0),
        COALESCE(SUM(c.receita), 0),
        COUNT(*) FILTER (WHERE c.card_type IS NULL OR c.card_type != 'sub_card'),
        CASE WHEN COUNT(*) FILTER (WHERE c.card_type IS NULL OR c.card_type != 'sub_card') > 0
            THEN ROUND(COALESCE(SUM(c.valor_final), 0) / COUNT(*) FILTER (WHERE c.card_type IS NULL OR c.card_type != 'sub_card'), 2)
            ELSE 0
        END
    FROM cards c
    WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.data_fechamento IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start::TIMESTAMPTZ, p_date_end::TIMESTAMPTZ, p_product))
          WHEN p_mode = 'ganho_total' THEN
              (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
              AND (p_date_end IS NULL OR c.data_fechamento <= p_date_end)
          ELSE
              (p_date_start IS NULL OR c.data_fechamento >= p_date_start)
              AND (p_date_end IS NULL OR c.data_fechamento <= p_date_end)
      END
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 8. view_dashboard_funil — DROP e recria (colunas mudaram)
-- ══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS view_dashboard_funil;

CREATE VIEW view_dashboard_funil AS
SELECT
    s.id AS stage_id,
    s.nome AS etapa_nome,       -- backward compat com frontend
    s.nome AS stage_nome,
    s.fase,
    s.ordem AS etapa_ordem,     -- backward compat com frontend
    s.ordem,
    c.produto,
    COUNT(c.id) FILTER (WHERE c.card_type IS NULL OR c.card_type != 'sub_card') AS total_cards,
    COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0) AS valor_total,
    COALESCE(SUM(c.receita), 0) AS receita_total,
    COUNT(c.id) FILTER (WHERE c.card_type = 'sub_card') AS sub_card_count
FROM pipeline_stages s
LEFT JOIN cards c ON c.pipeline_stage_id = s.id
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
WHERE s.ativo = true
GROUP BY s.id, s.nome, s.fase, s.ordem, c.produto
ORDER BY s.ordem;

COMMIT;
