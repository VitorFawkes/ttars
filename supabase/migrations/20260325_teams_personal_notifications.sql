-- ============================================================================
-- Teams Personal Notifications + In-App Notification Feed
-- 1. Adiciona teams_notify_enabled em profiles (default false, ativo só Juliana)
-- 2. Cria tabela notifications para feed in-app
-- 3. Atualiza trigger para checar flag + enviar email do dono + inserir notification
-- ============================================================================

-- 1. Coluna de toggle Teams por usuário
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teams_notify_enabled BOOLEAN DEFAULT false;
COMMENT ON COLUMN profiles.teams_notify_enabled IS 'Habilita notificações Teams 1:1 para este usuário';

-- Ativar apenas para Juliana
UPDATE profiles SET teams_notify_enabled = true
WHERE id = 'dc2bbd1e-aa00-493f-ba0d-bd5190a7a650';

-- 2. Tabela de notificações in-app
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'lead_assigned',
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- RLS: usuário só vê suas próprias notificações
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role pode inserir (triggers usam SECURITY DEFINER)
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- 3. Atualizar function do trigger Teams
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

    -- Só TRIPS
    IF NEW.produto IS NULL OR NEW.produto::TEXT != 'TRIPS' THEN
        RETURN NEW;
    END IF;

    -- ============================================================
    -- SEMPRE inserir notificação in-app (independente do Teams)
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

-- Trigger já existe, só recria para garantir
DROP TRIGGER IF EXISTS trg_notify_teams_on_assign ON public.cards;

CREATE TRIGGER trg_notify_teams_on_assign
    AFTER INSERT OR UPDATE OF dono_atual_id ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION notify_teams_on_card_assign();
