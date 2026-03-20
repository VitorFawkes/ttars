-- ============================================================================
-- Push Notification Trigger: Proposta visualizada/aceita/rejeitada
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_push_proposal_status()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
    v_card_owner UUID;
    v_card_titulo TEXT;
    v_status_label TEXT;
BEGIN
    -- Só dispara se status mudou
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Só notifica para status relevantes
    IF NEW.status NOT IN ('viewed', 'accepted', 'rejected') THEN
        RETURN NEW;
    END IF;

    -- Buscar dono do card para notificar
    SELECT c.dono_atual_id, c.titulo INTO v_card_owner, v_card_titulo
    FROM cards c
    WHERE c.id = NEW.card_id;

    IF v_card_owner IS NULL THEN
        RETURN NEW;
    END IF;

    -- Label legível
    v_status_label := CASE NEW.status
        WHEN 'viewed' THEN 'visualizada'
        WHEN 'accepted' THEN 'aceita'
        WHEN 'rejected' THEN 'rejeitada'
        ELSE NEW.status
    END;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'user_ids', jsonb_build_array(v_card_owner::TEXT),
            'title', 'Proposta ' || v_status_label,
            'body', 'Proposta do card "' || COALESCE(v_card_titulo, 'Sem título') || '" foi ' || v_status_label,
            'url', '/cards/' || NEW.card_id::TEXT,
            'type', 'proposal_status'
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push_proposal] pg_net call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_push_proposal_status ON public.proposals;

CREATE TRIGGER trg_push_proposal_status
    AFTER UPDATE OF status ON public.proposals
    FOR EACH ROW
    EXECUTE FUNCTION notify_push_proposal_status();
