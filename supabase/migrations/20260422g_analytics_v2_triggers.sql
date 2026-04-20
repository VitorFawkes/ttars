-- Analytics v2 — Fase 0 (Triggers)
-- Plano: /Users/vitorgambetti/.claude/plans/falando-da-aba-de-glimmering-coral.md
--
-- 4 mudancas de trigger:
--   1) trg_set_lead_entry_path       BEFORE INSERT em cards
--   2) trg_set_first_response_at     AFTER INSERT em whatsapp_messages
--   3) trg_update_quality_score      BEFORE INSERT/UPDATE em cards
--   4) log_card_update_activity      REPLACE (enriquece stage_changed metadata com is_rework)
--
-- IMPORTANTE (feedback_function_rebase_cuidado): a funcao log_card_update_activity
-- esta sendo re-criada a partir do codigo ATUAL em producao (pg_get_functiondef
-- em 2026-04-20), inclui fixes das migrations 20260409_generic_produto_data_activity_log
-- e 20260416_fix_monde_historico_activity_label. Se rebase futuro, checar estas
-- migrations antes de sobrescrever.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) lead_entry_path no INSERT
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_lead_entry_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Respeita valor explicito (insert manual com lead_entry_path preenchido)
  IF NEW.lead_entry_path IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.origem = 'indicacao' OR NEW.indicado_por_id IS NOT NULL THEN
    NEW.lead_entry_path := 'referred';
  ELSIF NEW.pessoa_principal_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.cards prev
    WHERE prev.pessoa_principal_id = NEW.pessoa_principal_id
      AND prev.org_id = NEW.org_id
      AND prev.deleted_at IS NULL
      AND (prev.ganho_planner = true OR prev.status_comercial = 'ganho')
  ) THEN
    NEW.lead_entry_path := 'returning';
  ELSIF NEW.sdr_owner_id IS NULL THEN
    NEW.lead_entry_path := 'direct_planner';
  ELSE
    NEW.lead_entry_path := 'full_funnel';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_entry_path ON public.cards;
CREATE TRIGGER trg_set_lead_entry_path
  BEFORE INSERT ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_entry_path();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) first_response_at quando o time manda primeira outbound
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_first_response_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- So interessa outbound com card associado
  IF NEW.direction IS DISTINCT FROM 'outbound' OR NEW.card_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.cards
     SET first_response_at = NEW.created_at
   WHERE id = NEW.card_id
     AND first_response_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_response_at ON public.whatsapp_messages;
CREATE TRIGGER trg_set_first_response_at
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_first_response_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) quality_score_pct recalculado em INSERT/UPDATE
--    Lista inicial de campos-chave (total 100). Fase 2 pode refinar ancorando
--    em stage_field_config por pipeline/etapa.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_quality_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_score INT := 0;
BEGIN
  v_score :=
    CASE WHEN NEW.pessoa_principal_id IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN NEW.origem IS NOT NULL AND NEW.origem <> '' THEN 10 ELSE 0 END +
    CASE WHEN (NEW.valor_final    IS NOT NULL AND NEW.valor_final    > 0)
           OR (NEW.valor_estimado IS NOT NULL AND NEW.valor_estimado > 0) THEN 20 ELSE 0 END +
    CASE WHEN NEW.data_viagem_inicio IS NOT NULL
           OR NEW.epoca_ano          IS NOT NULL
           OR NEW.epoca_tipo         IS NOT NULL THEN 15 ELSE 0 END +
    CASE WHEN jsonb_typeof(NEW.produto_data->'destinos') = 'array'
          AND jsonb_array_length(NEW.produto_data->'destinos') > 0 THEN 15 ELSE 0 END +
    CASE WHEN (NEW.briefing_inicial IS NOT NULL
                AND NEW.briefing_inicial <> '{}'::jsonb
                AND NEW.briefing_inicial <> 'null'::jsonb)
           OR (NEW.produto_data->>'observacoes_criticas' IS NOT NULL
                AND length(trim(NEW.produto_data->>'observacoes_criticas')) > 50) THEN 10 ELSE 0 END +
    CASE WHEN NEW.dono_atual_id IS NOT NULL THEN 10 ELSE 0 END;

  NEW.quality_score_pct := v_score;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_quality_score ON public.cards;
CREATE TRIGGER trg_update_quality_score
  BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.update_quality_score();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) log_card_update_activity REPLACE — enriquece stage_changed metadata
--    com is_rework (new_stage.ordem < old_stage.ordem).
--    Codigo preservado da versao ATUAL em producao (pg_get_functiondef em
--    2026-04-20). Apenas o bloco "1. Mudanca de Etapa" foi modificado.
-- ═══════════════════════════════════════════════════════════════════════════
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
    v_activity jsonb;
    v_is_ai_update boolean := false;
    v_source_tag jsonb;
    v_key text;
    v_all_keys text[];
    v_old_val text;
    v_new_val text;
    v_field_label text;
    v_tipo text;
    v_descricao text;
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
    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN current_setting('app.update_source', true) = 'integration' THEN '{"source":"integration"}'::jsonb
        ELSE '{"source":"ai_agent"}'::jsonb
    END;

    -- 1. Mudança de Etapa (Analytics v2: adiciona is_rework + ordens no metadata)
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
            'descricao', 'Card movido de ' || COALESCE(v_old_stage_name, '?') || ' para ' || COALESCE(v_new_stage_name, '?'),
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

    -- 5b. numero_venda_monde: ja logado pelo loop generico acima
    IF (v_old_data->>'numero_venda_monde') IS DISTINCT FROM (v_new_data->>'numero_venda_monde') THEN
        NULL;
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

    -- 9. ai_responsavel alterado
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

    -- INSERT unico
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

COMMIT;
