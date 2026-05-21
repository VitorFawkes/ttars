-- ============================================================================
-- HANDOFF COMPARTILHADO — função de materialização chamável (complemento)
-- Date: 2026-05-18
--
-- CONTEXTO
-- A migration 20260518a já adiciona materialização de tarefas + notificações
-- dentro de mover_card. Mas o fluxo "Ganho Travel Planner → Pós-venda" usa
-- a RPC marcar_ganho (não mover_card), que faz UPDATE direto em
-- cards.pipeline_stage_id e portanto NÃO cria as tarefas nem notifica.
--
-- Esta migration adiciona materialize_stage_entry_tasks_for_card (função
-- nova, sem rebase) que pode ser chamada explicitamente do frontend após
-- marcar_ganho — replicando a mesma lógica de mover_card de forma idempotente
-- (skip se já foram criadas tarefas do sistema nos últimos 30 segundos,
-- evitando duplicação se drag/drop e marcar_ganho dispararem ambos).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.materialize_stage_entry_tasks_for_card(p_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_card_org_id uuid;
    v_card_titulo text;
    v_current_stage_id uuid;
    v_compartilhado boolean := false;
    v_target_phase_id uuid;
    v_stage_nome text;
    v_inserted_count int := 0;
BEGIN
    -- Org guard: card pertence à org do usuário
    SELECT c.org_id, c.titulo, c.pipeline_stage_id
    INTO v_card_org_id, v_card_titulo, v_current_stage_id
    FROM public.cards c
    WHERE c.id = p_card_id
      AND c.org_id = requesting_org_id();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Card não encontrado ou acesso negado: %', p_card_id;
    END IF;

    IF v_current_stage_id IS NULL THEN
        RETURN jsonb_build_object('shared', false, 'tasks_created', 0);
    END IF;

    SELECT COALESCE(handoff_compartilhado, false), phase_id, nome
    INTO v_compartilhado, v_target_phase_id, v_stage_nome
    FROM public.pipeline_stages
    WHERE id = v_current_stage_id;

    IF NOT v_compartilhado THEN
        RETURN jsonb_build_object('shared', false, 'tasks_created', 0);
    END IF;

    -- Idempotência: se outra via (mover_card) já criou tarefas do sistema
    -- pendentes pra este card nos últimos 30 segundos, pula
    IF EXISTS (
        SELECT 1 FROM public.tarefas
        WHERE card_id = p_card_id
          AND created_by IS NULL
          AND status = 'pendente'
          AND created_at >= NOW() - INTERVAL '30 seconds'
    ) THEN
        RETURN jsonb_build_object(
            'shared', true,
            'tasks_created', 0,
            'skipped_idempotent', true
        );
    END IF;

    -- Materializar tarefas do template (responsavel_id=NULL, created_by=NULL)
    INSERT INTO public.tarefas (
        card_id, titulo, descricao, tipo, prioridade,
        data_vencimento, responsavel_id, created_by, status, org_id
    )
    SELECT
        p_card_id,
        t.titulo,
        t.descricao,
        t.tipo,
        t.prioridade,
        (now() + (t.dias_vencimento || ' days')::interval),
        NULL,
        NULL,
        'pendente',
        v_card_org_id
    FROM public.stage_entry_task_templates t
    WHERE t.stage_id = v_current_stage_id
      AND t.ativo = true
      AND t.org_id = v_card_org_id
    ORDER BY t.ordem;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    -- Notificar todos os membros do time da fase destino
    IF v_target_phase_id IS NOT NULL THEN
        INSERT INTO public.notifications (
            user_id, type, title, body, url, card_id, org_id, metadata
        )
        SELECT DISTINCT
            tm.user_id,
            'shared_handoff',
            'Novo card em ' || v_stage_nome,
            COALESCE(v_card_titulo, 'Card') || ' entrou na fila do time. Veja se há tarefa pra você.',
            '/cards/' || p_card_id::text,
            p_card_id,
            v_card_org_id,
            jsonb_build_object(
                'stage_id', v_current_stage_id,
                'phase_id', v_target_phase_id,
                'shared', true
            )
        FROM public.team_members tm
        JOIN public.teams t ON t.id = tm.team_id
        WHERE t.phase_id = v_target_phase_id
          AND t.org_id = v_card_org_id
          AND COALESCE(t.is_active, true) = true
          AND tm.user_id IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'shared', true,
        'tasks_created', v_inserted_count,
        'stage_id', v_current_stage_id,
        'phase_id', v_target_phase_id
    );
END;
$$;

COMMENT ON FUNCTION public.materialize_stage_entry_tasks_for_card(uuid) IS
  'Chamada explícita pra materializar tarefas do template + notificar time quando card entra em etapa compartilhada. Usar após marcar_ganho (que não passa por mover_card). Idempotente via janela de 30s.';
