-- ============================================================================
-- Cron drain do ai_message_buffer (rede de segurança contra hibernação do
-- edge runtime que congelava o setTimeout interno do ai-agent-router).
--
-- Sintoma observado em prod (06/05/2026): após 3h sem tráfego, msgs do Vitor
-- (whitelist) ficaram 24min no buffer em vez dos 20s configurados.
-- Causa: edge function hibernou, setTimeout(20s) ficou congelado até alguma
-- request acordar o isolate.
--
-- Estratégia: a cada 30s, varremos o buffer. Para cada (phone_number_id,
-- contact_phone) cuja msg mais antiga já passou do debounce_seconds DO AGENTE
-- ATIVO daquela linha, disparamos um POST ao /functions/v1/ai-agent-router
-- com {_drain: true}. O roteador faz UPDATE...RETURNING atômico (já existia)
-- pra impedir resposta duplicada caso o setTimeout interno também dispare.
--
-- Confirmações lidas no código:
--   * agent.timings.debounce_seconds é lido em CADA chamada (linha 3749 do
--     router) — UI do agente IA continua valendo, sem deploy.
--   * claimed.sort por created_at ASC (linha 3861) — ordem das mensagens
--     preservada, IA recebe o texto na sequência correta de chegada.
-- ============================================================================

CREATE OR REPLACE FUNCTION drain_ai_message_buffer()
RETURNS void AS $$
DECLARE
    v_service_key TEXT;
    v_supabase_url CONSTANT TEXT := 'https://szyrzxvlptqqheizyrxu.supabase.co';
    v_pair RECORD;
BEGIN
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
     WHERE name = 'service_role_key'
     LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[drain_ai_message_buffer] service_role_key not found in vault';
        RETURN;
    END IF;

    -- Para cada par (phone_number_id, contact_phone) com msg mais antiga já
    -- vencida pelo debounce do agente ativo daquela linha, dispara 1 _drain.
    -- DISTINCT garante que N msgs do mesmo cliente geram só 1 drain.
    -- A janela usa "+ 1" segundo de margem pra evitar disparo borderline que
    -- o roteador rejeitaria por ainda estar dentro da janela.
    FOR v_pair IN
        SELECT DISTINCT b.phone_number_id, b.contact_phone, MAX(b.contact_name) AS contact_name
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
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/ai-agent-router',
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

-- Schedule: cada 30s. Drain máximo após hibernação = debounce_seconds + 30s.
-- Se o ambiente não suportar interval-name syntax ('30 seconds'), trocar por
-- '*/30 * * * * *' (6-field cron, segundos).
SELECT cron.schedule(
    'drain-ai-message-buffer',
    '30 seconds',
    'SELECT drain_ai_message_buffer()'
);

-- Backfill: drena imediatamente o que estiver pendente >20s.
SELECT drain_ai_message_buffer();
