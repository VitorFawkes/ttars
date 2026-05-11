-- ============================================================================
-- drain_ai_message_buffer: rotear ao router correto baseado em ai_agents.engine
--
-- Problema corrigido: a versão anterior (20260506g) chamava hardcoded
-- /functions/v1/ai-agent-router (router v1, multi_agent_pipeline / Estela).
-- Com a chegada da Patricia (engine single_agent_v2, router v2), o cron passou
-- a disparar Estela em cima do buffer da Patricia, gerando respostas duplicadas
-- e mistura de engines.
--
-- Esta migration mantém o comportamento da Estela IDÊNTICO ao anterior. Para
-- linhas cujo agente é 'multi_agent_pipeline' (ou engine NULL), o roteamento
-- continua indo a /ai-agent-router. Apenas linhas 'single_agent_v2' são
-- redirecionadas para /ai-agent-router-v2.
-- ============================================================================

CREATE OR REPLACE FUNCTION drain_ai_message_buffer()
RETURNS void AS $$
DECLARE
    v_service_key TEXT;
    v_supabase_url CONSTANT TEXT := 'https://szyrzxvlptqqheizyrxu.supabase.co';
    v_pair RECORD;
    v_router_path TEXT;
BEGIN
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
     WHERE name = 'service_role_key'
     LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[drain_ai_message_buffer] service_role_key not found in vault';
        RETURN;
    END IF;

    FOR v_pair IN
        SELECT DISTINCT b.phone_number_id, b.contact_phone,
               MAX(b.contact_name) AS contact_name,
               MAX(COALESCE(a.engine, 'multi_agent_pipeline')) AS engine
          FROM ai_message_buffer b
          JOIN whatsapp_linha_config wl
                ON wl.phone_number_id = b.phone_number_id
               AND wl.ativo = true
          JOIN ai_agent_phone_line_config aapc
                ON aapc.phone_line_id = wl.id
               AND aapc.ativa = true
          JOIN ai_agents a
                ON a.id = aapc.agent_id
               AND a.ativa = true
         WHERE b.processed_at IS NULL
           AND b.created_at < now()
                              - ((COALESCE(a.timings->>'debounce_seconds', '20')::int + 1) || ' seconds')::interval
         GROUP BY b.phone_number_id, b.contact_phone
    LOOP
        v_router_path := CASE
            WHEN v_pair.engine = 'single_agent_v2' THEN '/functions/v1/ai-agent-router-v2'
            ELSE '/functions/v1/ai-agent-router'
        END;

        PERFORM net.http_post(
            url := v_supabase_url || v_router_path,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                '_drain', true,
                'phone_number_id', v_pair.phone_number_id,
                'contact_phone', v_pair.contact_phone,
                'contact_name', v_pair.contact_name,
                'message_text', ''
            )
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

COMMENT ON FUNCTION drain_ai_message_buffer() IS
'Cron drain do ai_message_buffer. Roteia ao router v1 (multi_agent_pipeline) ou v2 (single_agent_v2) conforme ai_agents.engine. Mantém comportamento da Estela inalterado.';
