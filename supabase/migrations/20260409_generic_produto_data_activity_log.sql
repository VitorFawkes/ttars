-- ============================================================
-- Migration: Rastrear TODAS as mudanças em produto_data no feed de atividades
-- Problema: trigger antigo só rastreava 5 campos (epoca_viagem, destinos,
--           pessoas, orcamento, observacoes_criticas). Campos como
--           numero_venda_monde ficavam invisíveis.
-- Solução: iteração genérica sobre TODAS as chaves de produto_data,
--          com lookup de label em system_fields para descrição legível.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_card_update_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_activities jsonb[] := '{}';
    v_old_stage_name text;
    v_new_stage_name text;
    v_user_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
    v_activity jsonb;
    v_is_ai_update boolean := false;
    v_source_tag jsonb;
    -- Generic produto_data iteration
    v_key text;
    v_all_keys text[];
    v_old_val text;
    v_new_val text;
    v_field_label text;
    v_tipo text;
    v_descricao text;
    -- Known key→type mapping (backward compat)
    v_known_types jsonb := '{
        "epoca_viagem": "period_changed",
        "destinos": "destination_changed",
        "pessoas": "traveler_changed",
        "orcamento": "budget_changed",
        "observacoes_criticas": "notes_changed"
    }'::jsonb;
    -- Known key→description mapping
    v_known_desc jsonb := '{
        "epoca_viagem": "Época da viagem alterada",
        "destinos": "Destinos alterados",
        "pessoas": "Viajantes alterados",
        "orcamento": "Orçamento alterado",
        "observacoes_criticas": "Informações importantes atualizadas"
    }'::jsonb;
BEGIN
    v_user_id := auth.uid();
    v_old_data := COALESCE(OLD.produto_data, '{}'::jsonb);
    v_new_data := COALESCE(NEW.produto_data, '{}'::jsonb);

    -- Detectar update automático
    v_is_ai_update := (v_user_id IS NULL);
    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN current_setting('app.update_source', true) = 'integration' THEN '{"source":"integration"}'::jsonb
        ELSE '{"source":"ai_agent"}'::jsonb
    END;

    -- 1. Mudança de Etapa
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        SELECT nome INTO v_old_stage_name FROM public.pipeline_stages WHERE id = OLD.pipeline_stage_id;
        SELECT nome INTO v_new_stage_name FROM public.pipeline_stages WHERE id = NEW.pipeline_stage_id;

        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'stage_changed',
            'descricao', 'Card movido de ' || COALESCE(v_old_stage_name, '?') || ' para ' || COALESCE(v_new_stage_name, '?'),
            'metadata', jsonb_build_object(
                'old_stage_id', OLD.pipeline_stage_id,
                'new_stage_id', NEW.pipeline_stage_id,
                'old_stage_name', v_old_stage_name,
                'new_stage_name', v_new_stage_name
            ) || v_source_tag
        ));
    END IF;

    -- 2. Mudança de Dono
    IF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'owner_changed',
            'descricao', 'Responsável alterado',
            'metadata', jsonb_build_object(
                'old_owner_id', OLD.dono_atual_id,
                'new_owner_id', NEW.dono_atual_id
            ) || v_source_tag
        ));
    END IF;

    -- 3. Mudança de Status
    IF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'status_changed',
            'descricao', 'Status alterado para ' || COALESCE(NEW.status_comercial, '?'),
            'metadata', jsonb_build_object(
                'old_status', OLD.status_comercial,
                'new_status', NEW.status_comercial
            ) || v_source_tag
        ));
    END IF;

    -- 4. Mudança de Valor
    IF OLD.valor_final IS DISTINCT FROM NEW.valor_final THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'value_changed',
            'descricao', 'Valor alterado de ' || COALESCE(OLD.valor_final::text, '0') || ' para ' || COALESCE(NEW.valor_final::text, '0'),
            'metadata', jsonb_build_object(
                'old_value', OLD.valor_final,
                'new_value', NEW.valor_final
            ) || v_source_tag
        ));
    END IF;

    -- 5. Mudanças GENÉRICAS em produto_data (TODAS as chaves)
    IF v_old_data IS DISTINCT FROM v_new_data THEN
        -- Coletar TODAS as chaves (union de old + new)
        SELECT array_agg(DISTINCT k) INTO v_all_keys
        FROM (
            SELECT jsonb_object_keys(v_old_data) AS k
            UNION
            SELECT jsonb_object_keys(v_new_data) AS k
        ) keys;

        IF v_all_keys IS NOT NULL THEN
            FOREACH v_key IN ARRAY v_all_keys LOOP
                -- Comparar como TEXT para suportar qualquer tipo (string, number, object, array)
                v_old_val := v_old_data->>v_key;
                v_new_val := v_new_data->>v_key;

                IF v_old_val IS DISTINCT FROM v_new_val THEN
                    -- Verificar se é um campo conhecido (backward compat)
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
                        -- Campo genérico: buscar label em system_fields
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

    -- 6. Mudança de título
    IF OLD.titulo IS DISTINCT FROM NEW.titulo THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'title_changed',
            'descricao', 'Título alterado para ' || COALESCE(NEW.titulo, '?'),
            'metadata', jsonb_build_object(
                'old_title', OLD.titulo,
                'new_title', NEW.titulo
            ) || v_source_tag
        ));
    END IF;

    -- 7. ai_resumo alterado
    IF OLD.ai_resumo IS DISTINCT FROM NEW.ai_resumo THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_summary_updated',
            'descricao', 'Resumo IA atualizado',
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'had_previous', (OLD.ai_resumo IS NOT NULL),
                'char_count', LENGTH(COALESCE(NEW.ai_resumo, ''))
            )
        ));
    END IF;

    -- 8. ai_contexto alterado
    IF OLD.ai_contexto IS DISTINCT FROM NEW.ai_contexto THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_context_updated',
            'descricao', 'Contexto IA atualizado',
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'had_previous', (OLD.ai_contexto IS NOT NULL),
                'char_count', LENGTH(COALESCE(NEW.ai_contexto, ''))
            )
        ));
    END IF;

    -- 9. ai_responsavel alterado (handoff IA <-> humano)
    IF OLD.ai_responsavel IS DISTINCT FROM NEW.ai_responsavel THEN
        v_activities := array_append(v_activities, jsonb_build_object(
            'tipo', 'ai_handoff',
            'descricao', CASE
                WHEN NEW.ai_responsavel = 'humano' THEN 'Conversa transferida para atendimento humano'
                WHEN NEW.ai_responsavel = 'ia' THEN 'Conversa retornada para IA Julia'
                ELSE 'Responsável IA alterado para ' || COALESCE(NEW.ai_responsavel, '?')
            END,
            'metadata', jsonb_build_object(
                'source', 'ai_agent',
                'old_responsavel', OLD.ai_responsavel,
                'new_responsavel', NEW.ai_responsavel
            )
        ));
    END IF;

    -- INSERT ÚNICO de todas as activities (performance)
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
$$;
