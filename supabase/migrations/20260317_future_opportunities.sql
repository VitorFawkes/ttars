-- ============================================================================
-- Migration: Future Opportunities System
-- Date: 2026-03-17
--
-- Dois cenários:
-- 1. Card perdido com "Oportunidade Futura" → agendar criação de card novo
-- 2. Card em Planner/Pós-Venda → agendar sub-card futuro
--
-- Criações:
-- A) Tabela future_opportunities
-- B) Estender cards.card_type para incluir 'future_opportunity'
-- C) RPC criar_sub_card_futuro (variante sem restrição de fase)
-- D) RPC criar_card_oportunidade_futura (para lost_future)
-- E) pg_cron diário às 8h (process-future-opportunities)
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. TABELA future_opportunities
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS future_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Card de origem (perdido ou ganho)
    source_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('lost_future', 'won_upsell')),

    -- Agendamento
    scheduled_date DATE NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,

    -- Config para won_upsell (sub-card)
    sub_card_mode TEXT DEFAULT 'incremental' CHECK (sub_card_mode IN ('incremental', 'complete', NULL)),

    -- Tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled')),
    created_card_id UUID REFERENCES cards(id),
    executed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    -- Desnormalizado do card-fonte (para o processador não precisar de JOINs)
    produto TEXT,
    pipeline_id UUID REFERENCES pipelines(id),
    responsavel_id UUID REFERENCES profiles(id),
    pessoa_principal_id UUID,  -- FK lógica para contatos (desnormalizado)

    -- Audit
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index parcial para o cron ser rápido
CREATE INDEX IF NOT EXISTS idx_future_opp_pending
    ON future_opportunities(scheduled_date)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_future_opp_source
    ON future_opportunities(source_card_id);

COMMENT ON TABLE future_opportunities IS 'Agendamento de oportunidades futuras — cria cards/sub-cards automaticamente na data programada';

-- ══════════════════════════════════════════════════════════════
-- 2. RLS
-- ══════════════════════════════════════════════════════════════

ALTER TABLE future_opportunities ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado pode ver
CREATE POLICY "future_opp_select" ON future_opportunities
    FOR SELECT USING (auth.role() = 'authenticated');

-- Inserção: qualquer autenticado
CREATE POLICY "future_opp_insert" ON future_opportunities
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Update: qualquer autenticado (para cancelar)
CREATE POLICY "future_opp_update" ON future_opportunities
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Service role: full access (para o Edge Function/cron)
CREATE POLICY "future_opp_service" ON future_opportunities
    FOR ALL USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════
-- 3. ESTENDER cards.card_type
-- ══════════════════════════════════════════════════════════════

-- Dropar constraint existente e recriar com novo valor
DO $$
BEGIN
    -- Tentar dropar constraints que possam existir
    BEGIN
        ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_card_type_check;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_card_type;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Recriar com novo valor
    ALTER TABLE cards ADD CONSTRAINT cards_card_type_check
        CHECK (card_type IN ('standard', 'group_child', 'sub_card', 'future_opportunity'));
END $$;

-- ══════════════════════════════════════════════════════════════
-- 4. RPC: criar_card_oportunidade_futura (Caso 1 — lost → new card)
-- ══════════════════════════════════════════════════════════════
-- Chamada pelo Edge Function quando source_type = 'lost_future'
-- Cria card independente (NÃO faz merge) em "Proposta em Construção"

CREATE OR REPLACE FUNCTION criar_card_oportunidade_futura(
    p_future_opp_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opp RECORD;
    v_source RECORD;
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
BEGIN
    -- 1. Buscar oportunidade futura
    SELECT * INTO v_opp
    FROM future_opportunities
    WHERE id = p_future_opp_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Oportunidade não encontrada ou já processada');
    END IF;

    -- 2. Buscar card de origem
    SELECT * INTO v_source
    FROM cards
    WHERE id = v_opp.source_card_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card de origem não encontrado');
    END IF;

    -- 3. Resolver stage "Proposta em Construção" no pipeline correto
    SELECT pp.id INTO v_planner_phase_id
    FROM pipeline_phases pp
    WHERE pp.name = 'Planner'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase Planner não encontrada');
    END IF;

    SELECT s.id INTO v_target_stage_id
    FROM pipeline_stages s
    WHERE s.phase_id = v_planner_phase_id
      AND s.pipeline_id = COALESCE(v_opp.pipeline_id, v_source.pipeline_id)
      AND s.nome = 'Proposta em Construção'
    LIMIT 1;

    IF v_target_stage_id IS NULL THEN
        -- Fallback: primeira etapa do Planner
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_planner_phase_id
          AND s.pipeline_id = COALESCE(v_opp.pipeline_id, v_source.pipeline_id)
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa Planner encontrada');
    END IF;

    -- 4. Criar o card (independente — NÃO é sub-card, NÃO faz merge)
    INSERT INTO cards (
        titulo, card_type, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, moeda,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_at, updated_at
    )
    VALUES (
        v_opp.titulo,
        'future_opportunity',
        v_opp.source_card_id,  -- link ao card perdido original
        COALESCE(v_opp.pipeline_id, v_source.pipeline_id),
        v_target_stage_id,
        now(),
        COALESCE(v_opp.pessoa_principal_id, v_source.pessoa_principal_id),
        COALESCE(v_opp.produto::app_product, v_source.produto),
        v_source.moeda,
        COALESCE(v_opp.responsavel_id, v_source.dono_atual_id),
        v_source.sdr_owner_id,
        v_source.vendas_owner_id,
        v_source.pos_owner_id,
        v_source.concierge_owner_id,
        'aberto',
        now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Criar tarefa de follow-up no card novo
    INSERT INTO tarefas (
        card_id, tipo, titulo, descricao,
        responsavel_id, data_vencimento, prioridade,
        metadata, created_at
    )
    VALUES (
        v_new_card_id,
        'contato',
        'Retomar: ' || v_opp.titulo,
        COALESCE(v_opp.descricao, '') || E'\n\nOriginado de oportunidade futura do card: ' || v_source.titulo,
        COALESCE(v_opp.responsavel_id, v_source.dono_atual_id),
        now(),
        'alta',
        jsonb_build_object(
            'future_opportunity_id', v_opp.id,
            'source_card_id', v_opp.source_card_id,
            'source_card_titulo', v_source.titulo
        ),
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 6. Activity no card de origem
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_opp.source_card_id,
        'future_opportunity_executed',
        'Oportunidade futura reaberta: ' || v_opp.titulo,
        jsonb_build_object(
            'new_card_id', v_new_card_id,
            'future_opportunity_id', v_opp.id,
            'scheduled_date', v_opp.scheduled_date
        ),
        now()
    );

    -- 7. Activity no card novo
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_new_card_id,
        'future_opportunity_created',
        'Card criado automaticamente de oportunidade futura',
        jsonb_build_object(
            'source_card_id', v_opp.source_card_id,
            'source_card_titulo', v_source.titulo,
            'future_opportunity_id', v_opp.id
        ),
        now()
    );

    -- 8. Marcar oportunidade como executada
    UPDATE future_opportunities
    SET status = 'executed',
        created_card_id = v_new_card_id,
        executed_at = now()
    WHERE id = p_future_opp_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'source_card_id', v_opp.source_card_id
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. RPC: criar_sub_card_futuro (Caso 2 — Planner/Pós-Venda → sub-card)
-- ══════════════════════════════════════════════════════════════
-- Variante de criar_sub_card que:
-- - Aceita cards em qualquer fase (Planner ou Pós-Venda), não só Pós-Venda
-- - Usada pelo Edge Function quando source_type = 'won_upsell'

CREATE OR REPLACE FUNCTION criar_sub_card_futuro(
    p_future_opp_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opp RECORD;
    v_parent RECORD;
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
    v_valor_estimado NUMERIC;
    v_merge_config JSONB;
BEGIN
    -- 1. Buscar oportunidade futura
    SELECT * INTO v_opp
    FROM future_opportunities
    WHERE id = p_future_opp_id
      AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Oportunidade não encontrada ou já processada');
    END IF;

    -- 2. Buscar card pai
    SELECT c.*, s.fase
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = v_opp.source_card_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- SEM validação de fase — aceita Planner, Pós-Venda, stages won

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    -- 3. Resolver merge_config
    IF COALESCE(v_opp.sub_card_mode, 'incremental') = 'incremental' THEN
        v_merge_config := '{"texto":{"copiar_pai":false,"merge_mode":"append"},"viagem":{"copiar_pai":false,"merge_mode":"append"}}'::jsonb;
        v_valor_estimado := 0;
    ELSE
        v_merge_config := '{"texto":{"copiar_pai":true,"merge_mode":"replace"},"viagem":{"copiar_pai":true,"merge_mode":"replace"}}'::jsonb;
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 4. Resolver stage "Proposta em Construção"
    SELECT pp.id INTO v_planner_phase_id
    FROM pipeline_phases pp
    WHERE pp.name = 'Planner'
    LIMIT 1;

    SELECT s.id INTO v_target_stage_id
    FROM pipeline_stages s
    WHERE s.phase_id = v_planner_phase_id
      AND s.pipeline_id = v_parent.pipeline_id
      AND s.nome = 'Proposta em Construção'
    LIMIT 1;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_planner_phase_id
          AND s.pipeline_id = v_parent.pipeline_id
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa Planner encontrada');
    END IF;

    -- 5. Criar sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id, merge_config,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, moeda,
        valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_at, updated_at
    )
    VALUES (
        v_opp.titulo,
        'sub_card',
        COALESCE(v_opp.sub_card_mode, 'incremental'),
        'active',
        v_opp.source_card_id,
        v_merge_config,
        v_parent.pipeline_id,
        v_target_stage_id,
        now(),
        v_parent.pessoa_principal_id,
        v_parent.produto,
        v_parent.moeda,
        v_valor_estimado,
        COALESCE(v_opp.responsavel_id, v_parent.vendas_owner_id, v_parent.dono_atual_id),
        v_parent.sdr_owner_id,
        v_parent.vendas_owner_id,
        v_parent.pos_owner_id,
        v_parent.concierge_owner_id,
        'aberto',
        now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 6. Tarefa no card pai
    INSERT INTO tarefas (
        card_id, tipo, titulo, descricao,
        responsavel_id, data_vencimento, prioridade,
        metadata, created_at
    )
    VALUES (
        v_opp.source_card_id,
        'solicitacao_mudanca',
        'Alteração agendada: ' || v_opp.titulo,
        COALESCE(v_opp.descricao, 'Sub-card criado automaticamente por oportunidade futura'),
        COALESCE(v_opp.responsavel_id, v_parent.vendas_owner_id, v_parent.dono_atual_id),
        now() + interval '7 days',
        'alta',
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_mode', COALESCE(v_opp.sub_card_mode, 'incremental'),
            'merge_config', v_merge_config,
            'future_opportunity_id', v_opp.id
        ),
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 7. Log sync
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata)
    VALUES (
        v_new_card_id, v_opp.source_card_id, 'created',
        jsonb_build_object('titulo', v_opp.titulo, 'mode', COALESCE(v_opp.sub_card_mode, 'incremental'), 'valor_estimado', v_valor_estimado),
        jsonb_build_object('target_stage_id', v_target_stage_id, 'future_opportunity_id', v_opp.id, 'source', 'future_opportunity')
    );

    -- 8. Activity no card pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_at)
    VALUES (
        v_opp.source_card_id,
        'sub_card_created',
        'Sub-card futuro criado automaticamente: ' || v_opp.titulo,
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_titulo', v_opp.titulo,
            'mode', COALESCE(v_opp.sub_card_mode, 'incremental'),
            'future_opportunity_id', v_opp.id,
            'source', 'future_opportunity'
        ),
        now()
    );

    -- 9. Marcar oportunidade como executada
    UPDATE future_opportunities
    SET status = 'executed',
        created_card_id = v_new_card_id,
        executed_at = now()
    WHERE id = p_future_opp_id;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'parent_id', v_opp.source_card_id,
        'mode', COALESCE(v_opp.sub_card_mode, 'incremental')
    );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 6. pg_cron — diário às 8h (horário de São Paulo = 11h UTC)
-- ══════════════════════════════════════════════════════════════

SELECT cron.schedule(
    'process-future-opportunities',
    '0 11 * * *',
    $$
    SELECT net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/future-opportunity-processor',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'service_role_key'
                LIMIT 1
            )
        ),
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

COMMIT;
