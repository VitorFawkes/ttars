-- ============================================================================
-- MIGRATION: RPC desativar_pos_venda — inverso de ativar_pos_venda
-- Date: 2026-05-06
--
-- Permite que um card que está com Pós-Venda ativo (skip_pos_venda=false,
-- em fase pos_venda) seja convertido para "Ganho sem Pós-Venda"
-- (skip_pos_venda=true, status_comercial='ganho').
--
-- Casos de uso:
--   - Card foi para Pós-Venda mas decide-se que não terá acompanhamento
--   - Inverso da ativação: quando se quer desligar cadências/automações
--     e tratar como ganho passivo
--
-- Comportamento:
--   - skip_pos_venda: false → true
--   - status_comercial: 'aberto' → 'ganho' (mantém 'ganho' se já estiver)
--   - data_fechamento: preenche se NULL (usa ganho_planner_at::DATE ou hoje)
--   - pos_owner_id: limpa (sem responsável Pós-Venda)
--   - dono_atual_id: volta para vendas_owner_id (rastreabilidade comercial)
--   - Mantém: pipeline_stage_id, ganho_planner/ganho_planner_at, ganho_pos/ganho_pos_at
--
-- Após desativação, cadências/automações de pós-venda param de disparar.
-- Reversível via ativar_pos_venda(card_id, pos_owner_id).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.desativar_pos_venda(
    p_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_org_id UUID;
    v_new_dono_id UUID;
    v_new_data_fechamento DATE;
    v_result JSONB;
BEGIN
    SELECT
        c.id,
        c.org_id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.skip_pos_venda,
        c.ganho_planner,
        c.ganho_planner_at,
        c.ganho_pos,
        c.data_fechamento,
        c.pos_owner_id,
        c.vendas_owner_id,
        c.dono_atual_id,
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

    v_org_id := requesting_org_id();
    IF v_org_id IS NOT NULL AND v_card.org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização';
    END IF;

    IF v_card.phase_slug <> 'pos_venda' THEN
        RAISE EXCEPTION 'Card não está na fase Pós-Venda (fase atual: %)', v_card.phase_slug;
    END IF;

    IF COALESCE(v_card.skip_pos_venda, false) IS TRUE THEN
        RAISE EXCEPTION 'Card já está marcado como Ganho sem Pós-Venda';
    END IF;

    IF v_card.status_comercial = 'perdido' THEN
        RAISE EXCEPTION 'Card está marcado como perdido — reabra antes de mudar para Sem Pós-Venda';
    END IF;

    -- Volta dono atual para vendas (rastreabilidade comercial). Se não tiver
    -- vendas_owner_id, mantém o atual.
    v_new_dono_id := COALESCE(v_card.vendas_owner_id, v_card.dono_atual_id);

    -- Garante data_fechamento preenchida (status_comercial='ganho' precisa de data)
    v_new_data_fechamento := COALESCE(
        v_card.data_fechamento,
        v_card.ganho_planner_at::DATE,
        CURRENT_DATE
    );

    UPDATE cards SET
        skip_pos_venda = true,
        status_comercial = 'ganho',
        data_fechamento = v_new_data_fechamento,
        pos_owner_id = NULL,
        dono_atual_id = v_new_dono_id,
        updated_at = NOW()
    WHERE id = p_card_id;

    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'pos_venda_desativado',
        'Pós-Venda desativado — card passa a ser Ganho sem Pós-Venda (sem acompanhamento)',
        jsonb_build_object(
            'action', 'pos_venda_desativado',
            'previous_pos_owner_id', v_card.pos_owner_id,
            'previous_status', v_card.status_comercial,
            'phase', v_card.phase_slug,
            'stage_id', v_card.pipeline_stage_id
        )
    );

    v_result := jsonb_build_object(
        'action', 'pos_venda_desativado',
        'stage_id', v_card.pipeline_stage_id,
        'data_fechamento', v_new_data_fechamento
    );

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.desativar_pos_venda(UUID) TO authenticated;

COMMENT ON FUNCTION public.desativar_pos_venda(UUID) IS
  'Desativa o acompanhamento de Pós-Venda em um card: marca skip_pos_venda=true, '
  'fecha como ganho, limpa pos_owner_id e devolve dono ao vendas_owner_id. '
  'Inverso de ativar_pos_venda. Cadências/automações de pós-venda param de disparar.';

COMMIT;
