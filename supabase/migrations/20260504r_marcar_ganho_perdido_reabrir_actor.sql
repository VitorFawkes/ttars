-- ============================================================================
-- MIGRATION: marcar_ganho / marcar_perdido / reabrir_card — preencher autoria
-- Date: 2026-05-04
--
-- Bug: as 3 RPCs gravam em activities sem preencher created_by, mesmo quando
-- o usuário humano clicou no botão. Resultado: feed mostra "Sistema" em vez
-- de "Vitor" (ou quem foi).
--
-- Fix: capturar auth.uid() e gravar em created_by. O trigger
-- enrich_activity_actor cuida do resto (resolve label via profiles.nome).
--
-- IMPORTANTE: marcar_ganho usa a versão mais recente (20260504d_marcar_ganho_skip_pos_venda.sql).
-- Esta migration RECRIA com lógica idêntica + created_by.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. marcar_ganho — recria preservando lógica skip_pos_venda atual + autoria
-- ============================================================================
CREATE OR REPLACE FUNCTION public.marcar_ganho(
    p_card_id UUID,
    p_novo_dono_id UUID DEFAULT NULL,
    p_skip_pos_venda BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_phase_slug TEXT;
    v_next_phase RECORD;
    v_first_stage_id UUID;
    v_target_pos_stage_id UUID;
    v_result JSONB;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

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

    -- ─── GANHO PLANNER ───
    ELSIF v_phase_slug = 'planner' THEN

        IF p_skip_pos_venda THEN
            v_target_pos_stage_id := fn_calcular_etapa_pos_venda(p_card_id);

            IF v_target_pos_stage_id IS NULL THEN
                RAISE EXCEPTION 'Não foi possível calcular etapa pos_venda para o card %', p_card_id;
            END IF;

            UPDATE cards SET
                ganho_planner = true,
                ganho_planner_at = COALESCE(ganho_planner_at, NOW()),
                status_comercial = 'ganho',
                data_fechamento = CURRENT_DATE,
                skip_pos_venda = true,
                pipeline_stage_id = v_target_pos_stage_id,
                stage_entered_at = NOW(),
                dono_atual_id = COALESCE(p_novo_dono_id, vendas_owner_id, dono_atual_id),
                updated_at = NOW()
            WHERE id = p_card_id;

            v_result := jsonb_build_object(
                'action', 'won_skip_pos_venda',
                'phase', v_phase_slug,
                'milestone', 'ganho_planner',
                'skip_pos_venda', true,
                'moved_to_stage', v_target_pos_stage_id,
                'moved_to_phase', 'pos_venda'
            );

        ELSE
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
        END IF;

    ELSE
        RAISE EXCEPTION 'Fase % não suporta ação de ganho', v_phase_slug;
    END IF;

    -- Registrar activity COM AUTORIA (created_by preenchido)
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        p_card_id,
        'section_won',
        CASE
            WHEN p_skip_pos_venda AND v_phase_slug = 'planner'
                THEN 'Venda fechada sem Pós-Venda (movido para Pós-Venda em modo passivo)'
            ELSE 'Seção ganha: ' || v_phase_slug
        END,
        v_result,
        v_user_id  -- ← autoria humana preservada
    );

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.marcar_ganho(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- 2. marcar_perdido — preservar lógica + autoria
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
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card já está fechado (ganho ou perdido)';
    END IF;

    UPDATE cards SET
        status_comercial = 'perdido',
        data_fechamento = CURRENT_DATE,
        motivo_perda_id = p_motivo_perda_id,
        motivo_perda_comentario = p_motivo_perda_comentario,
        updated_at = NOW()
    WHERE id = p_card_id;

    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        p_card_id,
        'card_lost',
        'Card marcado como perdido',
        jsonb_build_object(
            'motivo_perda_id', p_motivo_perda_id,
            'motivo_perda_comentario', p_motivo_perda_comentario,
            'stage_id', (SELECT pipeline_stage_id FROM cards WHERE id = p_card_id)
        ),
        v_user_id
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.marcar_perdido(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. reabrir_card — preservar lógica + autoria
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reabrir_card(p_card_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF NOT EXISTS (
        SELECT 1 FROM cards
        WHERE id = p_card_id
          AND deleted_at IS NULL
          AND status_comercial IN ('ganho', 'perdido')
    ) THEN
        RAISE EXCEPTION 'Card não encontrado, deletado, ou não está fechado: %', p_card_id;
    END IF;

    UPDATE cards SET
        status_comercial = 'aberto',
        data_fechamento = NULL,
        motivo_perda_id = NULL,
        motivo_perda_comentario = NULL,
        updated_at = NOW()
    WHERE id = p_card_id;

    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        p_card_id,
        'card_reopened',
        'Card reaberto',
        '{}'::jsonb,
        v_user_id
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reabrir_card(UUID) TO authenticated;

COMMIT;
