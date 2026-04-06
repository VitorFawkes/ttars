-- H3-030: Notificações por email (opt-in por usuário)
--
-- Estratégia: ao inserir uma row em notifications (in-app), um trigger verifica
-- as preferências de email do usuário e dispara um email via pg_net → Edge
-- Function send-email.
--
-- Preferências por usuário:
--   - email_notifications_enabled (global on/off)
--   - notification_types JSONB — quais tipos disparam email
--
-- Tipos suportados (correspondem a notifications.type):
--   - lead_assigned        : card atribuído ao usuário
--   - task_due             : tarefa com prazo próximo
--   - task_overdue         : tarefa atrasada
--   - proposal_status      : mudança de status de proposta
--   - meeting_upcoming     : reunião próxima

-- =============================================================================
-- 1. Tabela de preferências
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id),
    email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notification_types JSONB NOT NULL DEFAULT '{"lead_assigned": true, "task_due": true, "task_overdue": true, "proposal_status": false, "meeting_upcoming": true}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notif_prefs_user_id ON email_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notif_prefs_org_id ON email_notification_preferences(org_id);

ALTER TABLE email_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_notif_prefs_self_read" ON email_notification_preferences;
DROP POLICY IF EXISTS "email_notif_prefs_self_write" ON email_notification_preferences;
DROP POLICY IF EXISTS "email_notif_prefs_service_all" ON email_notification_preferences;

CREATE POLICY "email_notif_prefs_self_read" ON email_notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "email_notif_prefs_self_write" ON email_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND org_id = requesting_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = requesting_org_id());

CREATE POLICY "email_notif_prefs_service_all" ON email_notification_preferences
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- =============================================================================
-- 2. Trigger: envia email ao inserir notification
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_email_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_pref RECORD;
    v_user_email TEXT;
    v_user_name TEXT;
    v_type_enabled BOOLEAN;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_template_key TEXT;
    v_variables JSONB;
BEGIN
    -- Buscar preferências do usuário (ou defaults implicitos)
    SELECT p.email, p.nome, enp.email_notifications_enabled, enp.notification_types
    INTO v_user_email, v_user_name, v_pref.email_notifications_enabled, v_pref.notification_types
    FROM profiles p
    LEFT JOIN email_notification_preferences enp ON enp.user_id = p.id
    WHERE p.id = NEW.user_id;

    -- Se usuário não tem email ou opt-out total, para aqui
    IF v_user_email IS NULL OR COALESCE(v_pref.email_notifications_enabled, TRUE) = FALSE THEN
        RETURN NEW;
    END IF;

    -- Verificar se o tipo específico está habilitado
    -- Se não existe pref explícita para o tipo, assume default do esquema (TRUE para maioria)
    v_type_enabled := COALESCE(
        (v_pref.notification_types ->> NEW.type)::BOOLEAN,
        CASE NEW.type
            WHEN 'lead_assigned' THEN TRUE
            WHEN 'task_due' THEN TRUE
            WHEN 'task_overdue' THEN TRUE
            WHEN 'meeting_upcoming' THEN TRUE
            WHEN 'proposal_status' THEN FALSE
            ELSE FALSE
        END
    );

    IF NOT v_type_enabled THEN
        RETURN NEW;
    END IF;

    -- Mapear type → template_key + variables
    -- Usa um template genérico "raw" para simplificar
    v_template_key := NULL; -- vamos usar subject/html/text direto

    -- URLs do Supabase (necessárias para pg_net)
    BEGIN
        v_supabase_url := current_setting('app.supabase_url', false);
    EXCEPTION WHEN OTHERS THEN
        v_supabase_url := 'https://szyrzxvlptqqheizyrxu.supabase.co';
    END;

    BEGIN
        v_service_role_key := current_setting('app.service_role_key', false);
    EXCEPTION WHEN OTHERS THEN
        -- Sem service_role_key definido, não consegue chamar send-email
        RETURN NEW;
    END;

    -- Montar variáveis do template
    v_variables := jsonb_build_object(
        'user_name', COALESCE(v_user_name, 'usuário'),
        'notification_title', NEW.title,
        'notification_body', NEW.body,
        'notification_url', CASE WHEN NEW.url IS NOT NULL THEN v_supabase_url || NEW.url ELSE v_supabase_url END
    );

    -- Chamar send-email via pg_net (async, não bloqueia INSERT)
    PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
        ),
        body := jsonb_build_object(
            'to', v_user_email,
            'subject', NEW.title,
            'html', '<h2>' || NEW.title || '</h2><p>' || COALESCE(NEW.body, '') || '</p>' ||
                    CASE WHEN NEW.url IS NOT NULL THEN '<p><a href="' || v_supabase_url || NEW.url || '">Abrir no WelcomeCRM</a></p>' ELSE '' END,
            'text', NEW.title || E'\n\n' || COALESCE(NEW.body, '')
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Não bloquear o insert de notification se email falhar
    RAISE WARNING 'notify_email_on_notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trg_notify_email_on_notification ON notifications;
CREATE TRIGGER trg_notify_email_on_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_email_on_notification();
