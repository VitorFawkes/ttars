-- =====================================================================
-- 20260507b: ações Echo (mídia + gestão de conversa) em cadence_steps
--
-- Estende o sistema de cadências para suportar duas novas categorias
-- de step:
--   - 'send_media'  → envia imagem/vídeo/áudio/doc via Echo /send-image
--   - 'echo_action' → ações de gestão de conversa Echo
--                     (assign, release, close, set_status, add_tag,
--                      remove_tag, add_co_owner, remove_co_owner)
--
-- O cadence-engine ganha helpers:
--   - callEchoApi(method, path, body)
--   - resolveEchoConversationId(supabase, cardId)
--   - resolveEchoUserId(supabase, profileId)
-- e despacha cada sub-ação para o endpoint correspondente.
--
-- A mesma lista de ações também passa a valer como action_type em
-- cadence_event_triggers (entry-rule), seguindo o padrão dos triggers
-- atuais (send_message, change_stage, etc.).
-- =====================================================================

BEGIN;

-- 1) Estender CHECK em cadence_steps.step_type
ALTER TABLE cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_step_type_check;
ALTER TABLE cadence_steps ADD CONSTRAINT cadence_steps_step_type_check
    CHECK (step_type IN ('task', 'wait', 'branch', 'end', 'message', 'send_media', 'echo_action'));

-- 2) Colunas de configuração das novas ações
ALTER TABLE cadence_steps ADD COLUMN IF NOT EXISTS media_config JSONB;
ALTER TABLE cadence_steps ADD COLUMN IF NOT EXISTS echo_config JSONB;

COMMENT ON COLUMN cadence_steps.media_config IS
    'Config quando step_type=send_media. Formato:
     { "media_url": "https://...",      -- URL hospedada (modo URL)
       "mime_type": "image/jpeg",       -- obrigatório no modo URL
       "filename": "foto.jpg",          -- opcional
       "caption": "{{contact.primeiro_nome}} ...", -- opcional, com vars
       "phone_number_id": "uuid"        -- linha WhatsApp
     }
     Modo upload (multipart) não é suportado em automação — só URL pública.';

COMMENT ON COLUMN cadence_steps.echo_config IS
    'Config quando step_type=echo_action. Formato:
     { "action": "assign" | "release" | "close" | "set_status"
                | "add_tag" | "remove_tag" | "add_co_owner" | "remove_co_owner",

       -- assign / add_co_owner / remove_co_owner:
       "assign_to": "card_owner" | "specific",  -- só assign
       "user_id": "uuid-ttars-profile",         -- resolvido via integration_user_map

       -- close:
       "reason": "texto livre",
       "close_reason_id": "uuid-echo",   -- alternativa: id do catálogo Echo

       -- set_status:
       "status": "active" | "waiting" | "closed",

       -- add_tag / remove_tag:
       "tag_id": "uuid-echo-tag",

       -- comum:
       "phone_number_id": "uuid-echo-phone"  -- pra criar conversa caso não exista
     }
     phone_number_id é opcional aqui; engine resolve a conversa via
     whatsapp_messages.conversation_id e cai em fallback se ausente.';

-- 3) Atualizar RPC replace_cadence_steps com os novos campos
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
        due_offset, task_config, message_config, media_config, echo_config, next_step_key,
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
        CASE WHEN s ? 'media_config'   AND s->'media_config'   <> 'null'::JSONB THEN s->'media_config'   ELSE NULL END,
        CASE WHEN s ? 'echo_config'    AND s->'echo_config'    <> 'null'::JSONB THEN s->'echo_config'    ELSE NULL END,
        NULLIF(s->>'next_step_key', ''),
        NULLIF(s->>'tipo_concierge', ''),
        NULLIF(s->>'categoria_concierge', ''),
        COALESCE((s->>'gera_atendimento_concierge')::BOOL, false),
        CASE WHEN s ? 'condicao_extra' AND s->'condicao_extra' <> 'null'::JSONB THEN s->'condicao_extra' ELSE NULL END
    FROM jsonb_array_elements(p_steps) AS s;
END;
$function$;

COMMIT;
