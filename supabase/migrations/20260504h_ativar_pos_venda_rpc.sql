-- ============================================================================
-- MIGRATION: RPC ativar_pos_venda — caminho inverso de Ganho sem Pós-Venda
-- Date: 2026-05-04
--
-- Substitui a RPC enviar_para_pos_venda (criada em 20260504a) que assumia
-- que cards Ganho Direto ficavam em fase planner. Agora cards Ganho sem
-- Pós-Venda já estão em pos_venda — o que muda quando o usuário "ativa" é:
--   - skip_pos_venda = false
--   - status_comercial = 'aberto' (passa a ser operação ativa)
--   - data_fechamento = NULL (passa de fechado para em-andamento)
--   - pos_owner_id = recebido como parâmetro
--   - dono_atual_id = pos_owner_id (acompanhamento ativo)
--   - Mantém ganho_planner=true, ganho_planner_at, pipeline_stage_id
--
-- Após ativação, cadências/automações de pós-venda passam a disparar normalmente.
-- ============================================================================

BEGIN;

-- Remove a RPC anterior que não se aplica mais
DROP FUNCTION IF EXISTS public.enviar_para_pos_venda(UUID, UUID);

CREATE OR REPLACE FUNCTION public.ativar_pos_venda(
    p_card_id UUID,
    p_pos_owner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_org_id UUID;
    v_result JSONB;
BEGIN
    SELECT
        c.id,
        c.org_id,
        c.pipeline_stage_id,
        c.status_comercial,
        c.skip_pos_venda,
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

    v_org_id := requesting_org_id();
    IF v_org_id IS NOT NULL AND v_card.org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização';
    END IF;

    IF COALESCE(v_card.skip_pos_venda, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Card não está marcado como Ganho sem Pós-Venda';
    END IF;

    IF p_pos_owner_id IS NULL THEN
        RAISE EXCEPTION 'É preciso definir o responsável pelo Pós-Venda';
    END IF;

    UPDATE cards SET
        skip_pos_venda = false,
        status_comercial = 'aberto',
        data_fechamento = NULL,
        pos_owner_id = p_pos_owner_id,
        dono_atual_id = p_pos_owner_id,
        updated_at = NOW()
    WHERE id = p_card_id;

    INSERT INTO activities (card_id, tipo, descricao, metadata)
    VALUES (
        p_card_id,
        'pos_venda_ativado',
        'Pós-Venda ativado — card sai do modo "Sem Pós-Venda" e passa a ter acompanhamento',
        jsonb_build_object(
            'action', 'pos_venda_ativado',
            'pos_owner_id', p_pos_owner_id,
            'phase', v_card.phase_slug,
            'stage_id', v_card.pipeline_stage_id
        )
    );

    v_result := jsonb_build_object(
        'action', 'pos_venda_ativado',
        'pos_owner_id', p_pos_owner_id,
        'stage_id', v_card.pipeline_stage_id
    );

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ativar_pos_venda(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.ativar_pos_venda(UUID, UUID) IS
  'Ativa acompanhamento de Pós-Venda em card que estava como Ganho sem Pós-Venda. Limpa skip_pos_venda, atribui pos_owner_id, volta status para aberto.';

COMMIT;
