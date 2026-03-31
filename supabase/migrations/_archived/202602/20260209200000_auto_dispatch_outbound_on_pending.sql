-- AUTO-DISPATCH: Dispara integration-dispatch automaticamente quando evento
-- é inserido como 'pending' na fila outbound.
--
-- Problema: O cron roda a cada 5min, mas o user espera envio imediato quando
-- shadow mode está desligado. Este trigger usa pg_net (async) para invocar
-- o edge function sem bloquear a transação do card update.
--
-- Segurança: pg_net dispara APÓS o commit, então o evento já é visível
-- quando o dispatch function faz o SELECT.
--
-- FIX EXTRA: Remove trigger duplicado tr_log_outbound_card_event que
-- causava eventos em duplicata (mesmo fn que trg_card_outbound_sync).

-- 0. Limpar trigger duplicado na tabela cards
-- Existiam dois triggers chamando log_outbound_card_event():
--   - trg_card_outbound_sync (original, manter)
--   - tr_log_outbound_card_event (duplicado, remover)
DROP TRIGGER IF EXISTS tr_log_outbound_card_event ON public.cards;

-- 1. Função que dispara o dispatch via pg_net
CREATE OR REPLACE FUNCTION auto_dispatch_pending_outbound()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
BEGIN
    -- Buscar service_role_key do vault
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[auto_dispatch] service_role_key not found in vault - skipping auto dispatch';
        RETURN NEW;
    END IF;

    -- Chamada async via pg_net (não bloqueia a transação)
    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/integration-dispatch',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Nunca falhar o INSERT na fila por causa do dispatch
    RAISE WARNING '[auto_dispatch] pg_net call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- 2. Trigger: dispara apenas para status='pending' (não shadow, blocked, etc.)
DROP TRIGGER IF EXISTS trg_auto_dispatch_outbound ON public.integration_outbound_queue;

CREATE TRIGGER trg_auto_dispatch_outbound
    AFTER INSERT ON public.integration_outbound_queue
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
    EXECUTE FUNCTION auto_dispatch_pending_outbound();

-- 3. Comentários
COMMENT ON FUNCTION auto_dispatch_pending_outbound IS
    'Dispara integration-dispatch via pg_net quando evento outbound é inserido como pending';
COMMENT ON TRIGGER trg_auto_dispatch_outbound ON public.integration_outbound_queue IS
    'Auto-dispatch: envia eventos pending imediatamente ao invés de esperar o cron de 5min';
