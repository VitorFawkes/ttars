-- ============================================================================
-- MIGRATION: descrições mais ricas no feed de atividades
-- Date: 2026-05-04
--
-- Auditoria identificou descrições fracas que escondem o "o que aconteceu":
--   - owner_changed: "Responsável alterado" (não diz de quem pra quem)
--   - status_changed: "Status alterado para ?" (não diz status antigo)
--   - task_updated: "Tarefa atualizada: X" (não diz O QUE mudou)
--   - task_rescheduled: "Tarefa reagendada: X" (não diz pra quando)
--   - card_created: "Card criado: X" (não diz em qual etapa)
--
-- Esta migration reescreve as 3 funções de log para:
--   1. Resolver nomes (profiles, pipeline_stages) na descricao
--   2. Incluir old → new no texto humano
--   3. Marcar metadata.source='cron' quando atualização em massa de
--      data_vencimento (para o enrich_activity_actor classificar como
--      integration em vez de system)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. log_card_update_activity — descrições com nomes e contexto
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_card_update_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_activities jsonb[] := '{}';
    v_old_stage_name text;
    v_new_stage_name text;
    v_old_stage_ordem int;
    v_new_stage_ordem int;
    v_is_rework boolean := false;
    v_user_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
    v_is_ai_update boolean := false;
    v_source_tag jsonb;
    v_key text;
    v_all_keys text[];
    v_old_val text;
    v_new_val text;
    v_field_label text;
    v_tipo text;
    v_descricao text;
    v_old_owner_name text;
    v_new_owner_name text;
    v_known_types jsonb := '{
        "epoca_viagem": "period_changed",
        "destinos": "destination_changed",
        "pessoas": "traveler_changed",
        "orcamento": "budget_changed",
        "observacoes_criticas": "notes_changed"
    }'::jsonb;
    v_known_desc jsonb := '{
        "epoca_viagem": "Época da viagem alterada",
        "destinos": "Destinos alterados",
        "pessoas": "Viajantes alterados",
        "orcamento": "Orçamento alterado",
        "observacoes_criticas": "Informações importantes atualizadas"
    }'::jsonb;
    v_skip_keys text[] := ARRAY['numeros_venda_monde_historico'];
BEGIN
    v_user_id := auth.uid();
    v_old_data := COALESCE(OLD.produto_data, '{}'::jsonb);
    v_new_data := COALESCE(NEW.produto_data, '{}'::jsonb);

    v_is_ai_update := (v_user_id IS NULL);
    -- Classificação de origem mais precisa: respeita app.update_source
    -- quando setado, e SÓ assume 'ai_agent' como fallback se humano não
    -- está no contexto E nada explícito foi indicado.
    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN COALESCE(current_setting('app.update_source', true), '') <> ''
            THEN jsonb_build_object('source', current_setting('app.update_source', true))
        ELSE '{}'::jsonb  -- antes defaultava 'ai_agent' — agora deixa enrich_activity_actor classificar como system
    END;

    -- 1. Mudança de Etapa
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        SELECT nome, ordem INTO v_old_stage_name, v_old_stage_ordem
          FROM public.pipeline_stages WHERE id = OLD.pipeline_stage_id;
        SELECT nome, ordem INTO v_new_stage_name, v_new_stage_ordem
          FROM public.pipeline_stages WHERE id = NEW.pipeline_stage_id;

        v_is_rework := (
          v_new_stage_ordem IS NOT NULL
          AND v_old_stage_ordem IS NOT NULL
          AND v_new_stage_ordem < v_old_stage_ordem
        );

        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'stage_changed',
            'descricao', 'Etapa alterada: ' || COALESCE(v_old_stage_name, 'inicio') || ' → ' || COALESCE(v_new_stage_name, 'desconhecida'),
            'metadata', jsonb_build_object(
                'old_stage_id', OLD.pipeline_stage_id,
                'new_stage_id', NEW.pipeline_stage_id,
                'old_stage_name', v_old_stage_name,
                'new_stage_name', v_new_stage_name,
                'old_stage_ordem', v_old_stage_ordem,
                'new_stage_ordem', v_new_stage_ordem,
                'is_rework', v_is_rework
            ) || v_source_tag
        ));
    END IF;

    -- 2. Mudança de Dono — agora resolve nomes
    IF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
        SELECT nome INTO v_old_owner_name FROM public.profiles WHERE id = OLD.dono_atual_id;
        SELECT nome INTO v_new_owner_name FROM public.profiles WHERE id = NEW.dono_atual_id;

        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'owner_changed',
            'descricao', 'Responsável: ' || COALESCE(v_old_owner_name, 'ninguém') || ' → ' || COALESCE(v_new_owner_name, 'ninguém'),
            'metadata', jsonb_build_object(
                'old_owner_id', OLD.dono_atual_id,
                'new_owner_id', NEW.dono_atual_id,
                'old_owner_name', v_old_owner_name,
                'new_owner_name', v_new_owner_name
            ) || v_source_tag
        ));
    END IF;

    -- 3. Mudança de Status — agora inclui antigo
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'status_changed',
            'descricao', 'Status: ' || COALESCE(OLD.status_comercial, 'aberto') || ' → ' || COALESCE(NEW.status_comercial, 'aberto'),
            'metadata', jsonb_build_object(
                'old_status', OLD.status_comercial,
                'new_status', NEW.status_comercial
            ) || v_source_tag
        ));
    END IF;

    -- 4. Mudança de Valor — formato BR + tratamento NULL
    IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'value_changed',
            'descricao', CASE
                WHEN OLD.valor_final IS NULL AND NEW.valor_final IS NOT NULL
                    THEN 'Valor preenchido: R$ ' || to_char(NEW.valor_final, 'FM999G999G990D00')
                WHEN OLD.valor_final IS NOT NULL AND NEW.valor_final IS NULL
                    THEN 'Valor removido (era R$ ' || to_char(OLD.valor_final, 'FM999G999G990D00') || ')'
                ELSE 'Valor: R$ ' || to_char(OLD.valor_final, 'FM999G999G990D00') || ' → R$ ' || to_char(NEW.valor_final, 'FM999G999G990D00')
            END,
            'metadata', jsonb_build_object(
                'old_value', OLD.valor_final,
                'new_value', NEW.valor_final
            ) || v_source_tag
        ));
    END IF;

    -- 5. Mudanças GENÉRICAS em produto_data
    IF v_old_data IS DISTINCT FROM v_new_data THEN
        SELECT array_agg(DISTINCT k) INTO v_all_keys
        FROM (
            SELECT jsonb_object_keys(v_old_data) AS k
            UNION
            SELECT jsonb_object_keys(v_new_data) AS k
        ) keys;

        IF v_all_keys IS NOT NULL THEN
            FOREACH v_key IN ARRAY v_all_keys LOOP
                IF v_key = ANY(v_skip_keys) THEN
                    CONTINUE;
                END IF;

                v_old_val := v_old_data->>v_key;
                v_new_val := v_new_data->>v_key;

                IF v_old_val IS DISTINCT FROM v_new_val THEN
                    IF v_known_types ? v_key THEN
                        v_tipo := v_known_types->>v_key;
                        v_descricao := v_known_desc->>v_key;
                        v_activities := array_append(v_activities, jsonb_build_object(
                            'tipo', v_tipo,
                            'descricao', v_descricao,
                            'metadata', jsonb_build_object(
                                'old', v_old_data->v_key,
                                'new', v_new_data->v_key,
                                'field_key', v_key
                            ) || v_source_tag
                        ));
                    ELSE
                        SELECT label INTO v_field_label
                        FROM public.system_fields
                        WHERE key = v_key
                        LIMIT 1;

                        v_field_label := COALESCE(v_field_label, v_key);

                        v_activities := array_append(v_activities, jsonb_build_object(
                            'tipo', 'field_changed',
                            'descricao', v_field_label || ' alterado',
                            'metadata', jsonb_build_object(
                                'field_key', v_key,
                                'field_label', v_field_label,
                                'old', v_old_data->v_key,
                                'new', v_new_data->v_key
                            ) || v_source_tag
                        ));
                    END IF;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 6. Mudança de título — agora mostra antigo também
    IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'title_changed',
            'descricao', 'Título: ' || COALESCE(OLD.titulo, '(vazio)') || ' → ' || COALESCE(NEW.titulo, '(vazio)'),
            'metadata', jsonb_build_object(
                'old_title', OLD.titulo,
                'new_title', NEW.titulo
            ) || v_source_tag
        ));
    END IF;

    -- 7. ai_resumo
    IF OLD.ai_resumo IS DISTINCT FROM NEW.ai_resumo THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_summary_updated',
            'descricao', 'Resumo da IA atualizado',
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'had_previous', (OLD.ai_resumo IS NOT NULL),
                'char_count', LENGTH(COALESCE(NEW.ai_resumo, ''))
            )
        ));
    END IF;

    -- 8. ai_contexto
    IF OLD.ai_contexto IS DISTINCT FROM NEW.ai_contexto THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_context_updated',
            'descricao', 'Contexto da IA atualizado',
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'had_previous', (OLD.ai_contexto IS NOT NULL),
                'char_count', LENGTH(COALESCE(NEW.ai_contexto, ''))
            )
        ));
    END IF;

    -- 9. ai_responsavel — texto neutro (não cita "Julia")
    IF OLD.ai_responsavel IS DISTINCT FROM NEW.ai_responsavel THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_handoff',
            'descricao', CASE
                WHEN NEW.ai_responsavel = 'humano' THEN 'Conversa transferida para atendimento humano'
                WHEN NEW.ai_responsavel = 'ia' THEN 'Conversa retornada para a IA'
                ELSE 'Responsável da conversa: ' || COALESCE(OLD.ai_responsavel, '?') || ' → ' || COALESCE(NEW.ai_responsavel, '?')
            END,
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'old_responsavel', OLD.ai_responsavel,
                'new_responsavel', NEW.ai_responsavel
            )
        ));
    END IF;

    -- INSERT consolidado
    IF array_length(v_activities, 1) > 0 THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        SELECT
            NEW.id,
            (a->>'tipo')::text,
            (a->>'descricao')::text,
            (a->'metadata')::jsonb,
            v_user_id
        FROM unnest(v_activities) AS a;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_update_activity',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id, 'activities_count', array_length(v_activities, 1))
    );
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- 2. log_tarefa_activity_v2 — descrições mais ricas + marca cron jobs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_tarefa_activity_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_user_id UUID;
    v_activity_type TEXT;
    v_activity_desc TEXT;
    v_payload JSONB;
    v_new_date_str TEXT;
    v_old_date_str TEXT;
    v_changes_count INT := 0;
    v_changes_list TEXT[] := '{}';
    v_source_meta JSONB;
    v_only_data_vencimento BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();

    -- Detecta cron job: update sem usuário autenticado e mudou só data_vencimento
    -- Marca como source='cron' para o enrich_activity_actor classificar como integration
    v_source_meta := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN COALESCE(current_setting('app.update_source', true), '') <> ''
            THEN jsonb_build_object('source', current_setting('app.update_source', true))
        ELSE '{}'::jsonb
    END;

    IF TG_OP = 'INSERT' THEN
        IF NEW.rescheduled_from_id IS NULL THEN
            IF NEW.tipo = 'reuniao' THEN
                v_activity_type := 'meeting_created';
                v_activity_desc := 'Reunião agendada: ' || NEW.titulo;
            ELSE
                v_activity_type := 'task_created';
                v_activity_desc := 'Tarefa criada: ' || NEW.titulo;
            END IF;

            v_payload := jsonb_build_object(
                'task_id', NEW.id,
                'titulo', NEW.titulo,
                'tipo', NEW.tipo,
                'data_vencimento', NEW.data_vencimento,
                'prioridade', NEW.prioridade
            ) || v_source_meta;

            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                v_activity_type,
                v_activity_desc,
                v_payload,
                COALESCE(NEW.created_by, v_user_id)
            );
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Soft delete
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_deleted',
                'Tarefa excluída: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo) || v_source_meta,
                COALESCE(v_user_id, NEW.created_by)
            );
            RETURN NEW;
        END IF;

        -- Concluída ou reagendada
        IF OLD.concluida = false AND NEW.concluida = true THEN
            IF NEW.rescheduled_to_id IS NOT NULL
               OR NEW.status = 'reagendada'
               OR (NEW.metadata->>'reagendada')::boolean = true THEN
                v_activity_type := 'task_rescheduled';
                SELECT to_char(data_vencimento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                  INTO v_new_date_str
                  FROM tarefas WHERE id = NEW.rescheduled_to_id;
                v_activity_desc := 'Tarefa reagendada: ' || NEW.titulo
                  || COALESCE(' → ' || v_new_date_str, '');

                v_payload := jsonb_build_object(
                    'task_id', NEW.id,
                    'titulo', NEW.titulo,
                    'rescheduled_to_id', NEW.rescheduled_to_id,
                    'new_date', (SELECT data_vencimento FROM tarefas WHERE id = NEW.rescheduled_to_id)
                ) || v_source_meta;
            ELSE
                v_activity_type := 'task_completed';
                IF NEW.resultado IS NOT NULL THEN
                    v_activity_desc := 'Reunião ' || NEW.resultado || ': ' || NEW.titulo;
                ELSE
                    v_activity_desc := 'Tarefa concluída: ' || NEW.titulo;
                END IF;
                v_payload := jsonb_build_object(
                    'task_id', NEW.id,
                    'titulo', NEW.titulo,
                    'resultado', NEW.resultado,
                    'feedback', NEW.feedback
                ) || v_source_meta;
            END IF;

            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                v_activity_type,
                v_activity_desc,
                v_payload,
                COALESCE(v_user_id, NEW.created_by)
            );

        ELSIF OLD.concluida = true AND NEW.concluida = false THEN
            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_reopened',
                'Tarefa reaberta: ' || NEW.titulo,
                jsonb_build_object('task_id', NEW.id, 'titulo', NEW.titulo) || v_source_meta,
                COALESCE(v_user_id, NEW.created_by)
            );

        ELSIF OLD.titulo IS DISTINCT FROM NEW.titulo
              OR OLD.descricao IS DISTINCT FROM NEW.descricao
              OR OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento THEN

            -- Construir descrição rica baseada no que mudou
            IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
                v_changes_list := array_append(v_changes_list, 'título');
                v_changes_count := v_changes_count + 1;
            END IF;
            IF OLD.descricao IS DISTINCT FROM NEW.descricao THEN
                v_changes_list := array_append(v_changes_list, 'descrição');
                v_changes_count := v_changes_count + 1;
            END IF;
            IF OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento THEN
                v_changes_list := array_append(v_changes_list, 'data');
                v_changes_count := v_changes_count + 1;
            END IF;

            -- Detecta cron de re-agendamento em massa: só data_vencimento mudou,
            -- sem auth. Marca como source='cron' para enrich classificar.
            v_only_data_vencimento := (
                v_changes_count = 1
                AND v_changes_list[1] = 'data'
                AND v_user_id IS NULL
            );
            IF v_only_data_vencimento AND v_source_meta = '{}'::jsonb THEN
                v_source_meta := '{"source":"cron"}'::jsonb;
            END IF;

            -- Descrição: para mudança de data, mostrar nova data; para outros, listar campos
            IF v_changes_count = 1 AND v_changes_list[1] = 'data' THEN
                v_new_date_str := to_char(NEW.data_vencimento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI');
                v_activity_desc := 'Tarefa "' || NEW.titulo || '" remarcada para ' || v_new_date_str;
            ELSIF v_changes_count = 1 AND v_changes_list[1] = 'título' THEN
                v_activity_desc := 'Título da tarefa: "' || COALESCE(OLD.titulo, '') || '" → "' || COALESCE(NEW.titulo, '') || '"';
            ELSE
                v_activity_desc := 'Tarefa "' || NEW.titulo || '" alterada (' || array_to_string(v_changes_list, ', ') || ')';
            END IF;

            INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'task_updated',
                v_activity_desc,
                jsonb_build_object(
                    'task_id', NEW.id,
                    'changes', jsonb_build_object(
                        'titulo', CASE WHEN OLD.titulo IS DISTINCT FROM NEW.titulo THEN NEW.titulo ELSE NULL END,
                        'descricao', CASE WHEN OLD.descricao IS DISTINCT FROM NEW.descricao THEN NEW.descricao ELSE NULL END,
                        'data_vencimento', CASE WHEN OLD.data_vencimento IS DISTINCT FROM NEW.data_vencimento THEN NEW.data_vencimento ELSE NULL END
                    ),
                    'changes_count', v_changes_count
                ) || v_source_meta,
                COALESCE(v_user_id, NEW.created_by)
            );
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            OLD.card_id,
            'task_deleted',
            'Tarefa excluída: ' || OLD.titulo,
            jsonb_build_object('task_id', OLD.id, 'titulo', OLD.titulo) || v_source_meta,
            COALESCE(v_user_id, OLD.created_by)
        );
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$fn$;

-- ============================================================================
-- 3. log_card_created — incluir nome da etapa inicial
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_card_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID;
    v_stage_name TEXT;
    v_descricao TEXT;
BEGIN
    v_user_id := auth.uid();

    SELECT nome INTO v_stage_name
    FROM public.pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    v_descricao := CASE
        WHEN NEW.titulo IS NOT NULL AND NEW.titulo <> ''
            THEN 'Card criado'
                 || COALESCE(' em "' || v_stage_name || '"', '')
                 || ': ' || NEW.titulo
        ELSE 'Card criado' || COALESCE(' em "' || v_stage_name || '"', '')
    END;

    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
    VALUES (
        NEW.id,
        'card_created',
        v_descricao,
        jsonb_build_object(
            'origem', NEW.origem,
            'lead_entry_path', NEW.lead_entry_path,
            'pipeline_stage_id', NEW.pipeline_stage_id,
            'pipeline_stage_name', v_stage_name
        ),
        v_user_id
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_created',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id)
    );
    RETURN NEW;
END;
$fn$;

COMMIT;
