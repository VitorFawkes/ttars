-- ============================================================================
-- Push Notification Cron: Lembrete de reunião (30 min antes)
-- ============================================================================

-- Coluna para evitar notificações duplicadas
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS notificada_push BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION check_upcoming_meetings_push()
RETURNS void AS $$
DECLARE
    v_service_key TEXT;
    v_meeting RECORD;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[push_meetings] service_role_key not found in vault';
        RETURN;
    END IF;

    -- Reuniões que começam nos próximos 30 minutos, não notificadas
    FOR v_meeting IN
        SELECT r.responsavel_id, r.id, r.titulo, r.card_id,
               c.titulo AS card_titulo
        FROM reunioes r
        JOIN cards c ON c.id = r.card_id
        WHERE r.deleted_at IS NULL
          AND r.notificada_push = false
          AND r.data_inicio BETWEEN now() AND now() + interval '30 minutes'
          AND r.responsavel_id IS NOT NULL
    LOOP
        PERFORM net.http_post(
            url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_ids', jsonb_build_array(v_meeting.responsavel_id::TEXT),
                'title', 'Reunião em breve',
                'body', '"' || COALESCE(v_meeting.titulo, 'Reunião') || '" em "' || COALESCE(v_meeting.card_titulo, '') || '" começa em 30 min',
                'url', '/cards/' || v_meeting.card_id::TEXT,
                'type', 'meeting_reminder'
            )
        );

        UPDATE reunioes SET notificada_push = true WHERE id = v_meeting.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Cron: cada 10min, 9h-18h BRT (12-21h UTC), segunda a sexta
SELECT cron.schedule(
    'push-meeting-reminder',
    '*/10 12-21 * * 1-5',
    'SELECT check_upcoming_meetings_push()'
);
