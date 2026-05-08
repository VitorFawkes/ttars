-- =====================================================================
-- 20260507e: incluir branch_config e end_config no replace_cadence_steps
--
-- Bug histórico: a RPC replace_cadence_steps NUNCA inseriu as colunas
-- branch_config nem end_config — desde a primeira versão (cadence_engine_v3)
-- até as últimas iterações (20260505f, 20260507, 20260507b, 20260507d) elas
-- foram esquecidas em todos os refactors. Resultado: configs de Decisão
-- (if/else) e Fim sempre voltavam vazias ao recarregar a cadência, mesmo
-- com o user tendo configurado.
--
-- Fix: adicionar as duas colunas no INSERT + SELECT da RPC. Sem mudança
-- de schema, só correção da função.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.replace_cadence_steps(p_template_id uuid, p_steps jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_template_org UUID;
    v_caller_org UUID;
BEGIN
    v_caller_org := requesting_org_id();

    SELECT org_id INTO v_template_org
    FROM cadence_templates
    WHERE id = p_template_id;

    IF v_template_org IS NULL THEN
        RAISE EXCEPTION 'Template de cadência não encontrado: %', p_template_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_org IS NULL OR v_template_org <> v_caller_org THEN
        RAISE EXCEPTION 'Permissão negada: template pertence a outra organização'
            USING ERRCODE = '42501';
    END IF;

    UPDATE cadence_instances
    SET current_step_id = NULL
    WHERE template_id = p_template_id;

    DELETE FROM cadence_queue
    WHERE step_id IN (
        SELECT id FROM cadence_steps WHERE template_id = p_template_id
    );

    DELETE FROM cadence_steps
    WHERE template_id = p_template_id;

    INSERT INTO cadence_steps (
        template_id, step_order, step_key, step_type, block_index,
        day_offset, wait_config, requires_previous_completed,
        due_offset, task_config,
        message_config, media_config, echo_config, card_action_config,
        branch_config, end_config,
        next_step_key,
        tipo_concierge, categoria_concierge,
        gera_atendimento_concierge, condicao_extra
    )
    SELECT
        p_template_id,
        (s->>'step_order')::INT,
        s->>'step_key',
        s->>'step_type',
        (s->>'block_index')::INT,
        (s->>'day_offset')::INT,
        CASE WHEN s->'wait_config' = 'null'::JSONB THEN NULL ELSE s->'wait_config' END,
        COALESCE((s->>'requires_previous_completed')::BOOL, false),
        s->'due_offset',
        s->'task_config',
        CASE WHEN s ? 'message_config'      AND s->'message_config'      <> 'null'::JSONB THEN s->'message_config'      ELSE NULL END,
        CASE WHEN s ? 'media_config'        AND s->'media_config'        <> 'null'::JSONB THEN s->'media_config'        ELSE NULL END,
        CASE WHEN s ? 'echo_config'         AND s->'echo_config'         <> 'null'::JSONB THEN s->'echo_config'         ELSE NULL END,
        CASE WHEN s ? 'card_action_config'  AND s->'card_action_config'  <> 'null'::JSONB THEN s->'card_action_config'  ELSE NULL END,
        CASE WHEN s ? 'branch_config'       AND s->'branch_config'       <> 'null'::JSONB THEN s->'branch_config'       ELSE NULL END,
        CASE WHEN s ? 'end_config'          AND s->'end_config'          <> 'null'::JSONB THEN s->'end_config'          ELSE NULL END,
        NULLIF(s->>'next_step_key', ''),
        NULLIF(s->>'tipo_concierge', ''),
        NULLIF(s->>'categoria_concierge', ''),
        COALESCE((s->>'gera_atendimento_concierge')::BOOL, false),
        CASE WHEN s ? 'condicao_extra' AND s->'condicao_extra' <> 'null'::JSONB THEN s->'condicao_extra' ELSE NULL END
    FROM jsonb_array_elements(p_steps) AS s;
END;
$function$;

COMMIT;
