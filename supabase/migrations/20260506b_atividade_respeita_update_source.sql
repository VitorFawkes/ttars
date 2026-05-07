-- ============================================================================
-- MIGRATION: Atividades respeitam app.update_source mesmo com usuário logado
-- Date: 2026-05-06
--
-- Problema: quando uma automação no frontend (ex: useAutoCalcTripDate) faz
-- UPDATE em cards via supabase-js, o trigger log_card_update_activity registra
-- a atividade com `created_by = auth.uid()` (o usuário logado naquele momento),
-- gerando atividades como "Data Viagem c/ Welcome alterado por Vitor Gambetti"
-- mesmo quando Vitor só abriu o card.
--
-- Correção:
-- 1. log_card_update_activity passa a respeitar app.update_source MESMO quando
--    há usuário logado: se for um source de sistema/automação conhecido, o
--    created_by vai NULL e o source vai pro metadata. enrich_activity_actor
--    classifica corretamente como "Automação" / "Sistema".
-- 2. RPC fn_auto_set_card_produto_data permite ao frontend fazer updates
--    automáticos em produto_data setando o source explicitamente.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) log_card_update_activity — respeitar app.update_source mesmo com user logado
-- ----------------------------------------------------------------------------
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
    v_source_text text;
    v_source_is_system boolean;
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
    -- Sources de sistema/automação que devem sobrescrever auth.uid()
    -- mesmo se há usuário logado (ex: hook frontend roda automaticamente
    -- enquanto usuário está olhando o card, mas não foi ele quem alterou).
    v_system_sources text[] := ARRAY[
      'auto_calc', 'cron', 'automacao', 'integration',
      'monde', 'active_campaign', 'n8n', 'webhook',
      'ai_agent', 'ai_agent_router', 'ai_outbound_trigger',
      'whatsapp_inbound', 'whatsapp_outbound'
    ];
BEGIN
    v_user_id := auth.uid();
    v_old_data := COALESCE(OLD.produto_data, '{}'::jsonb);
    v_new_data := COALESCE(NEW.produto_data, '{}'::jsonb);

    v_source_text := COALESCE(current_setting('app.update_source', true), '');
    v_source_is_system := v_source_text = ANY(v_system_sources);

    -- Se uma automação setou explicitamente o source como sistema,
    -- ignora o usuário logado: o autor real é a automação.
    IF v_source_is_system THEN
        v_user_id := NULL;
    END IF;

    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN v_source_text <> '' THEN jsonb_build_object('source', v_source_text)
        ELSE '{}'::jsonb
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

    -- 2. Mudança de Dono
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

    -- 3. Mudança de Status
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

    -- 4. Mudança de Valor
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

    -- 6. Mudança de título
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

    -- 7-9. ai_*: mantidos como antes (sempre source ai_agent)
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

-- ----------------------------------------------------------------------------
-- 2) Adicionar 'auto_calc' ao enrich_activity_actor com label "Automação"
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enrich_activity_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_source TEXT;
    v_agent_id UUID;
    v_agent_nome TEXT;
    v_user_nome TEXT;
BEGIN
    IF NEW.actor_type IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_source := COALESCE(NEW.metadata->>'source', '');

    -- 1. Humano (só se source não é automação/integração)
    IF NEW.created_by IS NOT NULL THEN
        SELECT nome INTO v_user_nome
        FROM public.profiles
        WHERE id = NEW.created_by;

        NEW.actor_type := 'user';
        NEW.actor_id := NEW.created_by;
        NEW.actor_label := COALESCE(v_user_nome, 'Usuário');
        RETURN NEW;
    END IF;

    -- 2. Agente IA
    IF v_source = 'ai_agent' THEN
        BEGIN
            v_agent_id := (NEW.metadata->>'agent_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_agent_id := NULL;
        END;

        IF v_agent_id IS NOT NULL THEN
            SELECT nome INTO v_agent_nome
            FROM public.ai_agents
            WHERE id = v_agent_id;
        END IF;

        NEW.actor_type := 'ai_agent';
        NEW.actor_id := v_agent_id;
        NEW.actor_label := COALESCE(v_agent_nome, 'IA');
        RETURN NEW;
    END IF;

    -- 3. Integração / sistema externo / automação
    IF v_source IN (
        'integration', 'active_campaign', 'monde', 'n8n',
        'api', 'automacao', 'auto_calc', 'ai_agent_router', 'ai_outbound_trigger',
        'webhook', 'whatsapp_inbound', 'whatsapp_outbound', 'cron'
    ) THEN
        NEW.actor_type := 'integration';
        NEW.actor_id := NULL;
        NEW.actor_label := CASE v_source
            WHEN 'active_campaign' THEN 'ActiveCampaign'
            WHEN 'monde' THEN 'Monde'
            WHEN 'n8n' THEN 'n8n'
            WHEN 'integration' THEN 'Integração'
            WHEN 'api' THEN 'API'
            WHEN 'automacao' THEN 'Automação'
            WHEN 'auto_calc' THEN 'Automação'
            WHEN 'ai_agent_router' THEN 'IA (router)'
            WHEN 'ai_outbound_trigger' THEN 'IA (outbound)'
            WHEN 'webhook' THEN 'Webhook'
            WHEN 'whatsapp_inbound' THEN 'WhatsApp'
            WHEN 'whatsapp_outbound' THEN 'WhatsApp'
            WHEN 'cron' THEN 'Automação agendada'
            ELSE v_source
        END;
        RETURN NEW;
    END IF;

    -- 4. Backfill do Analytics v2
    IF v_source = 'analytics_v2_fase0' THEN
        NEW.actor_type := 'system';
        NEW.actor_id := NULL;
        NEW.actor_label := 'Sistema (analytics)';
        RETURN NEW;
    END IF;

    -- 5. Fallback genérico
    NEW.actor_type := 'system';
    NEW.actor_id := NULL;
    NEW.actor_label := 'Sistema';
    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3) RPC: fn_auto_set_card_data_exata_da_viagem
--    Permite ao frontend atualizar data_exata_da_viagem como automação,
--    sem registrar atividade como autoria do usuário logado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_set_card_data_exata_da_viagem(
    p_card_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Marca esta atualização como vinda de automação (auto-cálculo da data
    -- a partir dos produtos do card). O trigger log_card_update_activity vai
    -- ignorar auth.uid() e classificar como "Automação".
    PERFORM set_config('app.update_source', 'auto_calc', true);

    UPDATE public.cards
       SET produto_data = COALESCE(produto_data, '{}'::jsonb)
                          || jsonb_build_object(
                                'data_exata_da_viagem',
                                jsonb_build_object('start', p_start_date::text, 'end', p_end_date::text)
                             )
     WHERE id = p_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_auto_set_card_data_exata_da_viagem(UUID, DATE, DATE) TO authenticated;

COMMIT;
