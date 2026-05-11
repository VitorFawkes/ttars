-- 1. Drop duplicated/old triggers to ensure clean slate
DROP TRIGGER IF EXISTS tarefa_activity_trigger ON tarefas;
DROP TRIGGER IF EXISTS task_activity_trigger ON tarefas;
DROP TRIGGER IF EXISTS log_tarefas_trigger ON tarefas;

-- 2. Create the consolidated logging function for Tasks
CREATE OR REPLACE FUNCTION log_tarefa_consolidated()
RETURNS TRIGGER AS $$
DECLARE
    activity_type TEXT;
    activity_desc TEXT;
    payload JSONB;
BEGIN
    -- Determine activity type and description
    IF TG_OP = 'INSERT' THEN
        IF NEW.tipo = 'reuniao' THEN
            activity_type := 'meeting_created';
            activity_desc := 'Reunião agendada: ' || NEW.titulo;
        ELSE
            activity_type := 'task_created';
            activity_desc := 'Tarefa criada: ' || NEW.titulo;
        END IF;

        payload := jsonb_build_object(
            'task_id', NEW.id,
            'titulo', NEW.titulo,
            'tipo', NEW.tipo,
            'data_vencimento', NEW.data_vencimento
        );

    ELSIF TG_OP = 'UPDATE' THEN
        -- Task/Meeting Completed
        IF OLD.concluida = false AND NEW.concluida = true THEN
            -- Check if it was rescheduled (metadata flag)
            IF (NEW.metadata->>'reagendada')::boolean = true THEN
                -- We might want to skip logging here if the reschedule RPC logs it,
                -- OR log it specifically as "Rescheduled" (handled by RPC usually).
                -- For now, let's allow "Completed" log unless we handle it in RPC.
                -- Actually, if we use the RPC, we can insert the log there and return NULL here?
                -- But triggers fire on UPDATE.
                -- Let's log it as completed for now, or ignore if we want the RPC to handle the specific "Rescheduled" log.
                RETURN NEW;
            END IF;

            activity_type := 'task_completed';
            activity_desc := 'Concluído: ' || NEW.titulo;
            payload := jsonb_build_object('task_id', NEW.id);

        -- Task/Meeting Reopened
        ELSIF OLD.concluida = true AND NEW.concluida = false THEN
            activity_type := 'task_reopened';
            activity_desc := 'Reaberto: ' || NEW.titulo;
            payload := jsonb_build_object('task_id', NEW.id);

        -- Edited
        ELSIF OLD.titulo IS DISTINCT FROM NEW.titulo OR OLD.descricao IS DISTINCT FROM NEW.descricao OR OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento THEN
             -- Avoid logging if just metadata changed (often happens during reschedule links)
            activity_type := 'task_updated';
            activity_desc := 'Atualizado: ' || NEW.titulo;
            payload := jsonb_build_object(
                'task_id', NEW.id,
                'changes', jsonb_build_object(
                    'titulo', CASE WHEN OLD.titulo != NEW.titulo THEN NEW.titulo ELSE NULL END,
                    'data', CASE WHEN OLD.data_vencimento != NEW.data_vencimento THEN NEW.data_vencimento ELSE NULL END
                )
            );
        ELSE
            RETURN NEW;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        activity_type := 'task_deleted';
        activity_desc := 'Excluído: ' || OLD.titulo;
        payload := jsonb_build_object('task_id', OLD.id);
    END IF;

    -- Insert into activities
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        COALESCE(NEW.card_id, OLD.card_id),
        activity_type,
        activity_desc,
        payload,
        auth.uid()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply the trigger
CREATE TRIGGER log_tarefas_consolidated_trigger
AFTER INSERT OR UPDATE OR DELETE ON tarefas
FOR EACH ROW EXECUTE FUNCTION log_tarefa_consolidated();


-- 4. Create the Reschedule RPC
CREATE OR REPLACE FUNCTION reschedule_task(
    original_task_id UUID,
    new_date TIMESTAMPTZ,
    new_responsable_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    original_task RECORD;
    new_task_id UUID;
    v_responsable_id UUID;
BEGIN
    -- 1. Get original task
    SELECT * INTO original_task FROM tarefas WHERE id = original_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tarefa não encontrada';
    END IF;

    v_responsable_id := COALESCE(new_responsable_id, original_task.responsavel_id);

    -- 2. Mark original as completed/rescheduled
    -- We set metadata first to avoid trigger logging "Completed" blindly if we added that check
    UPDATE tarefas
    SET
        concluida = true,
        status = 'concluida',
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{reagendada}',
            'true'
        ) || jsonb_build_object('reagendada_em', now())
    WHERE id = original_task_id;

    -- 3. Create new task
    INSERT INTO tarefas (
        card_id,
        titulo,
        descricao,
        tipo,
        data_vencimento,
        responsavel_id,
        status,
        concluida,
        created_by,
        metadata
    ) VALUES (
        original_task.card_id,
        original_task.titulo,
        original_task.descricao,
        original_task.tipo,
        new_date,
        v_responsable_id,
        'pendente',
        false,
        auth.uid(),
        COALESCE(original_task.metadata, '{}'::jsonb)
        || jsonb_build_object('reagendada_de', original_task_id)
        - 'reagendada'
        - 'reagendada_em'
    ) RETURNING id INTO new_task_id;

    -- 4. Update original with link to new
    UPDATE tarefas
    SET metadata = metadata || jsonb_build_object('reagendada_para', new_task_id)
    WHERE id = original_task_id;

    -- 5. Log activity
    -- We log manually here to be specific
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        original_task.card_id,
        'task_rescheduled',
        'Reagendamento: ' || original_task.titulo,
        jsonb_build_object(
            'original_task_id', original_task_id,
            'new_task_id', new_task_id,
            'old_date', original_task.data_vencimento,
            'new_date', new_date
        ),
        auth.uid()
    );

    RETURN new_task_id;
END;
$$;
