-- =====================================================================
-- 20260505f: estender RPC replace_cadence_steps pra passar campos
-- de concierge (tipo_concierge, categoria_concierge,
-- gera_atendimento_concierge, condicao_extra) do JSON pro INSERT.
--
-- Motivo: o editor de automações precisa exigir Tipo + Categoria
-- quando o responsável da tarefa é do time Concierge. O cadence-engine
-- já lê esses campos como COLUNAS de cadence_steps (não do task_config),
-- mas a RPC atual ignora tudo que não está na lista fixa.
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

    -- 1) Nullificar FK em cadence_instances
    UPDATE cadence_instances
    SET current_step_id = NULL
    WHERE template_id = p_template_id;

    -- 2) Deletar items da queue referenciando steps deste template
    DELETE FROM cadence_queue
    WHERE step_id IN (
        SELECT id FROM cadence_steps WHERE template_id = p_template_id
    );

    -- 3) Deletar steps antigos
    DELETE FROM cadence_steps
    WHERE template_id = p_template_id;

    -- 4) Inserir novos steps do JSON.
    --    Campos de concierge passam direto: quando ausentes ficam NULL,
    --    quando presentes ativam o caminho de criação automática de
    --    atendimento_concierge no cadence-engine.
    INSERT INTO cadence_steps (
        template_id, step_order, step_key, step_type, block_index,
        day_offset, wait_config, requires_previous_completed,
        due_offset, task_config, next_step_key,
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
        NULLIF(s->>'next_step_key', ''),
        NULLIF(s->>'tipo_concierge', ''),
        NULLIF(s->>'categoria_concierge', ''),
        COALESCE((s->>'gera_atendimento_concierge')::BOOL, false),
        CASE WHEN s ? 'condicao_extra' AND s->'condicao_extra' <> 'null'::JSONB THEN s->'condicao_extra' ELSE NULL END
    FROM jsonb_array_elements(p_steps) AS s;
END;
$function$;

COMMIT;
