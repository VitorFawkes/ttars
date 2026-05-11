CREATE OR REPLACE FUNCTION public.log_tarefa_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.card_id,
            'task_created',
            'Tarefa criada: ' || NEW.titulo,
            jsonb_build_object(
                'task_id', NEW.id,
                'titulo', NEW.titulo,
                'prioridade', NEW.prioridade,
                'data_vencimento', NEW.data_vencimento,
                'tipo', NEW.tipo,
                'participantes_externos', NEW.participantes_externos,
                'categoria_outro', NEW.categoria_outro
            ),
            COALESCE(NEW.created_by, auth.uid())
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Soft Delete (deleted_at changed from NULL to NOT NULL)
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
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

        -- Tarefa concluída
        IF OLD.concluida = false AND NEW.concluida = true THEN
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_completed',
                'Tarefa concluída: ' || NEW.titulo,
                jsonb_build_object(
                    'task_id', NEW.id, 
                    'titulo', NEW.titulo,
                    'resultado', NEW.resultado,
                    'feedback', NEW.feedback,
                    'motivo_cancelamento', NEW.motivo_cancelamento,
                    'rescheduled_to_id', NEW.rescheduled_to_id
                ),
                auth.uid()
            );
        -- Tarefa reaberta
        ELSIF OLD.concluida = true AND NEW.concluida = false THEN
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_reopened',
                'Tarefa reaberta: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo),
                auth.uid()
            );
        -- Tarefa editada (título ou descrição ou outros campos importantes)
        ELSIF OLD.titulo IS DISTINCT FROM NEW.titulo 
           OR OLD.descricao IS DISTINCT FROM NEW.descricao 
           OR OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento
           OR OLD.participantes_externos IS DISTINCT FROM NEW.participantes_externos
        THEN
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_updated',
                'Tarefa editada: ' || NEW.titulo,
                jsonb_build_object(
                    'task_id', NEW.id, 
                    'titulo', NEW.titulo,
                    'changes', jsonb_build_object(
                        'titulo', CASE WHEN OLD.titulo IS DISTINCT FROM NEW.titulo THEN NEW.titulo ELSE NULL END,
                        'descricao', CASE WHEN OLD.descricao IS DISTINCT FROM NEW.descricao THEN NEW.descricao ELSE NULL END,
                        'data_vencimento', CASE WHEN OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento THEN NEW.data_vencimento ELSE NULL END,
                        'participantes_externos', CASE WHEN OLD.participantes_externos IS DISTINCT FROM NEW.participantes_externos THEN NEW.participantes_externos ELSE NULL END
                    )
                ),
                auth.uid()
            );
        END IF;
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
$function$
