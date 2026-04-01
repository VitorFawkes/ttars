-- ============================================================================
-- MIGRATION: Skip self-assign notification on card creation
-- Date: 2026-04-01
--
-- Quando o próprio usuário cria o card para si mesmo, não dispara notificação
-- "lead_assigned". Notifica apenas quando outra pessoa atribui ou transfere.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Fix notify_teams_on_card_assign: skip self-assign on INSERT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_teams_on_card_assign()
RETURNS TRIGGER AS $$
DECLARE
    v_n8n_url TEXT;
    v_teams_url TEXT;
    v_enabled TEXT;
    v_dono_email TEXT;
    v_dono_teams_enabled BOOLEAN;
BEGIN
    -- Só dispara se dono_atual_id mudou
    IF TG_OP = 'UPDATE' AND OLD.dono_atual_id IS NOT DISTINCT FROM NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- Sem dono = sem notificação
    IF NEW.dono_atual_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verificar se tipo está habilitado na config admin
    IF NOT EXISTS (
        SELECT 1 FROM notification_type_config
        WHERE type_key = 'lead_assigned' AND enabled = true
    ) THEN
        RETURN NEW;
    END IF;

    -- Skip notificação quando o próprio usuário cria o card para si mesmo
    IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL AND NEW.created_by = NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    -- ============================================================
    -- SEMPRE inserir notificação in-app (todos os produtos)
    -- ============================================================
    INSERT INTO notifications (user_id, type, title, body, url)
    VALUES (
        NEW.dono_atual_id,
        'lead_assigned',
        'Novo lead atribuído',
        'Card "' || COALESCE(NEW.titulo, 'Sem título') || '" foi atribuído a você',
        '/cards/' || NEW.id::TEXT
    );

    -- ============================================================
    -- Teams: verificar se dono tem Teams habilitado
    -- ============================================================
    SELECT email, teams_notify_enabled
    INTO v_dono_email, v_dono_teams_enabled
    FROM profiles WHERE id = NEW.dono_atual_id;

    -- Skip Teams se desabilitado ou sem email
    IF v_dono_teams_enabled IS NOT TRUE OR v_dono_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Verificar se integração Teams está habilitada globalmente
    SELECT value INTO v_enabled FROM integration_settings WHERE key = 'TEAMS_NOTIFY_ENABLED';
    IF v_enabled IS DISTINCT FROM 'true' THEN
        RETURN NEW;
    END IF;

    -- Buscar URLs
    SELECT value INTO v_n8n_url FROM integration_settings WHERE key = 'TEAMS_N8N_WEBHOOK_URL';
    SELECT value INTO v_teams_url FROM integration_settings WHERE key = 'TEAMS_WEBHOOK_URL';

    IF v_n8n_url IS NULL THEN
        RAISE WARNING '[teams_notify] TEAMS_N8N_WEBHOOK_URL not found';
        RETURN NEW;
    END IF;

    -- Chamada async via pg_net para o n8n (com email do dono)
    PERFORM net.http_post(
        url := v_n8n_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
            'card_id', NEW.id::TEXT,
            'dono_id', NEW.dono_atual_id::TEXT,
            'dono_email', v_dono_email,
            'titulo', COALESCE(NEW.titulo, 'Sem título'),
            'teams_webhook_url', v_teams_url
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[teams_notify] error: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Fix notify_push_lead_assigned: skip self-assign on INSERT
-- ═══════════════════════════════════════════════════════════════════════════

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

    -- Skip notificação quando o próprio usuário cria o card para si mesmo
    IF TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL AND NEW.created_by = NEW.dono_atual_id THEN
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
