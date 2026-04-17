-- ============================================================================
-- MIGRATION: Skip self-assign notification (robusto)
-- Date: 2026-04-17
--
-- BUG: 20260401 já tentou evitar a notificação quando o próprio usuário cria
-- o card para si mesmo. A condição era `NEW.created_by = NEW.dono_atual_id`,
-- mas nenhum caminho de criação (frontend web, mobile, import) populava
-- `cards.created_by`. Todos os cards recentes ficam com `created_by = NULL`,
-- portanto o skip nunca disparava e o criador sempre recebia o toast/push.
--
-- FIX:
-- 1. Trigger BEFORE INSERT em cards que popula `created_by` com `auth.uid()`
--    quando NULL. Service role / webhooks (sem JWT) continuam com NULL, o
--    que preserva o comportamento correto de notificar o dono real nesses
--    cenários.
-- 2. Atualiza as duas funções de notificação para usarem `COALESCE(auth.uid(),
--    NEW.created_by)` como ator. Isso cobre também o caso em que o usuário
--    cria sem dono e depois se atribui (UPDATE), sem quebrar os cenários
--    legítimos de transferência feita por outra pessoa.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. BEFORE INSERT trigger para popular cards.created_by
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_set_card_created_by()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NULL THEN
        NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_set_card_created_by ON public.cards;
CREATE TRIGGER trg_auto_set_card_created_by
    BEFORE INSERT ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_card_created_by();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. notify_teams_on_card_assign: skip quando ator = dono (INSERT ou UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_teams_on_card_assign()
RETURNS TRIGGER AS $$
DECLARE
    v_n8n_url TEXT;
    v_teams_url TEXT;
    v_enabled TEXT;
    v_dono_email TEXT;
    v_dono_teams_enabled BOOLEAN;
    v_actor UUID;
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

    -- Skip notificação quando o próprio usuário se atribui (cria ou transfere pra si)
    v_actor := COALESCE(auth.uid(), NEW.created_by);
    IF v_actor IS NOT NULL AND v_actor = NEW.dono_atual_id THEN
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

    IF v_dono_teams_enabled IS NOT TRUE OR v_dono_email IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_enabled FROM integration_settings WHERE key = 'TEAMS_NOTIFY_ENABLED';
    IF v_enabled IS DISTINCT FROM 'true' THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_n8n_url FROM integration_settings WHERE key = 'TEAMS_N8N_WEBHOOK_URL';
    SELECT value INTO v_teams_url FROM integration_settings WHERE key = 'TEAMS_WEBHOOK_URL';

    IF v_n8n_url IS NULL THEN
        RAISE WARNING '[teams_notify] TEAMS_N8N_WEBHOOK_URL not found';
        RETURN NEW;
    END IF;

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
-- 3. notify_push_lead_assigned: mesma regra
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_push_lead_assigned()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
    v_actor UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.dono_atual_id IS NOT DISTINCT FROM NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    IF NEW.dono_atual_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip push quando o próprio usuário se atribui (cria ou transfere pra si)
    v_actor := COALESCE(auth.uid(), NEW.created_by);
    IF v_actor IS NOT NULL AND v_actor = NEW.dono_atual_id THEN
        RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[push_notify] service_role_key not found in vault';
        RETURN NEW;
    END IF;

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
