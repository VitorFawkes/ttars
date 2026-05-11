-- =====================================================================
-- 20260507: novo step_type 'message' em cadence_steps
--
-- Motivo: hoje cadence_steps só aceita ('task','wait','branch','end').
-- Steps de tarefa criam tarefa humana via cadence-engine. Para migrar
-- cadências do ActiveCampaign (mensagens automáticas em sequência com
-- wait + auto-cancel quando card sai da etapa) precisamos de um tipo
-- que envie WhatsApp via Echo. A lógica de envio (HSM /send-template e
-- texto livre /send-message) já existe no cadence-engine para triggers
-- de send_message — vamos reusar via case 'message' no switch do step.
-- =====================================================================

BEGIN;

-- 1) Substituir CHECK constraint para incluir 'message'
ALTER TABLE cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_step_type_check;
ALTER TABLE cadence_steps ADD CONSTRAINT cadence_steps_step_type_check
    CHECK (step_type IN ('task', 'wait', 'branch', 'end', 'message'));

-- 2) Coluna message_config (mesmo formato do action_config dos triggers send_message)
ALTER TABLE cadence_steps ADD COLUMN IF NOT EXISTS message_config JSONB;

COMMENT ON COLUMN cadence_steps.message_config IS
    'Config quando step_type=message. Formato:
     { "send_mode": "hsm" | "text",
       "hsm_template_name": string,            -- só hsm
       "hsm_language": string DEFAULT pt_BR,   -- só hsm
       "hsm_params": [string, ...],            -- só hsm; aceita {{contact.primeiro_nome}} etc.
       "corpo": string,                        -- só text
       "template_id": uuid|null,               -- ref opcional a mensagem_templates (text)
       "phone_number_id": uuid                 -- linha WhatsApp obrigatória
     }
     respect_business_hours/auto_cancel_on_stage_change herdam do template.';

-- 3) Estender RPC replace_cadence_steps para persistir message_config
--    (mantém todos os campos da versão anterior 20260505f)
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
        due_offset, task_config, message_config, next_step_key,
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
        CASE WHEN s ? 'message_config' AND s->'message_config' <> 'null'::JSONB THEN s->'message_config' ELSE NULL END,
        NULLIF(s->>'next_step_key', ''),
        NULLIF(s->>'tipo_concierge', ''),
        NULLIF(s->>'categoria_concierge', ''),
        COALESCE((s->>'gera_atendimento_concierge')::BOOL, false),
        CASE WHEN s ? 'condicao_extra' AND s->'condicao_extra' <> 'null'::JSONB THEN s->'condicao_extra' ELSE NULL END
    FROM jsonb_array_elements(p_steps) AS s;
END;
$function$;

COMMIT;
