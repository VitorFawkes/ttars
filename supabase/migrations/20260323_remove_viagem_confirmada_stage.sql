-- ============================================================
-- Remover etapa "Viagem Confirmada" do Planner
-- Date: 2026-03-23
--
-- Contexto: A lógica de ganho mudou — o botão "Ganho" no Planner
-- (RPC marcar_ganho) já move o card para a 1ª etapa de Pós-Venda.
-- A etapa "Viagem Confirmada" ficou redundante.
--
-- Mudanças:
--   1. Mover cards abertos de "Viagem Confirmada" para 1ª etapa Pós-Venda
--   2. Desativar a etapa
--   3. Corrigir merge_sub_card: usar ganho_planner do card (não is_planner_won da etapa)
--   4. Corrigir analytics_overview_kpis: usar ganho_planner ao invés de posição
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. Mover cards abertos para 1ª etapa de Pós-Venda + marcar ganho_planner
-- ──────────────────────────────────────────────────────────────

UPDATE cards
SET pipeline_stage_id = (
    SELECT s.id FROM pipeline_stages s
    WHERE s.phase_id = '95e78a06-92af-447c-9f71-60b2c23f1420'  -- pos_venda
      AND s.ativo = true
      AND COALESCE(s.is_won, false) = false
      AND COALESCE(s.is_lost, false) = false
    ORDER BY s.ordem ASC LIMIT 1
),
    ganho_planner = true,
    ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE pipeline_stage_id = 'cba42c81-7a3e-40bf-bf66-990d9c09b8d3'
  AND status_comercial = 'aberto'
  AND deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- 2. Desativar a etapa "Viagem Confirmada (Ganho)"
-- ──────────────────────────────────────────────────────────────

UPDATE pipeline_stages
SET ativo = false
WHERE id = 'cba42c81-7a3e-40bf-bf66-990d9c09b8d3';

-- ──────────────────────────────────────────────────────────────
-- 3. Corrigir merge_sub_card — usar ganho_planner do card
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION merge_sub_card(
    p_sub_card_id UUID,
    p_options JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_card RECORD;
    v_parent RECORD;
    v_user_id UUID;
    v_old_parent_value NUMERIC;
    v_new_parent_value NUMERIC;
    v_sub_card_value NUMERIC;
    v_proposal_id UUID;
    -- Merge config
    v_merge_config JSONB;
    v_text_mode TEXT;
    v_viagem_mode TEXT;
    -- Text merge vars
    v_separator TEXT;
    v_new_obs TEXT;
    v_parent_brief_obs JSONB;
    v_sub_brief_obs JSONB;
    v_merged_brief_obs JSONB;
    -- Viagem merge vars
    v_parent_destinos JSONB;
    v_sub_destinos JSONB;
    v_merged_destinos JSONB;
    -- Monde numbers
    v_sub_monde TEXT;
    -- Snapshot for audit
    v_parent_snapshot JSONB;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation
    SELECT c.*
    INTO v_sub_card
    FROM cards c
    WHERE c.id = p_sub_card_id
      AND c.card_type = 'sub_card'
      AND c.sub_card_status = 'active'
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado ou não está ativo');
    END IF;

    -- Check ganho_planner no card (não mais is_planner_won na etapa)
    IF NOT COALESCE(v_sub_card.ganho_planner, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card deve ter ganho do Planner confirmado para fazer merge');
    END IF;

    -- 2. Get parent card
    SELECT * INTO v_parent
    FROM cards
    WHERE id = v_sub_card.parent_card_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- 3. Resolve merge_config (p_options override > sub-card stored > default)
    v_merge_config := COALESCE(
        p_options->'merge_config',
        v_sub_card.merge_config,
        '{"texto":{"merge_mode":"replace"},"viagem":{"merge_mode":"replace"}}'::jsonb
    );
    v_text_mode := COALESCE(v_merge_config->'texto'->>'merge_mode', 'replace');
    v_viagem_mode := COALESCE(v_merge_config->'viagem'->>'merge_mode', 'replace');

    -- 4. Calculate value
    v_old_parent_value := COALESCE(v_parent.valor_final, v_parent.valor_estimado, 0);
    v_sub_card_value := COALESCE(v_sub_card.valor_final, v_sub_card.valor_estimado, 0);

    IF v_sub_card.sub_card_mode = 'complete' AND v_sub_card_value = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card em modo "completo" com valor zero. Defina um valor antes de fazer merge.');
    END IF;

    IF v_sub_card.sub_card_mode = 'incremental' THEN
        v_new_parent_value := v_old_parent_value + v_sub_card_value;
    ELSE
        v_new_parent_value := v_sub_card_value;
    END IF;

    -- 5. Snapshot parent text/trip data for audit
    v_parent_snapshot := jsonb_build_object(
        'observacoes', v_parent.produto_data->>'observacoes',
        'briefing_observacoes', v_parent.briefing_inicial->'observacoes',
        'destinos', v_parent.produto_data->'destinos',
        'orcamento', v_parent.produto_data->'orcamento',
        'epoca_viagem', v_parent.produto_data->'epoca_viagem',
        'duracao_viagem', v_parent.produto_data->'duracao_viagem',
        'quantidade_viajantes', v_parent.produto_data->'quantidade_viajantes'
    );

    -- 6. Update parent value
    UPDATE cards
    SET valor_final = v_new_parent_value, updated_at = now()
    WHERE id = v_parent.id;

    -- ══════════════════════════════════════════════════════════
    -- 7. MERGE GRUPO TEXTO (observacoes livres + briefing SDR)
    -- ══════════════════════════════════════════════════════════

    v_separator := E'\n\n--- Alteração: ' || v_sub_card.titulo || ' (' || to_char(now(), 'DD/MM/YYYY') || E') ---\n\n';

    IF v_text_mode = 'replace' THEN
        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb) || jsonb_build_object(
                'observacoes', COALESCE(v_sub_card.produto_data->>'observacoes', '')
            ),
            briefing_inicial = COALESCE(briefing_inicial, '{}'::jsonb) || jsonb_build_object(
                'observacoes', COALESCE(v_sub_card.briefing_inicial->'observacoes', '{}'::jsonb)
            ),
            updated_at = now()
        WHERE id = v_parent.id;

    ELSIF v_text_mode = 'append' THEN
        v_new_obs := COALESCE(v_parent.produto_data->>'observacoes', '');
        IF COALESCE(v_sub_card.produto_data->>'observacoes', '') != '' THEN
            IF v_new_obs != '' THEN
                v_new_obs := v_new_obs || v_separator;
            END IF;
            v_new_obs := v_new_obs || COALESCE(v_sub_card.produto_data->>'observacoes', '');
        END IF;

        v_parent_brief_obs := COALESCE(v_parent.briefing_inicial->'observacoes', '{}'::jsonb);
        v_sub_brief_obs := COALESCE(v_sub_card.briefing_inicial->'observacoes', '{}'::jsonb);

        v_merged_brief_obs := v_parent_brief_obs;

        IF v_sub_brief_obs != '{}'::jsonb THEN
            SELECT v_merged_brief_obs || COALESCE(jsonb_object_agg(key,
                CASE
                    WHEN v_parent_brief_obs ? key
                     AND jsonb_typeof(v_parent_brief_obs->key) = 'string'
                     AND jsonb_typeof(value) = 'string'
                     AND (v_parent_brief_obs->>key) != ''
                     AND (value#>>'{}') != ''
                    THEN to_jsonb((v_parent_brief_obs->>key) || v_separator || (value#>>'{}'))
                    WHEN (value#>>'{}') != '' OR jsonb_typeof(value) != 'string'
                    THEN value
                    ELSE COALESCE(v_parent_brief_obs->key, value)
                END
            ), '{}'::jsonb)
            INTO v_merged_brief_obs
            FROM jsonb_each(v_sub_brief_obs);
        END IF;

        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb) || jsonb_build_object('observacoes', v_new_obs),
            briefing_inicial = COALESCE(briefing_inicial, '{}'::jsonb) || jsonb_build_object('observacoes', v_merged_brief_obs),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 8. MERGE GRUPO VIAGEM (destinos, orcamento, epoca, etc.)
    -- ══════════════════════════════════════════════════════════

    IF v_viagem_mode = 'replace' THEN
        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb)
                || CASE WHEN v_sub_card.produto_data ? 'destinos'
                        THEN jsonb_build_object('destinos', v_sub_card.produto_data->'destinos')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'orcamento'
                        THEN jsonb_build_object('orcamento', v_sub_card.produto_data->'orcamento')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'epoca_viagem'
                        THEN jsonb_build_object('epoca_viagem', v_sub_card.produto_data->'epoca_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'duracao_viagem'
                        THEN jsonb_build_object('duracao_viagem', v_sub_card.produto_data->'duracao_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'quantidade_viajantes'
                        THEN jsonb_build_object('quantidade_viajantes', v_sub_card.produto_data->'quantidade_viajantes')
                        ELSE '{}'::jsonb END,
            data_viagem_inicio = COALESCE(v_sub_card.data_viagem_inicio, data_viagem_inicio),
            data_viagem_fim = COALESCE(v_sub_card.data_viagem_fim, data_viagem_fim),
            updated_at = now()
        WHERE id = v_parent.id;

    ELSIF v_viagem_mode = 'append' THEN
        v_parent_destinos := COALESCE(v_parent.produto_data->'destinos', '[]'::jsonb);
        v_sub_destinos := COALESCE(v_sub_card.produto_data->'destinos', '[]'::jsonb);

        IF jsonb_typeof(v_parent_destinos) = 'array' AND jsonb_typeof(v_sub_destinos) = 'array' THEN
            v_merged_destinos := v_parent_destinos || v_sub_destinos;
        ELSE
            v_merged_destinos := COALESCE(v_sub_destinos, v_parent_destinos);
        END IF;

        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb)
                || jsonb_build_object('destinos', v_merged_destinos)
                || CASE WHEN v_sub_card.produto_data ? 'orcamento'
                        THEN jsonb_build_object('orcamento', v_sub_card.produto_data->'orcamento')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'epoca_viagem'
                        THEN jsonb_build_object('epoca_viagem', v_sub_card.produto_data->'epoca_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'duracao_viagem'
                        THEN jsonb_build_object('duracao_viagem', v_sub_card.produto_data->'duracao_viagem')
                        ELSE '{}'::jsonb END
                || CASE WHEN v_sub_card.produto_data ? 'quantidade_viajantes'
                        THEN jsonb_build_object('quantidade_viajantes', v_sub_card.produto_data->'quantidade_viajantes')
                        ELSE '{}'::jsonb END,
            data_viagem_inicio = COALESCE(v_sub_card.data_viagem_inicio, data_viagem_inicio),
            data_viagem_fim = COALESCE(v_sub_card.data_viagem_fim, data_viagem_fim),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 9. Monde number sync
    -- ══════════════════════════════════════════════════════════

    v_sub_monde := v_sub_card.produto_data->>'numero_monde';
    IF v_sub_monde IS NOT NULL AND v_sub_monde != '' THEN
        UPDATE cards SET
            produto_data = COALESCE(produto_data, '{}'::jsonb)
                || jsonb_build_object('numero_monde', v_sub_monde),
            updated_at = now()
        WHERE id = v_parent.id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 10. Close sub-card
    -- ══════════════════════════════════════════════════════════

    UPDATE cards
    SET sub_card_status = 'merged',
        merged_at = now(),
        merge_metadata = jsonb_build_object(
            'merged_by', v_user_id,
            'merged_at', now(),
            'old_parent_value', v_old_parent_value,
            'new_parent_value', v_new_parent_value,
            'sub_card_value', v_sub_card_value,
            'mode', v_sub_card.sub_card_mode,
            'merge_config', v_merge_config,
            'parent_snapshot', v_parent_snapshot
        ),
        status_comercial = 'ganho',
        data_fechamento = CURRENT_DATE,
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- Close associated tasks
    UPDATE tarefas
    SET status = 'concluida'
    WHERE card_id IN (v_sub_card.parent_card_id, p_sub_card_id)
      AND metadata->>'sub_card_id' = p_sub_card_id::TEXT
      AND status != 'concluida';

    -- ══════════════════════════════════════════════════════════
    -- 11. If proposal exists, update link
    -- ══════════════════════════════════════════════════════════

    SELECT id INTO v_proposal_id
    FROM propostas
    WHERE card_id = p_sub_card_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_proposal_id IS NOT NULL THEN
        UPDATE propostas
        SET card_id = v_parent.id, updated_at = now()
        WHERE id = v_proposal_id;
    END IF;

    -- ══════════════════════════════════════════════════════════
    -- 12. Activity log
    -- ══════════════════════════════════════════════════════════

    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        v_parent.id, 'sub_card_merged',
        'Card de alteração integrado: ' || v_sub_card.titulo,
        jsonb_build_object(
            'sub_card_id', p_sub_card_id,
            'sub_card_titulo', v_sub_card.titulo,
            'mode', v_sub_card.sub_card_mode,
            'merge_config', v_merge_config,
            'old_parent_value', v_old_parent_value,
            'new_parent_value', v_new_parent_value,
            'sub_card_value', v_sub_card_value
        ),
        v_user_id, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'old_value', v_old_parent_value,
        'new_value', v_new_parent_value,
        'merge_config', v_merge_config
    );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. Corrigir analytics_overview_kpis — ganho_planner ao invés de posição
--    (Etapa desativada faria v_viagem_id = NULL → KPI sempre 0)
--    Dropar TODAS as overloads antes de recriar
-- ──────────────────────────────────────────────────────────────

-- Dropar TODAS as overloads de analytics_overview_kpis
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS func_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'analytics_overview_kpis'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE';
    END LOOP;
END $$;

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
    v_pipeline_id UUID;
BEGIN
    -- Resolve pipeline do produto para filtrar milestones
    IF p_product IS NOT NULL THEN
        SELECT p.id INTO v_pipeline_id FROM pipelines p WHERE p.produto::TEXT = p_product LIMIT 1;
    END IF;

    SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'taxa_paga'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_briefing_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'briefing'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    SELECT s.id INTO v_proposta_id FROM pipeline_stages s
    WHERE s.ativo = true AND s.milestone_key = 'proposta'
      AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
    -- v_viagem_id removido — agora usa ganho_planner do card

    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at,
               c.ganho_planner
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
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
          AND (a.metadata->>'new_stage_id')::UUID IN (v_taxa_paga_id, v_briefing_id, v_proposta_id)
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
        -- Milestone counts + rates (position-based via milestone_proof)
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
        -- Ganho Planner: usa flag do card (etapa desativada)
        'ganho_planner_count', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho'),
        'ganho_planner_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[]) TO authenticated;

COMMIT;
