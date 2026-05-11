-- ============================================================================
-- Teams Notification Trigger: Card TRIPS atribuído
-- Dispara webhook n8n quando dono_atual_id muda em cards TRIPS
-- Padrão: pg_net + vault + integration_settings (igual push_lead_assigned)
-- ============================================================================

-- Garantir que integration_settings existe (pode não existir em staging)
CREATE TABLE IF NOT EXISTS integration_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir URLs nas settings (idempotente)
INSERT INTO integration_settings (key, value, description)
VALUES
  ('TEAMS_N8N_WEBHOOK_URL', 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/teams-notify', 'URL do webhook n8n que dispara notificação Teams'),
  ('TEAMS_WEBHOOK_URL', 'https://default3401294a285d4dd5abb58e316d3c59.2c.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f693ba7bbd8d48239bfaf3f8614c7c47/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=u0BaQJLe583iiMu6_Vw12odXdP2vSMZuhATRcI7Tqp4', 'URL do webhook Teams chat (Power Automate Workflows)'),
  ('TEAMS_NOTIFY_ENABLED', 'true', 'Habilita notificações Teams')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Function
CREATE OR REPLACE FUNCTION notify_teams_on_card_assign()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
    v_n8n_url TEXT;
    v_teams_url TEXT;
    v_enabled TEXT;
BEGIN
    -- Só dispara se dono_atual_id mudou
    IF TG_OP = 'UPDATE' AND OLD.dono_atual_id IS NOT DISTINCT FROM NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- Sem dono = sem notificação
    IF NEW.dono_atual_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Só TRIPS
    IF NEW.produto IS NULL OR NEW.produto::TEXT != 'TRIPS' THEN
        RETURN NEW;
    END IF;

    -- Verificar se está habilitado
    SELECT value INTO v_enabled FROM integration_settings WHERE key = 'TEAMS_NOTIFY_ENABLED';
    IF v_enabled IS DISTINCT FROM 'true' THEN
        RETURN NEW;
    END IF;

    -- Buscar URLs
    SELECT value INTO v_n8n_url FROM integration_settings WHERE key = 'TEAMS_N8N_WEBHOOK_URL';
    SELECT value INTO v_teams_url FROM integration_settings WHERE key = 'TEAMS_WEBHOOK_URL';

    IF v_n8n_url IS NULL THEN
        RAISE WARNING '[teams_notify] TEAMS_N8N_WEBHOOK_URL not found in integration_settings';
        RETURN NEW;
    END IF;

    -- Chamada async via pg_net para o n8n
    PERFORM net.http_post(
        url := v_n8n_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
            'card_id', NEW.id::TEXT,
            'dono_id', NEW.dono_atual_id::TEXT,
            'titulo', COALESCE(NEW.titulo, 'Sem título'),
            'teams_webhook_url', v_teams_url
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[teams_notify] pg_net call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Trigger
DROP TRIGGER IF EXISTS trg_notify_teams_on_assign ON public.cards;

CREATE TRIGGER trg_notify_teams_on_assign
    AFTER INSERT OR UPDATE OF dono_atual_id ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION notify_teams_on_card_assign();
