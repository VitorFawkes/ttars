-- ============================================================================
-- MIGRATION: Remover ganho/perdido da fase Pós-Venda
-- Date: 2026-03-24
--
-- Pós-Venda é fase de execução/entrega. A decisão comercial (ganho/perdido)
-- já foi tomada no Planner. Não faz sentido ter ganho/perdido em Pós-Venda.
--
-- Mudanças:
--   1. marcar_ganho: remove branch pos_venda/resolucao (lança exceção se chamado)
--   2. marcar_perdido: bloqueia cards em pos_venda/resolucao
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Reescrever marcar_ganho SEM branch Pós-Venda
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_ganho(
    p_card_id UUID,
    p_novo_dono_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_phase_slug TEXT;
    v_phase_order INT;
    v_next_phase RECORD;
    v_first_stage_id UUID;
    v_result JSONB;
BEGIN
    -- Buscar card com dados da etapa e fase atual
    SELECT
        c.id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.dono_atual_id,
        c.sdr_owner_id,
        c.vendas_owner_id,
        c.pos_owner_id,
        c.ganho_sdr,
        c.ganho_planner,
        c.ganho_pos,
        s.pipeline_id,
        pp.slug AS phase_slug,
        pp.order_index AS phase_order
    INTO v_card
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF v_card IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    IF v_card.status_comercial IN ('ganho', 'perdido') THEN
        RAISE EXCEPTION 'Card já está com status %', v_card.status_comercial;
    END IF;

    v_phase_slug := v_card.phase_slug;

    -- ─── GANHO SDR: Avança para primeira etapa de Planner ───
    IF v_phase_slug = 'sdr' THEN
        SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
        FROM pipeline_phases pp
        JOIN pipeline_stages s2 ON s2.phase_id = pp.id
        WHERE s2.pipeline_id = v_card.pipeline_id
          AND pp.slug = 'planner'
        LIMIT 1;

        IF v_next_phase IS NULL THEN
            RAISE EXCEPTION 'Fase planner não encontrada para o pipeline do card';
        END IF;

        SELECT s.id INTO v_first_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_next_phase.id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;

        IF v_first_stage_id IS NULL THEN
            RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase planner';
        END IF;

        UPDATE cards SET
            ganho_sdr = true,
            ganho_sdr_at = COALESCE(ganho_sdr_at, NOW()),
            dono_atual_id = COALESCE(p_novo_dono_id, vendas_owner_id, dono_atual_id),
            pipeline_stage_id = v_first_stage_id,
            stage_entered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_section',
            'phase', v_phase_slug,
            'milestone', 'ganho_sdr',
            'moved_to_stage', v_first_stage_id,
            'moved_to_phase', 'planner'
        );

    -- ─── GANHO PLANNER: Avança para primeira etapa de Pós-venda ───
    ELSIF v_phase_slug = 'planner' THEN
        SELECT DISTINCT pp.id, pp.slug INTO v_next_phase
        FROM pipeline_phases pp
        JOIN pipeline_stages s2 ON s2.phase_id = pp.id
        WHERE s2.pipeline_id = v_card.pipeline_id
          AND pp.slug = 'pos_venda'
        LIMIT 1;

        IF v_next_phase IS NULL THEN
            RAISE EXCEPTION 'Fase pos_venda não encontrada para o pipeline do card';
        END IF;

        SELECT s.id INTO v_first_stage_id
        FROM pipeline_stages s
        WHERE s.phase_id = v_next_phase.id
          AND s.ativo = true
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
        ORDER BY s.ordem ASC
        LIMIT 1;

        IF v_first_stage_id IS NULL THEN
            RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda';
        END IF;

        UPDATE cards SET
            ganho_planner = true,
            ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
            dono_atual_id = COALESCE(p_novo_dono_id, pos_owner_id, dono_atual_id),
            pipeline_stage_id = v_first_stage_id,
            stage_entered_at = NOW(),
            updated_at = NOW()
        WHERE id = p_card_id;

        v_result := jsonb_build_object(
            'action', 'won_section',
            'phase', v_phase_slug,
            'milestone', 'ganho_planner',
            'moved_to_stage', v_first_stage_id,
            'moved_to_phase', 'pos_venda'
        );

    ELSE
        RAISE EXCEPTION 'Fase % não suporta ação de ganho', v_phase_slug;
    END IF;

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'section_won',
        'Seção ganha: ' || v_phase_slug,
        v_result
    );

    RETURN v_result;
END;
$fn$;

-- ============================================================================
-- 2. Reescrever marcar_perdido COM bloqueio em Pós-Venda
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_perdido(
    p_card_id UUID,
    p_motivo_perda_id UUID DEFAULT NULL,
    p_motivo_perda_comentario TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- Validar card
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    -- Validar que não está já fechado
    IF EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card já está fechado (ganho ou perdido)';
    END IF;

    -- Bloquear em Pós-Venda/Resolução — fase de execução, sem perdido
    IF EXISTS (
        SELECT 1 FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.id = p_card_id AND pp.slug IN ('pos_venda', 'resolucao')
    ) THEN
        RAISE EXCEPTION 'Pós-Venda não suporta ação de perdido';
    END IF;

    -- Marcar como perdido — card PERMANECE na etapa atual
    UPDATE cards SET
        status_comercial = 'perdido',
        data_fechamento = CURRENT_DATE,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = NOW()
    WHERE id = p_card_id;

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'card_lost',
        'Card marcado como perdido',
        jsonb_build_object(
            'motivo_perda_id', p_motivo_perda_id,
            'motivo_perda_comentario', p_motivo_perda_comentario,
            'stage_id', (SELECT pipeline_stage_id FROM cards WHERE id = p_card_id)
        )
    );
END;
$fn$;

-- ============================================================================
-- 3. Reescrever reabrir_card — limpa milestone da fase atual ao reabrir
--    Para que relatórios não mostrem data de venda incorreta
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reabrir_card(p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_phase_slug TEXT;
BEGIN
    -- Validar card
    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND deleted_at IS NULL
          AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card não encontrado, deletado, ou não está fechado: %', p_card_id;
    END IF;

    -- Descobrir fase atual do card para limpar o milestone correto
    SELECT pp.slug INTO v_phase_slug
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id;

    -- Reabrir — limpar campos de fechamento + milestone da fase atual
    UPDATE cards SET
        status_comercial = 'aberto',
        data_fechamento = NULL,
        motivo_perda_id = NULL,
        motivo_perda_comentario = NULL,
        -- Limpar milestone da fase onde o card está para não poluir relatórios
        ganho_sdr = CASE WHEN v_phase_slug = 'sdr' THEN false ELSE ganho_sdr END,
        ganho_sdr_at = CASE WHEN v_phase_slug = 'sdr' THEN NULL ELSE ganho_sdr_at END,
        ganho_planner = CASE WHEN v_phase_slug = 'planner' THEN false ELSE ganho_planner END,
        ganho_planner_at = CASE WHEN v_phase_slug = 'planner' THEN NULL ELSE ganho_planner_at END,
        ganho_pos = CASE WHEN v_phase_slug IN ('pos_venda', 'resolucao') THEN false ELSE ganho_pos END,
        ganho_pos_at = CASE WHEN v_phase_slug IN ('pos_venda', 'resolucao') THEN NULL ELSE ganho_pos_at END,
        updated_at = NOW()
    WHERE id = p_card_id;

    -- Registrar activity
    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'card_reopened',
        'Card reaberto',
        jsonb_build_object('phase', v_phase_slug)
    );
END;
$fn$;

COMMENT ON FUNCTION reabrir_card IS
    'Reabre card ganho/perdido. Limpa status, data de fechamento e milestone da fase atual.';

COMMIT;
