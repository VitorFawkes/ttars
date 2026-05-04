-- ============================================================================
-- MIGRATION: RPC enviar_para_pos_venda
-- Date: 2026-05-04
--
-- Caminho inverso ao "Ganho Direto" (skip_pos_venda=true).
-- Permite que um card já marcado como Ganho (sem pós-venda) seja transferido
-- para a fase Pós-Venda mantendo o registro de venda fechada pelo Planner.
--
-- Pré-condições:
--   - Card existe, não deletado
--   - status_comercial = 'ganho'
--   - ganho_planner = true
--   - ganho_pos != true
--   - Card está na fase 'planner' (Ganho Direto fica na fase do Planner)
--
-- Efeitos:
--   - Move card para a primeira etapa ativa da fase 'pos_venda'
--   - status_comercial volta para 'aberto' (em operação)
--   - data_fechamento = NULL (passou de fechado para em-andamento)
--   - Mantém ganho_planner=true e ganho_planner_at (registro da venda preservado)
--   - Define pos_owner_id e dono_atual_id (se passado p_pos_owner_id)
--   - Registra activity 'pos_venda_acionado'
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enviar_para_pos_venda(
    p_card_id UUID,
    p_pos_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_pos_phase_id UUID;
    v_first_pos_stage_id UUID;
    v_org_id UUID;
    v_result JSONB;
BEGIN
    SELECT
        c.id,
        c.org_id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.dono_atual_id,
        c.pos_owner_id,
        c.ganho_sdr,
        c.ganho_planner,
        c.ganho_pos,
        s.pipeline_id,
        pp.slug AS phase_slug
    INTO v_card
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_card_id
      AND c.deleted_at IS NULL;

    IF v_card IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado ou deletado: %', p_card_id;
    END IF;

    -- Defesa em profundidade: a RPC é SECURITY DEFINER, garantir org match
    v_org_id := requesting_org_id();
    IF v_org_id IS NOT NULL AND v_card.org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização';
    END IF;

    IF v_card.status_comercial <> 'ganho' THEN
        RAISE EXCEPTION 'Card não está marcado como Ganho (status atual: %)', v_card.status_comercial;
    END IF;

    IF COALESCE(v_card.ganho_planner, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Card precisa ter ganho_planner=true para ser enviado ao Pós-Venda';
    END IF;

    IF COALESCE(v_card.ganho_pos, false) IS TRUE THEN
        RAISE EXCEPTION 'Card já passou pelo Pós-Venda (ganho_pos=true). Use o fluxo de reabertura.';
    END IF;

    IF v_card.phase_slug <> 'planner' THEN
        RAISE EXCEPTION 'Card não está na fase Planner (fase atual: %)', v_card.phase_slug;
    END IF;

    SELECT pp.id INTO v_pos_phase_id
    FROM pipeline_phases pp
    JOIN pipeline_stages s2 ON s2.phase_id = pp.id
    WHERE s2.pipeline_id = v_card.pipeline_id
      AND pp.slug = 'pos_venda'
    LIMIT 1;

    IF v_pos_phase_id IS NULL THEN
        RAISE EXCEPTION 'Fase pos_venda não encontrada para o pipeline do card';
    END IF;

    SELECT s.id INTO v_first_pos_stage_id
    FROM pipeline_stages s
    WHERE s.phase_id = v_pos_phase_id
      AND s.ativo = true
      AND COALESCE(s.is_won, false) = false
      AND COALESCE(s.is_lost, false) = false
    ORDER BY s.ordem ASC
    LIMIT 1;

    IF v_first_pos_stage_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda';
    END IF;

    UPDATE cards SET
        status_comercial = 'aberto',
        data_fechamento = NULL,
        pipeline_stage_id = v_first_pos_stage_id,
        stage_entered_at = NOW(),
        pos_owner_id = COALESCE(p_pos_owner_id, pos_owner_id),
        dono_atual_id = COALESCE(p_pos_owner_id, pos_owner_id, dono_atual_id),
        updated_at = NOW()
    WHERE id = p_card_id;

    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'pos_venda_acionado',
        'Card transferido de Ganho Direto para Pós-Venda',
        jsonb_build_object(
            'action', 'pos_venda_acionado',
            'from_phase', 'planner',
            'to_phase', 'pos_venda',
            'moved_to_stage', v_first_pos_stage_id,
            'pos_owner_id', COALESCE(p_pos_owner_id, v_card.pos_owner_id)
        )
    );

    v_result := jsonb_build_object(
        'action', 'pos_venda_acionado',
        'moved_to_stage', v_first_pos_stage_id,
        'moved_to_phase', 'pos_venda'
    );

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.enviar_para_pos_venda(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.enviar_para_pos_venda(UUID, UUID) IS
    'Envia card de Ganho Direto (status=ganho, fase=planner) para a fase Pós-Venda. Mantém ganho_planner=true e zera data_fechamento.';

COMMIT;
