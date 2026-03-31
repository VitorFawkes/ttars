-- =============================================================================
-- n8n AI Extraction Webhook: Disparo automático de extração AI via WhatsApp
-- =============================================================================
-- Quando mensagens inbound de WhatsApp chegam para um card, agenda chamada
-- ao n8n para extrair dados da conversa e atualizar produto_data/briefing_inicial.
-- Usa debounce de 1 minuto (configurável) para evitar chamadas excessivas.
-- =============================================================================

-- 1. Settings
INSERT INTO integration_settings (key, value, description) VALUES
    ('N8N_AI_WEBHOOK_URL', 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/ai-extraction', 'URL do webhook n8n para extração AI de WhatsApp'),
    ('N8N_AI_WEBHOOK_ENABLED', 'false', 'Habilitar disparo automático de extração AI'),
    ('N8N_AI_COOLDOWN_MINUTES', '1', 'Minutos de silêncio antes de disparar extração')
ON CONFLICT (key) DO NOTHING;

-- 2. Tabela de fila com debounce
CREATE TABLE IF NOT EXISTS n8n_ai_extraction_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    message_count INT DEFAULT 1,
    first_message_at TIMESTAMPTZ DEFAULT now(),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_n8n_queue_pending
    ON n8n_ai_extraction_queue(status, scheduled_for)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_n8n_queue_card_pending
    ON n8n_ai_extraction_queue(card_id)
    WHERE status = 'pending';

-- RLS
ALTER TABLE n8n_ai_extraction_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
    ON n8n_ai_extraction_queue FOR ALL TO service_role USING (true);

GRANT ALL ON n8n_ai_extraction_queue TO postgres;

-- 3. Trigger function: agenda extração AI quando mensagem inbound chega
CREATE OR REPLACE FUNCTION notify_n8n_ai_extraction()
RETURNS TRIGGER AS $$
DECLARE
    v_cooldown INT;
BEGIN
    -- Só para mensagens inbound (do cliente) com card vinculado
    IF NEW.is_from_me = true OR NEW.card_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verifica se habilitado
    IF NOT EXISTS (
        SELECT 1 FROM integration_settings
        WHERE key = 'N8N_AI_WEBHOOK_ENABLED' AND value = 'true'
    ) THEN
        RETURN NEW;
    END IF;

    -- Cooldown configurável (default 1 min)
    SELECT COALESCE(
        (SELECT value::int FROM integration_settings WHERE key = 'N8N_AI_COOLDOWN_MINUTES'),
        1
    ) INTO v_cooldown;

    -- UPSERT: se já existe pending para este card, empurra o timer
    -- Se não existe, cria nova entry
    INSERT INTO n8n_ai_extraction_queue (card_id, scheduled_for, message_count)
    VALUES (NEW.card_id, now() + (v_cooldown || ' minutes')::interval, 1)
    ON CONFLICT (card_id) WHERE status = 'pending'
    DO UPDATE SET
        last_message_at = now(),
        scheduled_for = now() + (v_cooldown || ' minutes')::interval,
        message_count = n8n_ai_extraction_queue.message_count + 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_n8n_ai_extraction
    AFTER INSERT ON whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_n8n_ai_extraction();

-- 4. Cron job: processa fila a cada 2 minutos via pg_net
SELECT cron.schedule(
    'n8n-ai-extraction-dispatch',
    '*/2 * * * *',
    $$
    DO $job$
    DECLARE
        rec RECORD;
        v_url TEXT;
    BEGIN
        -- Verifica se habilitado
        IF NOT EXISTS (
            SELECT 1 FROM integration_settings
            WHERE key = 'N8N_AI_WEBHOOK_ENABLED' AND value = 'true'
        ) THEN RETURN; END IF;

        -- Busca URL do webhook
        SELECT value INTO v_url FROM integration_settings
        WHERE key = 'N8N_AI_WEBHOOK_URL';
        IF v_url IS NULL OR v_url = '' THEN RETURN; END IF;

        -- Processa itens pendentes cujo timer expirou
        FOR rec IN
            SELECT id, card_id, message_count
            FROM n8n_ai_extraction_queue
            WHERE status = 'pending' AND scheduled_for <= now()
            ORDER BY scheduled_for ASC
            LIMIT 10
        LOOP
            -- Marca como enviado
            UPDATE n8n_ai_extraction_queue
            SET status = 'sent', sent_at = now()
            WHERE id = rec.id;

            -- Dispara webhook (fire-and-forget via pg_net)
            PERFORM net.http_post(
                url := v_url,
                headers := '{"Content-Type": "application/json"}'::jsonb,
                body := jsonb_build_object(
                    'card_id', rec.card_id,
                    'message_count', rec.message_count,
                    'queue_id', rec.id
                )
            );
        END LOOP;
    END;
    $job$;
    $$
);

-- 5. Limpeza automática: remove entries enviadas com mais de 7 dias
SELECT cron.schedule(
    'n8n-ai-queue-cleanup',
    '0 3 * * *',
    $$DELETE FROM n8n_ai_extraction_queue WHERE status = 'sent' AND sent_at < now() - interval '7 days'$$
);

-- 6. RPC segura para n8n atualizar card sem disparar outbound sync
CREATE OR REPLACE FUNCTION update_card_from_ai_extraction(
    p_card_id UUID,
    p_produto_data JSONB,
    p_briefing_inicial JSONB
) RETURNS JSONB AS $$
BEGIN
    -- Prevenir loop outbound (trg_card_outbound_sync checa este setting)
    PERFORM set_config('app.update_source', 'integration', true);

    UPDATE cards SET
        produto_data = p_produto_data,
        briefing_inicial = p_briefing_inicial,
        updated_at = now()
    WHERE id = p_card_id;

    RETURN jsonb_build_object('success', true, 'card_id', p_card_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Verificação:
--   SELECT * FROM cron.job WHERE jobname LIKE 'n8n%';
--   SELECT * FROM n8n_ai_extraction_queue ORDER BY created_at DESC LIMIT 20;
--   SELECT * FROM integration_settings WHERE key LIKE 'N8N%';
