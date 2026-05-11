-- ============================================================================
-- Trigger: notifica cadence-engine quando tarefa de cadência é concluída
-- ============================================================================
-- Sem este trigger, a engine nunca sabe que as tarefas do bloco foram
-- concluídas e não avança para o próximo bloco.
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_cadence_task_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_service_key TEXT;
    v_instance_id TEXT;
BEGIN
    -- Só dispara quando concluida muda de false para true
    IF NOT (NEW.concluida = true AND (OLD.concluida IS NULL OR OLD.concluida = false)) THEN
        RETURN NEW;
    END IF;

    -- Só dispara para tarefas que pertencem a uma cadência
    v_instance_id := NEW.metadata->>'cadence_instance_id';
    IF v_instance_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF v_service_key IS NULL THEN
        RAISE WARNING '[cadence_task_outcome] service_role_key not found in vault';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'action', 'process_task_outcome',
            'task_id', NEW.id,
            'outcome', COALESCE(NEW.outcome, 'completed')
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[cadence_task_outcome] pg_net call failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

DROP TRIGGER IF EXISTS trg_cadence_task_outcome ON public.tarefas;

CREATE TRIGGER trg_cadence_task_outcome
    AFTER UPDATE OF concluida ON public.tarefas
    FOR EACH ROW
    EXECUTE FUNCTION notify_cadence_task_completed();
