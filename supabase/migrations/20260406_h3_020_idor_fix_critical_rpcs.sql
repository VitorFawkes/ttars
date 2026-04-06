-- H3-020: Fix IDOR (Insecure Direct Object Reference) nas RPCs mais críticas
-- Problema: funções SECURITY DEFINER que operam em cards sem verificar org_id
-- do usuário atual. Um usuário de Org A poderia (teoricamente) chamar essas
-- funções com IDs de Org B e ter seus dados modificados.
--
-- Funções corrigidas:
--   - mover_card: adiciona AND org_id = requesting_org_id() ao UPDATE
--   - get_sub_cards: adiciona AND c.org_id = requesting_org_id() ao SELECT
--   - cancelar_sub_card: adiciona AND org_id = requesting_org_id() ao SELECT e UPDATE

-- =============================================================================
-- mover_card — proteção IDOR
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mover_card(
    p_card_id uuid,
    p_nova_etapa_id uuid,
    p_motivo_perda_id uuid DEFAULT NULL::uuid,
    p_motivo_perda_comentario text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_valid boolean;
    v_updated integer;
BEGIN
    v_valid := public.validate_transition(p_card_id, p_nova_etapa_id);
    IF v_valid IS FALSE THEN
        RAISE EXCEPTION 'Transição de etapa não permitida pelas regras de governança.';
    END IF;

    UPDATE cards
    SET
        pipeline_stage_id = p_nova_etapa_id,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = now()
    WHERE id = p_card_id
      AND org_id = requesting_org_id();  -- IDOR fix: garante que o card pertence à org do usuário

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'Card não encontrado ou não pertence à sua organização.';
    END IF;
END;
$$;

-- =============================================================================
-- get_sub_cards — proteção IDOR
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_sub_cards(p_parent_id uuid)
RETURNS jsonb
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
            'sub_card_category', COALESCE(c.sub_card_category, 'addition'),
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
            'progress_percent', CASE
                WHEN max_ordem.total > 0
                THEN ROUND((s.ordem::NUMERIC / max_ordem.total::NUMERIC) * 100)
                ELSE 0
            END,
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
    LEFT JOIN LATERAL (
        SELECT MAX(ps2.ordem) AS total
        FROM pipeline_stages ps2
        WHERE ps2.pipeline_id = c.pipeline_id AND ps2.ativo = true
    ) max_ordem ON true
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)::INT AS total,
            COUNT(*) FILTER (WHERE cfi.is_ready = true)::INT AS ready
        FROM card_financial_items cfi
        WHERE cfi.card_id = c.id
    ) fi ON true
    WHERE c.parent_card_id = p_parent_id
      AND c.card_type = 'sub_card'
      AND c.deleted_at IS NULL
      AND c.org_id = requesting_org_id();  -- IDOR fix: garante que sub-cards são da org do usuário

    RETURN v_result;
END;
$$;

-- =============================================================================
-- cancelar_sub_card — proteção IDOR
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancelar_sub_card(
    p_sub_card_id uuid,
    p_motivo text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_card RECORD;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get sub-card with validation (inclui org check — IDOR fix)
    SELECT * INTO v_sub_card
    FROM cards
    WHERE id = p_sub_card_id
      AND card_type = 'sub_card'
      AND sub_card_status = 'active'
      AND deleted_at IS NULL
      AND org_id = requesting_org_id();  -- IDOR fix: garante que o sub-card é da org do usuário

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
    WHERE id = p_sub_card_id
      AND org_id = requesting_org_id();  -- IDOR fix: double-check na escrita

    -- 3. Cancel the change request task (NO updated_at — column doesn't exist on tarefas)
    UPDATE tarefas
    SET
        concluida = true,
        concluida_em = now(),
        concluido_por = v_user_id,
        outcome = 'cancelado',
        motivo_cancelamento = p_motivo
    WHERE card_id = v_sub_card.parent_card_id
      AND tipo = 'solicitacao_mudanca'
      AND metadata->>'sub_card_id' = p_sub_card_id::text
      AND COALESCE(concluida, false) = false;

    -- 4. Log the cancellation
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, metadata, created_by)
    VALUES (
        p_sub_card_id,
        v_sub_card.parent_card_id,
        'cancelled',
        jsonb_build_object('reason', p_motivo),
        v_user_id
    );

    -- 5. Log activity on parent
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
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
