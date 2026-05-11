-- ============================================================
-- Migration: Sub-Cards V2 — Itens da Viagem
-- Date: 2026-03-20
--
-- Transforma sub-cards de "solicitação de alteração temporária"
-- para "item permanente da viagem" com ciclo completo no pipeline.
--
-- Mudanças:
-- 1. Nova coluna valor_proprio (valor base do card pai)
-- 2. Nova coluna sub_card_agregado_em (quando sub-card começou a agregar)
-- 3. Novo status 'completed' para sub-cards
-- 4. Coluna sub_card_default_stage_id no pipelines
-- 5. Trigger de agregação automática (SÓ quando sub-card entra em Pós-Venda)
-- 6. Reescrita de criar_sub_card (qualquer fase, múltiplos, sem merge_config)
-- 7. Deprecação de merge_sub_card
-- 8. get_sub_cards enriquecido (progresso, financeiro, agregação)
-- 9. Filtros de analytics (excluir sub-cards da contagem, incluir no valor)
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. NOVAS COLUNAS
-- ══════════════════════════════════════════════════════════════

-- valor_proprio: valor base do card antes da soma dos sub-cards
ALTER TABLE cards ADD COLUMN IF NOT EXISTS valor_proprio NUMERIC;

-- sub_card_agregado_em: timestamp de quando o sub-card entrou em Pós-Venda
-- (= quando seu valor passou a contar no pai)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sub_card_agregado_em TIMESTAMPTZ;

-- Backfill: cards que NÃO são sub-cards mantêm seu valor atual como valor_proprio
UPDATE cards SET valor_proprio = COALESCE(valor_final, valor_estimado, 0)
WHERE (card_type IS NULL OR card_type != 'sub_card')
  AND valor_proprio IS NULL;

-- Backfill: sub-cards já merged que estavam em pós-venda
UPDATE cards SET sub_card_agregado_em = COALESCE(merged_at, created_at)
WHERE card_type = 'sub_card'
  AND sub_card_status = 'merged'
  AND sub_card_agregado_em IS NULL;

-- ══════════════════════════════════════════════════════════════
-- 2. NOVO STATUS 'completed'
-- ══════════════════════════════════════════════════════════════

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_sub_card_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_sub_card_status_check
  CHECK (sub_card_status IS NULL OR sub_card_status IN ('active', 'merged', 'cancelled', 'completed'));

-- ══════════════════════════════════════════════════════════════
-- 3. CONFIG: ESTÁGIO INICIAL DE SUB-CARDS POR PIPELINE
-- ══════════════════════════════════════════════════════════════

ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS sub_card_default_stage_id UUID REFERENCES pipeline_stages(id);

-- ══════════════════════════════════════════════════════════════
-- 4. TRIGGER: AGREGAÇÃO AUTOMÁTICA NO PAI
--    SÓ agrega quando sub-card está em fase Pós-Venda
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION aggregate_sub_card_values()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phase_slug TEXT;
    v_parent_card_id UUID;
BEGIN
    -- Determinar o parent_card_id correto (NEW ou OLD para DELETE)
    v_parent_card_id := COALESCE(NEW.parent_card_id, OLD.parent_card_id);

    IF v_parent_card_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Verificar se o sub-card entrou em Pós-Venda
    IF NEW.pipeline_stage_id IS NOT NULL THEN
        SELECT pp.slug INTO v_phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.id = NEW.pipeline_stage_id;

        -- Marcar timestamp quando entra em Pós-Venda pela primeira vez
        IF v_phase_slug = 'pos_venda' AND NEW.sub_card_agregado_em IS NULL THEN
            UPDATE cards SET sub_card_agregado_em = NOW()
            WHERE id = NEW.id;
            -- Atualizar NEW para o trigger continuar com o valor correto
            NEW.sub_card_agregado_em := NOW();
        END IF;
    END IF;

    -- Recalcular valor_final do pai:
    -- valor_proprio + soma de sub-cards que JÁ entraram em Pós-Venda
    UPDATE cards SET
        valor_final = (
            COALESCE(valor_proprio, 0) + COALESCE((
                SELECT SUM(COALESCE(sc.valor_final, sc.valor_estimado, 0))
                FROM cards sc
                WHERE sc.parent_card_id = v_parent_card_id
                  AND sc.card_type = 'sub_card'
                  AND sc.sub_card_status IN ('active', 'completed')
                  AND sc.sub_card_agregado_em IS NOT NULL
            ), 0)
        ),
        updated_at = NOW()
    WHERE id = v_parent_card_id
      AND (card_type IS NULL OR card_type != 'sub_card');

    RETURN NEW;
END;
$$;

-- Drop trigger antigo se existir
DROP TRIGGER IF EXISTS trg_aggregate_sub_card_values ON cards;

CREATE TRIGGER trg_aggregate_sub_card_values
    AFTER INSERT OR UPDATE OF valor_final, valor_estimado, sub_card_status, pipeline_stage_id
    ON cards
    FOR EACH ROW
    WHEN (NEW.card_type = 'sub_card' AND NEW.parent_card_id IS NOT NULL)
    EXECUTE FUNCTION aggregate_sub_card_values();

-- ══════════════════════════════════════════════════════════════
-- 5. REESCREVER criar_sub_card
--    - Qualquer fase do pai (não só Pós-Venda)
--    - Múltiplos simultâneos (sem bloqueio)
--    - Sem merge_config
--    - Sem tarefa solicitacao_mudanca
--    - Modo sempre incremental
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental',
    p_merge_config JSONB DEFAULT NULL  -- mantido para backward compat, ignorado
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
    v_user_id UUID;
    v_sub_produto_data JSONB;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validar card pai
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- Sub-card de sub-card não permitido
    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    -- Group parent não permitido
    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar item adicional em card agrupador');
    END IF;

    -- Oportunidade futura não pode ser pai de sub-card
    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de uma oportunidade futura');
    END IF;

    -- REMOVIDO: check de fase Pós-Venda (agora qualquer fase)
    -- REMOVIDO: check de v_active_count > 0 (agora múltiplos simultâneos)

    -- 2. Determinar estágio inicial
    -- Prioridade: pipelines.sub_card_default_stage_id > "Proposta em Construção" > primeiro do Planner

    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        -- Fallback: buscar fase Planner
        SELECT id INTO v_planner_phase_id
        FROM pipeline_phases
        WHERE name = 'Planner'
        LIMIT 1;

        IF v_planner_phase_id IS NOT NULL THEN
            -- Tentar "Proposta em Construção"
            SELECT id INTO v_target_stage_id
            FROM pipeline_stages
            WHERE phase_id = v_planner_phase_id
              AND pipeline_id = v_parent.pipeline_id
              AND nome = 'Proposta em Construção'
            LIMIT 1;

            -- Fallback: primeiro estágio do Planner
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
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 3. Preparar produto_data (herdar do pai, limpar Monde e taxa)
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento';

    -- 4. Criar o sub-card (sempre incremental, valor_estimado = 0)
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, 0,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Log de criação
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'valor_estimado', 0),
        jsonb_build_object('target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created', 'Item da viagem criado: ' || p_titulo,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo),
        v_user_id, now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'parent_id', p_parent_id
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. DEPRECAR merge_sub_card
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION merge_sub_card(
    p_sub_card_id UUID,
    p_options JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'Merge depreciado. Sub-cards agora são itens permanentes da viagem. Valores agregam automaticamente quando o sub-card entra em Pós-Venda.'
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 7. ENRIQUECER get_sub_cards
--    Adiciona: progress_percent, phase_slug, financial data, agregado_em
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_sub_cards(p_parent_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'titulo', c.titulo,
            'sub_card_mode', c.sub_card_mode,
            'sub_card_status', c.sub_card_status,
            'valor_estimado', c.valor_estimado,
            'valor_final', c.valor_final,
            'status_comercial', c.status_comercial,
            'ganho_planner', COALESCE(c.ganho_planner, false),
            'is_planner_won', COALESCE(s.is_planner_won, false),
            'etapa_nome', s.nome,
            'fase', s.fase,
            'phase_slug', pp.slug,
            'merged_at', c.merged_at,
            'merge_metadata', c.merge_metadata,
            'merge_config', c.merge_config,
            'created_at', c.created_at,
            'data_fechamento', c.data_fechamento,
            'sub_card_agregado_em', c.sub_card_agregado_em,
            'dono_nome', prof.nome,
            -- Progresso: ordem do estágio / total de estágios no pipeline
            'progress_percent', CASE
                WHEN max_ordem.total > 0
                THEN ROUND((s.ordem::NUMERIC / max_ordem.total::NUMERIC) * 100)
                ELSE 0
            END,
            -- Itens financeiros
            'financial_items_count', COALESCE(fi.total, 0),
            'financial_items_ready', COALESCE(fi.ready, 0)
        ) ORDER BY
            CASE c.sub_card_status
                WHEN 'active' THEN 1
                WHEN 'completed' THEN 2
                WHEN 'merged' THEN 3
                ELSE 4
            END,
            c.created_at DESC
    ), '[]'::jsonb)
    INTO v_result
    FROM cards c
    LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipeline_phases pp ON s.phase_id = pp.id
    LEFT JOIN profiles prof ON c.dono_atual_id = prof.id
    -- Max ordem para calcular progresso
    LEFT JOIN LATERAL (
        SELECT MAX(ps2.ordem) AS total
        FROM pipeline_stages ps2
        WHERE ps2.pipeline_id = c.pipeline_id AND ps2.ativo = true
    ) max_ordem ON true
    -- Itens financeiros
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)::INT AS total,
            COUNT(*) FILTER (WHERE cfi.is_ready = true)::INT AS ready
        FROM card_financial_items cfi
        WHERE cfi.card_id = c.id
    ) fi ON true
    WHERE c.parent_card_id = p_parent_id
      AND c.card_type = 'sub_card'
      AND c.deleted_at IS NULL;

    RETURN v_result;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 8. ANALYTICS: Excluir sub-cards da CONTAGEM, incluir no VALOR
-- ══════════════════════════════════════════════════════════════

-- 8a. analytics_overview_kpis — excluir sub-cards de leads_pool e outcomes_pool
-- Adicionar filtro nas CTEs leads_pool e outcomes_pool
-- NOTA: Recriamos toda a função para adicionar o filtro consistentemente

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
          AND (c.card_type IS NULL OR c.card_type != 'sub_card')  -- NOVO: excluir sub-cards
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
          AND (c.card_type IS NULL OR c.card_type != 'sub_card')  -- NOVO: excluir sub-cards
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

-- 8b. analytics_financial_breakdown — contagem exclui sub-cards, valor inclui

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
        -- NOVO: contagem exclui sub-cards (só viagens)
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

-- 8c. view_dashboard_funil — excluir sub-cards da contagem

CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    s.id AS stage_id,
    s.nome AS stage_nome,
    s.fase,
    s.ordem,
    c.produto,
    -- NOVO: contagem exclui sub-cards
    COUNT(c.id) FILTER (WHERE c.card_type IS NULL OR c.card_type != 'sub_card') AS total_cards,
    COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0) AS valor_total,
    COALESCE(SUM(c.receita), 0) AS receita_total,
    -- NOVO: contagem separada de sub-cards
    COUNT(c.id) FILTER (WHERE c.card_type = 'sub_card') AS sub_card_count
FROM pipeline_stages s
LEFT JOIN cards c ON c.pipeline_stage_id = s.id
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
WHERE s.ativo = true
GROUP BY s.id, s.nome, s.fase, s.ordem, c.produto
ORDER BY s.ordem;

COMMIT;
