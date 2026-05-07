-- ============================================================================
-- MIGRATION: Vigias adicionais para "Operação interna" no card
-- Date: 2026-05-07
--
-- Adiciona 4 novos eventos na aba Atividade:
--   - ai_paused_card        : IA pausada/retomada no card (ai_pause_config)
--   - field_locked /
--     field_unlocked        : campo travado/liberado contra update automático
--                             (locked_fields)
--   - briefing_changed      : briefing inicial editado
--   - operational_state_
--     changed               : estado_operacional alterado
--
-- Implementação: trigger DEDICADO (não toca log_card_update_activity, para
-- evitar rebase. Ver memory/feedback_function_rebase_cuidado.md).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.log_card_internal_ops_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id uuid;
    v_source_text text;
    v_source_is_system boolean;
    v_source_tag jsonb;
    v_old_pause boolean;
    v_new_pause boolean;
    v_old_locked jsonb;
    v_new_locked jsonb;
    v_key text;
    v_all_keys text[];
    v_was_locked boolean;
    v_now_locked boolean;
    v_field_label text;
    v_system_sources text[] := ARRAY[
      'auto_calc', 'cron', 'automacao', 'integration',
      'monde', 'active_campaign', 'n8n', 'webhook',
      'ai_agent', 'ai_agent_router', 'ai_outbound_trigger',
      'whatsapp_inbound', 'whatsapp_outbound'
    ];
BEGIN
    v_user_id := auth.uid();
    v_source_text := COALESCE(current_setting('app.update_source', true), '');
    v_source_is_system := v_source_text = ANY(v_system_sources);

    IF v_source_is_system THEN
        v_user_id := NULL;
    END IF;

    v_source_tag := CASE
        WHEN v_user_id IS NOT NULL THEN '{}'::jsonb
        WHEN v_source_text <> '' THEN jsonb_build_object('source', v_source_text)
        ELSE '{}'::jsonb
    END;

    -- 1) IA pausada / retomada (ai_pause_config.enabled)
    IF OLD.ai_pause_config IS DISTINCT FROM NEW.ai_pause_config THEN
        v_old_pause := COALESCE((OLD.ai_pause_config->>'enabled')::boolean, false);
        v_new_pause := COALESCE((NEW.ai_pause_config->>'enabled')::boolean, false);

        IF v_old_pause IS DISTINCT FROM v_new_pause THEN
            INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.id,
                'ai_paused_card',
                CASE WHEN v_new_pause
                     THEN 'IA pausada neste card'
                     ELSE 'IA retomada neste card'
                END,
                jsonb_build_object(
                    'now_paused', v_new_pause,
                    'config', NEW.ai_pause_config
                ) || v_source_tag,
                v_user_id
            );
        END IF;
    END IF;

    -- 2) Campo travado / liberado (locked_fields é jsonb { field_key: true })
    IF OLD.locked_fields IS DISTINCT FROM NEW.locked_fields THEN
        v_old_locked := COALESCE(OLD.locked_fields, '{}'::jsonb);
        v_new_locked := COALESCE(NEW.locked_fields, '{}'::jsonb);

        SELECT array_agg(DISTINCT k) INTO v_all_keys
        FROM (
            SELECT jsonb_object_keys(v_old_locked) AS k
            UNION
            SELECT jsonb_object_keys(v_new_locked) AS k
        ) keys;

        IF v_all_keys IS NOT NULL THEN
            FOREACH v_key IN ARRAY v_all_keys LOOP
                v_was_locked := COALESCE((v_old_locked->>v_key)::boolean, false);
                v_now_locked := COALESCE((v_new_locked->>v_key)::boolean, false);

                IF v_was_locked IS DISTINCT FROM v_now_locked THEN
                    SELECT label INTO v_field_label
                    FROM public.system_fields
                    WHERE key = v_key
                    LIMIT 1;

                    v_field_label := COALESCE(v_field_label, v_key);

                    INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
                    VALUES (
                        NEW.id,
                        CASE WHEN v_now_locked THEN 'field_locked' ELSE 'field_unlocked' END,
                        CASE WHEN v_now_locked
                             THEN v_field_label || ' travado contra atualização automática'
                             ELSE v_field_label || ' liberado para atualização automática'
                        END,
                        jsonb_build_object(
                            'field_key', v_key,
                            'field_label', v_field_label,
                            'now_locked', v_now_locked
                        ) || v_source_tag,
                        v_user_id
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 3) Briefing inicial editado
    IF OLD.briefing_inicial IS DISTINCT FROM NEW.briefing_inicial THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'briefing_changed',
            CASE
                WHEN COALESCE(OLD.briefing_inicial, '') = '' AND NEW.briefing_inicial IS NOT NULL
                    THEN 'Briefing inicial preenchido'
                WHEN COALESCE(NEW.briefing_inicial, '') = '' AND OLD.briefing_inicial IS NOT NULL
                    THEN 'Briefing inicial apagado'
                ELSE 'Briefing inicial editado'
            END,
            jsonb_build_object(
                'had_previous', (OLD.briefing_inicial IS NOT NULL AND OLD.briefing_inicial <> ''),
                'old_char_count', LENGTH(COALESCE(OLD.briefing_inicial, '')),
                'new_char_count', LENGTH(COALESCE(NEW.briefing_inicial, ''))
            ) || v_source_tag,
            v_user_id
        );
    END IF;

    -- 4) Estado operacional alterado
    IF OLD.estado_operacional IS DISTINCT FROM NEW.estado_operacional THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.id,
            'operational_state_changed',
            'Estado operacional: ' || COALESCE(OLD.estado_operacional::text, '(vazio)') || ' → ' || COALESCE(NEW.estado_operacional::text, '(vazio)'),
            jsonb_build_object(
                'old_state', OLD.estado_operacional,
                'new_state', NEW.estado_operacional
            ) || v_source_tag,
            v_user_id
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    PERFORM public.safe_log_trigger_error(
        'log_card_internal_ops_change',
        SQLERRM,
        jsonb_build_object('card_id', NEW.id)
    );
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS card_internal_ops_change_trigger ON public.cards;
CREATE TRIGGER card_internal_ops_change_trigger
AFTER UPDATE OF ai_pause_config, locked_fields, briefing_inicial, estado_operacional ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.log_card_internal_ops_change();

COMMIT;
