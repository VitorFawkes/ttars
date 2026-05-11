-- ============================================================================
-- Push Notification Trigger: Novo lead atribuído
-- Padrão: pg_net + vault (igual auto_dispatch_pending_outbound)
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_push_lead_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
BEGIN
    -- Só dispara se dono_atual_id mudou
    IF TG_OP = 'UPDATE' AND OLD.dono_atual_id IS NOT DISTINCT FROM NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- Sem dono = sem notificação
    IF NEW.dono_atual_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar service_role_key do vault
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[push_notify] service_role_key not found in vault';
        RETURN NEW;
    END IF;

    -- Chamada async via pg_net
    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'user_ids', jsonb_build_array(NEW.dono_atual_id::TEXT),
            'title', 'Novo lead atribuído',
            'body', 'Card "' || COALESCE(NEW.titulo, 'Sem título') || '" foi atribuído a você',
            'url', '/cards/' || NEW.id::TEXT,
            'type', 'lead_assigned'
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push_notify] pg_net call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Trigger
DROP TRIGGER IF EXISTS trg_push_lead_assigned ON public.cards;

CREATE TRIGGER trg_push_lead_assigned
    AFTER INSERT OR UPDATE OF dono_atual_id ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION notify_push_lead_assigned();
