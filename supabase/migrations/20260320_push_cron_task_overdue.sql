-- ============================================================================
-- Push Notification Cron: Tarefas atrasadas (passaram do prazo)
-- Complementa check_expiring_tasks_push() que cobre "vence em 60min"
-- ============================================================================

CREATE OR REPLACE FUNCTION check_overdue_tasks_push()
RETURNS void AS $$
DECLARE
    v_service_key TEXT;
    v_task RECORD;
BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[push_overdue] service_role_key not found in vault';
        RETURN;
    END IF;

    -- Tarefas que já venceram, não concluídas, não notificadas
    FOR v_task IN
        SELECT t.responsavel_id, t.id, t.titulo, t.card_id,
               c.titulo AS card_titulo
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        WHERE t.concluida = false
          AND t.deleted_at IS NULL
          AND t.notificada_push = false
          AND t.data_vencimento < now()
          AND t.responsavel_id IS NOT NULL
    LOOP
        PERFORM net.http_post(
            url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_ids', jsonb_build_array(v_task.responsavel_id::TEXT),
                'title', 'Tarefa atrasada',
                'body', '"' || COALESCE(v_task.titulo, 'Tarefa') || '" em "' || COALESCE(v_task.card_titulo, '') || '" está atrasada',
                'url', '/cards/' || v_task.card_id::TEXT,
                'type', 'task_overdue'
            )
        );

        UPDATE tarefas SET notificada_push = true WHERE id = v_task.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- Cron: cada 30min, 9h-18h BRT (12-21h UTC), segunda a sexta
SELECT cron.schedule(
    'push-overdue-tasks',
    '*/30 12-21 * * 1-5',
    'SELECT check_overdue_tasks_push()'
);
