-- Migration: Fix Meeting Logic and Duplication
-- Timestamp: 20251224163000
-- 1. Drop ALL potential triggers on 'tarefas' to ensure no duplication
DROP TRIGGER IF EXISTS tarefa_activity_trigger ON tarefas;
DROP TRIGGER IF EXISTS task_activity_trigger ON tarefas;
DROP TRIGGER IF EXISTS log_tarefas_trigger ON tarefas;
DROP TRIGGER IF EXISTS log_tarefas_consolidated_trigger ON tarefas;
DROP TRIGGER IF EXISTS log_tarefa_activity_trigger ON tarefas;
DROP TRIGGER IF EXISTS tarefa_activity_trigger_v2 ON tarefas;
-- 2. Create a consolidated and robust logging function
CREATE OR REPLACE FUNCTION log_tarefa_activity_v2() RETURNS TRIGGER AS $$
DECLARE activity_type TEXT;
activity_desc TEXT;
payload JSONB;
BEGIN -- ========================================================================
-- INSERT
-- ========================================================================
IF TG_OP = 'INSERT' THEN -- Only log creation if it's NOT a result of rescheduling
IF NEW.rescheduled_from_id IS NULL THEN IF NEW.tipo = 'reuniao' THEN activity_type := 'meeting_created';
activity_desc := 'Reunião agendada: ' || NEW.titulo;
ELSE activity_type := 'task_created';
activity_desc := 'Tarefa criada: ' || NEW.titulo;
END IF;
payload := jsonb_build_object(
    'task_id',
    NEW.id,
    'titulo',
    NEW.titulo,
    'tipo',
    NEW.tipo,
    'data_vencimento',
    NEW.data_vencimento,
    'prioridade',
    NEW.prioridade
);
-- Insert Activity
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        NEW.card_id,
        activity_type,
        activity_desc,
        payload,
        COALESCE(NEW.created_by, auth.uid())
    );
END IF;
-- ========================================================================
-- UPDATE
-- ========================================================================
ELSIF TG_OP = 'UPDATE' THEN -- 1. Check for Soft Delete
IF OLD.deleted_at IS NULL
AND NEW.deleted_at IS NOT NULL THEN
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        NEW.card_id,
        'task_deleted',
        'Tarefa excluída: ' || NEW.titulo,
        jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
        auth.uid()
    );
RETURN NEW;
END IF;
-- 2. Task Completed OR Rescheduled
IF OLD.concluida = false
AND NEW.concluida = true THEN -- Check for Reschedule (via ID link OR status OR metadata)
IF NEW.rescheduled_to_id IS NOT NULL
OR NEW.status = 'reagendada'
OR (NEW.metadata->>'reagendada')::boolean = true THEN activity_type := 'task_rescheduled';
activity_desc := 'Tarefa reagendada: ' || NEW.titulo;
payload := jsonb_build_object(
    'task_id',
    NEW.id,
    'titulo',
    NEW.titulo,
    'rescheduled_to_id',
    NEW.rescheduled_to_id,
    'new_date',
    (
        SELECT data_vencimento
        FROM tarefas
        WHERE id = NEW.rescheduled_to_id
    )
);
ELSE activity_type := 'task_completed';
            -- Format description based on outcome if present
            IF NEW.resultado IS NOT NULL THEN
                activity_desc := 'Reunião ' || NEW.resultado || ': ' || NEW.titulo;
            ELSE
                activity_desc := 'Tarefa concluída: ' || NEW.titulo;
            END IF;
            payload := jsonb_build_object(
                'task_id',
                NEW.id,
                'titulo',
                NEW.titulo,
                'resultado',
                NEW.resultado,
                'feedback',
                NEW.feedback
            );
        END IF;
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        NEW.card_id,
        activity_type,
        activity_desc,
        payload,
        auth.uid()
    );
-- 3. Task Reopened
ELSIF OLD.concluida = true
AND NEW.concluida = false THEN
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        NEW.card_id,
        'task_reopened',
        'Tarefa reaberta: ' || NEW.titulo,
        jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
        auth.uid()
    );
-- 4. Task Edited (Title, Description, Date)
ELSIF OLD.titulo IS DISTINCT
FROM NEW.titulo
    OR OLD.descricao IS DISTINCT
FROM NEW.descricao
    OR OLD.data_vencimento IS DISTINCT
FROM NEW.data_vencimento THEN -- Avoid logging if just metadata changed (often happens during reschedule links)
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        NEW.card_id,
        'task_updated',
        'Tarefa atualizada: ' || NEW.titulo,
        jsonb_build_object(
            'task_id',
            NEW.id,
            'changes',
            jsonb_build_object(
                'titulo',
                CASE
                    WHEN OLD.titulo IS DISTINCT
                    FROM NEW.titulo THEN NEW.titulo
                        ELSE NULL
                END,
                'descricao',
                CASE
                    WHEN OLD.descricao IS DISTINCT
                    FROM NEW.descricao THEN NEW.descricao
                        ELSE NULL
                END,
                'data_vencimento',
                CASE
                    WHEN OLD.data_vencimento IS DISTINCT
                    FROM NEW.data_vencimento THEN NEW.data_vencimento
                        ELSE NULL
                END
            )
        ),
        auth.uid()
    );
END IF;
-- ========================================================================
-- DELETE
-- ========================================================================
ELSIF TG_OP = 'DELETE' THEN
INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
VALUES (
        OLD.card_id,
        'task_deleted',
        'Tarefa excluída: ' || OLD.titulo,
        jsonb_build_object('task_id', OLD.id, 'titulo', OLD.titulo),
        auth.uid()
    );
RETURN OLD;
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 3. Create the single authoritative trigger
CREATE TRIGGER tarefa_activity_trigger_v2
AFTER
INSERT
    OR
UPDATE
    OR DELETE ON tarefas FOR EACH ROW EXECUTE FUNCTION log_tarefa_activity_v2();