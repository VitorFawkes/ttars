-- ============================================================================
-- MIGRATION: Sub-Cards System for Change Requests
-- Description: Adds sub-card functionality for post-sales change requests
-- Date: 2026-02-01
-- Author: Claude (via Claude Code)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ADD NEW COLUMNS TO CARDS TABLE
-- ============================================================================

-- card_type: 'standard', 'group_child', 'sub_card'
-- (Note: 'group_child' already exists for group hierarchy)
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS card_type TEXT DEFAULT 'standard';

-- sub_card_mode: 'incremental' (adds value) or 'complete' (replaces value)
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS sub_card_mode TEXT;

-- sub_card_status: 'active', 'merged', 'cancelled'
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS sub_card_status TEXT;

-- Merge tracking
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS merged_by UUID REFERENCES profiles(id);

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS merge_metadata JSONB;

-- Add constraints
ALTER TABLE cards
ADD CONSTRAINT cards_card_type_check
CHECK (card_type IN ('standard', 'group_child', 'sub_card'));

ALTER TABLE cards
ADD CONSTRAINT cards_sub_card_mode_check
CHECK (sub_card_mode IS NULL OR sub_card_mode IN ('incremental', 'complete'));

ALTER TABLE cards
ADD CONSTRAINT cards_sub_card_status_check
CHECK (sub_card_status IS NULL OR sub_card_status IN ('active', 'merged', 'cancelled'));

-- Index for querying sub-cards
CREATE INDEX IF NOT EXISTS idx_cards_card_type ON cards(card_type) WHERE card_type = 'sub_card';
CREATE INDEX IF NOT EXISTS idx_cards_sub_card_status ON cards(sub_card_status) WHERE sub_card_status = 'active';

-- Migrate existing group children
UPDATE cards
SET card_type = 'group_child'
WHERE parent_card_id IS NOT NULL
  AND card_type = 'standard'
  AND is_group_parent = false;

-- ============================================================================
-- 2. CREATE SUB_CARD_SYNC_LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sub_card_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    parent_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'created', 'merged', 'cancelled', 'proposal_synced', 'value_synced'
    old_value JSONB,
    new_value JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

-- Enable RLS
ALTER TABLE sub_card_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sub_card_sync_log
CREATE POLICY "sub_card_sync_log_select_authenticated" ON sub_card_sync_log
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "sub_card_sync_log_insert_authenticated" ON sub_card_sync_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_sub_card_sync_log_sub_card_id ON sub_card_sync_log(sub_card_id);
CREATE INDEX IF NOT EXISTS idx_sub_card_sync_log_parent_card_id ON sub_card_sync_log(parent_card_id);

-- ============================================================================
-- 3. CREATE RPC: criar_sub_card
-- ============================================================================

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_planner_phase_id UUID;
    v_first_planner_stage_id UUID;
    v_new_card_id UUID;
    v_new_task_id UUID;
    v_user_id UUID;
    v_valor_estimado NUMERIC;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validate parent card exists and is in Pós-venda
    SELECT c.*, s.fase, s.phase_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    -- Check if parent is in Pós-venda phase
    IF v_parent.fase != 'Pós-venda' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai deve estar na fase Pós-venda');
    END IF;

    -- Prevent sub-card of sub-card
    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    -- Validate mode
    IF p_mode NOT IN ('incremental', 'complete') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Modo inválido. Use "incremental" ou "complete"');
    END IF;

    -- 2. Get first stage in Planner phase
    SELECT id INTO v_planner_phase_id
    FROM pipeline_phases
    WHERE name = 'Planner'
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fase Planner não encontrada');
    END IF;

    SELECT id INTO v_first_planner_stage_id
    FROM pipeline_stages
    WHERE phase_id = v_planner_phase_id
      AND pipeline_id = v_parent.pipeline_id
    ORDER BY ordem ASC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 3. Determine valor_estimado based on mode
    IF p_mode = 'incremental' THEN
        v_valor_estimado := 0;
    ELSE
        v_valor_estimado := COALESCE(v_parent.valor_estimado, 0);
    END IF;

    -- 4. Create the sub-card
    INSERT INTO cards (
        -- Identity
        titulo,
        card_type,
        sub_card_mode,
        sub_card_status,
        parent_card_id,

        -- Pipeline
        pipeline_id,
        pipeline_stage_id,
        stage_entered_at,

        -- From parent
        pessoa_principal_id,
        produto,
        produto_data,
        moeda,
        briefing_inicial,
        data_viagem_inicio,
        data_viagem_fim,

        -- Value (depends on mode)
        valor_estimado,

        -- Owners (inherit from parent)
        dono_atual_id,
        sdr_owner_id,
        vendas_owner_id,
        pos_owner_id,
        concierge_owner_id,

        -- Status
        status_comercial,

        -- Audit
        created_by,
        created_at,
        updated_at
    )
    VALUES (
        p_titulo,
        'sub_card',
        p_mode,
        'active',
        p_parent_id,

        v_parent.pipeline_id,
        v_first_planner_stage_id,
        now(),

        v_parent.pessoa_principal_id,
        v_parent.produto,
        CASE
            WHEN p_mode = 'complete' THEN v_parent.produto_data
            ELSE v_parent.produto_data - 'taxa_planejamento' -- Remove taxa info for incremental
        END,
        v_parent.moeda,
        v_parent.briefing_inicial,
        v_parent.data_viagem_inicio,
        v_parent.data_viagem_fim,

        v_valor_estimado,

        -- Set vendas_owner as current owner (Planner phase)
        COALESCE(v_parent.vendas_owner_id, v_user_id),
        v_parent.sdr_owner_id,
        v_parent.vendas_owner_id,
        v_parent.pos_owner_id,
        v_parent.concierge_owner_id,

        'aberto',

        v_user_id,
        now(),
        now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Create change request task on PARENT card
    INSERT INTO tarefas (
        card_id,
        tipo,
        titulo,
        descricao,
        responsavel_id,
        data_vencimento,
        prioridade,
        metadata,
        created_by,
        created_at
    )
    VALUES (
        p_parent_id, -- Task on parent card
        'solicitacao_mudanca',
        'Alteração: ' || p_titulo,
        p_descricao,
        COALESCE(v_parent.vendas_owner_id, v_user_id), -- Planner is responsible
        now() + interval '7 days', -- Default 7 days deadline
        'alta',
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_mode', p_mode
        ),
        v_user_id,
        now()
    )
    RETURNING id INTO v_new_task_id;

    -- 6. Log the creation
    INSERT INTO sub_card_sync_log (
        sub_card_id,
        parent_card_id,
        action,
        new_value,
        metadata,
        created_by
    )
    VALUES (
        v_new_card_id,
        p_parent_id,
        'created',
        jsonb_build_object(
            'titulo', p_titulo,
            'mode', p_mode,
            'valor_estimado', v_valor_estimado
        ),
        jsonb_build_object(
            'task_id', v_new_task_id,
            'parent_fase', v_parent.fase,
            'planner_stage_id', v_first_planner_stage_id
        ),
        v_user_id
    );

    -- 7. Log activity on parent
    INSERT INTO atividades (
        card_id,
        tipo,
        descricao,
        dados,
        created_by,
        created_at
    )
    VALUES (
        p_parent_id,
        'sub_card_created',
        'Card de alteração criado: ' || p_titulo,
        jsonb_build_object(
            'sub_card_id', v_new_card_id,
            'sub_card_titulo', p_titulo,
            'mode', p_mode
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'task_id', v_new_task_id,
        'mode', p_mode,
        'parent_id', p_parent_id
    );
END;
$$;

-- ============================================================================
-- 4. CREATE RPC: merge_sub_card
-- ============================================================================

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
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation
    SELECT c.*, s.is_won
    INTO v_sub_card
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_sub_card_id
      AND c.card_type = 'sub_card'
      AND c.sub_card_status = 'active'
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado ou não está ativo');
    END IF;

    -- Check if sub-card is in "won" stage
    IF NOT COALESCE(v_sub_card.is_won, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card deve estar em uma etapa "Ganho" para fazer merge');
    END IF;

    -- 2. Get parent card
    SELECT * INTO v_parent
    FROM cards
    WHERE id = v_sub_card.parent_card_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card pai não encontrado');
    END IF;

    -- 3. Calculate new value based on mode
    v_old_parent_value := COALESCE(v_parent.valor_final, v_parent.valor_estimado, 0);
    v_sub_card_value := COALESCE(v_sub_card.valor_final, v_sub_card.valor_estimado, 0);

    IF v_sub_card.sub_card_mode = 'incremental' THEN
        -- SOMA: Add sub-card value to parent
        v_new_parent_value := v_old_parent_value + v_sub_card_value;
    ELSE
        -- SUBSTITUI: Replace parent value with sub-card value
        v_new_parent_value := v_sub_card_value;
    END IF;

    -- 4. Update parent card value
    UPDATE cards
    SET
        valor_final = v_new_parent_value,
        updated_at = now()
    WHERE id = v_parent.id;

    -- 5. Mark sub-card as merged
    UPDATE cards
    SET
        sub_card_status = 'merged',
        merged_at = now(),
        merged_by = v_user_id,
        merge_metadata = jsonb_build_object(
            'old_parent_value', v_old_parent_value,
            'sub_card_value', v_sub_card_value,
            'new_parent_value', v_new_parent_value,
            'mode', v_sub_card.sub_card_mode
        ),
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- 6. Mark the change request task as completed
    UPDATE tarefas
    SET
        concluida = true,
        concluida_em = now(),
        concluido_por = v_user_id,
        outcome = 'concluido',
        updated_at = now()
    WHERE card_id = v_parent.id
      AND tipo = 'solicitacao_mudanca'
      AND metadata->>'sub_card_id' = p_sub_card_id::text
      AND COALESCE(concluida, false) = false;

    -- 7. Get accepted proposal from sub-card (if any) for reference
    SELECT id INTO v_proposal_id
    FROM proposals
    WHERE card_id = p_sub_card_id
      AND status = 'accepted'
    ORDER BY updated_at DESC
    LIMIT 1;

    -- 8. Log the merge
    INSERT INTO sub_card_sync_log (
        sub_card_id,
        parent_card_id,
        action,
        old_value,
        new_value,
        metadata,
        created_by
    )
    VALUES (
        p_sub_card_id,
        v_parent.id,
        'merged',
        jsonb_build_object('valor', v_old_parent_value),
        jsonb_build_object('valor', v_new_parent_value),
        jsonb_build_object(
            'mode', v_sub_card.sub_card_mode,
            'sub_card_value', v_sub_card_value,
            'proposal_id', v_proposal_id
        ),
        v_user_id
    );

    -- 9. Log activity on parent
    INSERT INTO atividades (
        card_id,
        tipo,
        descricao,
        dados,
        created_by,
        created_at
    )
    VALUES (
        v_parent.id,
        'sub_card_merged',
        CASE v_sub_card.sub_card_mode
            WHEN 'incremental' THEN 'Alteração concluída: +' || v_sub_card_value || ' (total: ' || v_new_parent_value || ')'
            ELSE 'Proposta refeita: novo valor ' || v_new_parent_value
        END,
        jsonb_build_object(
            'sub_card_id', p_sub_card_id,
            'sub_card_titulo', v_sub_card.titulo,
            'mode', v_sub_card.sub_card_mode,
            'old_value', v_old_parent_value,
            'new_value', v_new_parent_value,
            'proposal_id', v_proposal_id
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'parent_id', v_parent.id,
        'old_value', v_old_parent_value,
        'new_value', v_new_parent_value,
        'mode', v_sub_card.sub_card_mode,
        'proposal_id', v_proposal_id
    );
END;
$$;

-- ============================================================================
-- 5. CREATE RPC: cancelar_sub_card
-- ============================================================================

CREATE OR REPLACE FUNCTION cancelar_sub_card(
    p_sub_card_id UUID,
    p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_card RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation
    SELECT * INTO v_sub_card
    FROM cards
    WHERE id = p_sub_card_id
      AND card_type = 'sub_card'
      AND sub_card_status = 'active'
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sub-card não encontrado ou não está ativo');
    END IF;

    -- 2. Mark sub-card as cancelled
    UPDATE cards
    SET
        sub_card_status = 'cancelled',
        status_comercial = 'perdido',
        merge_metadata = jsonb_build_object(
            'cancelled_reason', p_motivo,
            'cancelled_at', now()
        ),
        updated_at = now()
    WHERE id = p_sub_card_id;

    -- 3. Cancel the change request task
    UPDATE tarefas
    SET
        concluida = true,
        concluida_em = now(),
        concluido_por = v_user_id,
        outcome = 'cancelado',
        motivo_cancelamento = p_motivo,
        updated_at = now()
    WHERE card_id = v_sub_card.parent_card_id
      AND tipo = 'solicitacao_mudanca'
      AND metadata->>'sub_card_id' = p_sub_card_id::text
      AND COALESCE(concluida, false) = false;

    -- 4. Log the cancellation
    INSERT INTO sub_card_sync_log (
        sub_card_id,
        parent_card_id,
        action,
        metadata,
        created_by
    )
    VALUES (
        p_sub_card_id,
        v_sub_card.parent_card_id,
        'cancelled',
        jsonb_build_object('reason', p_motivo),
        v_user_id
    );

    -- 5. Log activity on parent
    INSERT INTO atividades (
        card_id,
        tipo,
        descricao,
        dados,
        created_by,
        created_at
    )
    VALUES (
        v_sub_card.parent_card_id,
        'sub_card_cancelled',
        'Alteração cancelada: ' || v_sub_card.titulo || COALESCE(' - ' || p_motivo, ''),
        jsonb_build_object(
            'sub_card_id', p_sub_card_id,
            'sub_card_titulo', v_sub_card.titulo,
            'reason', p_motivo
        ),
        v_user_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', p_sub_card_id,
        'parent_id', v_sub_card.parent_card_id
    );
END;
$$;

-- ============================================================================
-- 6. CREATE RPC: get_sub_cards
-- ============================================================================

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
            'etapa_nome', s.nome,
            'fase', s.fase,
            'merged_at', c.merged_at,
            'merge_metadata', c.merge_metadata,
            'created_at', c.created_at,
            'dono_nome', p.nome
        ) ORDER BY
            CASE c.sub_card_status
                WHEN 'active' THEN 1
                WHEN 'merged' THEN 2
                ELSE 3
            END,
            c.created_at DESC
    ), '[]'::jsonb)
    INTO v_result
    FROM cards c
    LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN profiles p ON c.dono_atual_id = p.id
    WHERE c.parent_card_id = p_parent_id
      AND c.card_type = 'sub_card'
      AND c.deleted_at IS NULL;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 7. TRIGGER: Auto-cancel sub-cards when parent is lost
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_sub_cards_on_parent_lost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If parent card is being marked as lost
    IF NEW.status_comercial = 'perdido' AND OLD.status_comercial != 'perdido' THEN
        -- Cancel all active sub-cards
        UPDATE cards
        SET
            sub_card_status = 'cancelled',
            status_comercial = 'perdido',
            merge_metadata = jsonb_build_object(
                'cancelled_reason', 'Card pai perdido',
                'cancelled_at', now(),
                'auto_cancelled', true
            ),
            updated_at = now()
        WHERE parent_card_id = NEW.id
          AND card_type = 'sub_card'
          AND sub_card_status = 'active';

        -- Cancel related tasks
        UPDATE tarefas
        SET
            concluida = true,
            concluida_em = now(),
            outcome = 'cancelado',
            motivo_cancelamento = 'Card pai perdido',
            updated_at = now()
        WHERE card_id = NEW.id
          AND tipo = 'solicitacao_mudanca'
          AND COALESCE(concluida, false) = false;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_cancel_sub_cards ON cards;
CREATE TRIGGER trg_auto_cancel_sub_cards
    AFTER UPDATE OF status_comercial ON cards
    FOR EACH ROW
    WHEN (NEW.card_type != 'sub_card')
    EXECUTE FUNCTION auto_cancel_sub_cards_on_parent_lost();

-- ============================================================================
-- 8. UPDATE VIEW: view_cards_acoes with sub-card fields
-- ============================================================================

-- Drop dependent views first
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- Recreate view with sub-card columns
CREATE OR REPLACE VIEW view_cards_acoes AS
SELECT
    c.id,
    c.titulo,
    c.produto,
    c.pipeline_id,
    c.pipeline_stage_id,
    c.pessoa_principal_id,
    c.valor_estimado,
    c.dono_atual_id,
    c.sdr_owner_id,
    c.vendas_owner_id,
    c.pos_owner_id,
    c.concierge_owner_id,
    c.status_comercial,
    c.produto_data,
    c.cliente_recorrente,
    c.prioridade,
    c.data_viagem_inicio,
    c.created_at,
    c.updated_at,
    c.data_fechamento,
    c.briefing_inicial,
    c.marketing_data,

    -- GROUP COLUMNS (existing)
    c.parent_card_id,
    c.is_group_parent,

    -- SUB-CARD COLUMNS (new)
    c.card_type,
    c.sub_card_mode,
    c.sub_card_status,

    -- Parent card title for sub-cards
    parent.titulo AS parent_card_title,

    -- Count of active sub-cards for parent cards
    (SELECT COUNT(*)
     FROM cards sc
     WHERE sc.parent_card_id = c.id
       AND sc.card_type = 'sub_card'
       AND sc.sub_card_status = 'active'
       AND sc.deleted_at IS NULL
    ) AS active_sub_cards_count,

    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,

    -- CONTACT FIELDS
    pe.nome AS pessoa_nome,
    pe.telefone AS pessoa_telefone,
    pe.email AS pessoa_email,

    -- OWNER FIELDS
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,

    -- PROXIMA_TAREFA: Exclude 'reagendada' status
    (SELECT row_to_json(t.*) FROM (
        SELECT
            id,
            titulo,
            data_vencimento,
            prioridade,
            tipo
        FROM tarefas
        WHERE
            card_id = c.id
            AND COALESCE(tarefas.concluida, false) = false
            AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
        ORDER BY
            data_vencimento ASC NULLS LAST,
            created_at DESC,
            id DESC
        LIMIT 1
    ) t) AS proxima_tarefa,

    -- TAREFAS_PENDENTES: Exclude 'reagendada'
    (SELECT count(*)
     FROM tarefas
     WHERE card_id = c.id
       AND COALESCE(tarefas.concluida, false) = false
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
    ) AS tarefas_pendentes,

    -- TAREFAS_ATRASADAS: Exclude 'reagendada'
    (SELECT count(*)
     FROM tarefas
     WHERE card_id = c.id
       AND COALESCE(tarefas.concluida, false) = false
       AND data_vencimento < CURRENT_DATE
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
    ) AS tarefas_atrasadas,

    -- ULTIMA_INTERACAO
    (SELECT row_to_json(t.*) FROM (
        SELECT
            id,
            titulo,
            concluida_em AS data,
            tipo
        FROM tarefas
        WHERE card_id = c.id
          AND tarefas.concluida = true
        ORDER BY concluida_em DESC
        LIMIT 1
    ) t) AS ultima_interacao,

    -- Additional calculated fields
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento' AS status_taxa,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL
        THEN EXTRACT(day FROM c.data_viagem_inicio - now())
        ELSE NULL
    END AS dias_ate_viagem,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL
         AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30
        THEN 100
        ELSE 0
    END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
    CASE
        WHEN s.sla_hours IS NOT NULL
         AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600) > s.sla_hours
        THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id
LEFT JOIN cards parent ON c.parent_card_id = parent.id
WHERE c.deleted_at IS NULL
  -- Exclude merged/cancelled sub-cards from view
  AND (c.card_type != 'sub_card' OR c.sub_card_status = 'active');

-- Recreate view_dashboard_funil
CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    etapa_nome,
    etapa_ordem,
    produto,
    count(*) as total_cards,
    sum(valor_estimado) as total_valor_estimado,
    sum(valor_final) as total_valor_final
FROM view_cards_acoes
WHERE card_type != 'sub_card' OR sub_card_status = 'active'
GROUP BY etapa_nome, etapa_ordem, produto;

-- Re-apply security settings
ALTER VIEW public.view_cards_acoes SET (security_invoker = true);
ALTER VIEW public.view_dashboard_funil SET (security_invoker = true);

-- Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;
GRANT SELECT ON sub_card_sync_log TO authenticated;
GRANT INSERT ON sub_card_sync_log TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================================================
--
-- -- Check new columns exist
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'cards'
--   AND column_name IN ('card_type', 'sub_card_mode', 'sub_card_status', 'merged_at', 'merged_by', 'merge_metadata');
--
-- -- Check sub_card_sync_log table
-- SELECT * FROM sub_card_sync_log LIMIT 5;
--
-- -- Check view has new columns
-- SELECT card_type, sub_card_mode, sub_card_status, parent_card_title, active_sub_cards_count
-- FROM view_cards_acoes
-- LIMIT 5;
--
-- -- Test criar_sub_card function (replace with valid parent_id)
-- SELECT criar_sub_card(
--     'your-parent-card-id'::uuid,
--     'Teste Sub-Card',
--     'Descrição do teste',
--     'incremental'
-- );
