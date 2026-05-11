-- ============================================================
-- Migration: Fix Remaining Function Search Path (FASE 1)
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: 47 functions com search_path mutable detectadas no
-- Supabase Security Linter. Algumas ja foram corrigidas pela
-- migration 20260128190000, esta corrige as restantes.
--
-- RISCO: BAIXO - Apenas adiciona SET search_path, nao muda logica
-- ROLLBACK: ALTER FUNCTION ... RESET search_path;
--
-- TESTE OBRIGATORIO APOS APLICAR:
-- 1. No Kanban, arrastar card entre fases (testa mover_card)
-- 2. Abrir card e ver Historico de Viagens (testa get_travel_history)
-- ============================================================

-- ============================================================
-- PARTE 1: Funcoes de Normalizacao de Telefone (4 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_phone_brazil' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.normalize_phone_brazil(text) SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_phone_robust' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.normalize_phone_robust(text) SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_phone' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.normalize_phone(text) SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'normalize_contato_meio' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.normalize_contato_meio() SET search_path = public;
    END IF;
END $$;

-- ============================================================
-- PARTE 2: Funcoes de Sync de Dados (6 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_travel_normalized_columns' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.sync_travel_normalized_columns() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_card_dates_from_json' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.sync_card_dates_from_json() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_card_dates_to_json' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.sync_card_dates_to_json() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_pipeline_stage_fase' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.sync_pipeline_stage_fase() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'should_sync_field' AND pronamespace = 'public'::regnamespace) THEN
        -- Verificar assinatura correta
        BEGIN
            ALTER FUNCTION public.should_sync_field(text, text) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL; -- Ignora se assinatura nao bater
        END;
    END IF;
END $$;

-- ============================================================
-- PARTE 3: Funcoes de Cadence (7 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_cadence_templates_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_cadence_templates_updated_at() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_start_cadence_for_new_card' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.auto_start_cadence_for_new_card() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'execute_cadence_entry_rule_immediate' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.execute_cadence_entry_rule_immediate(uuid, uuid) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_cadence_entry_on_stage_change' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.process_cadence_entry_on_stage_change() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_cadence_entry_on_card_create' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.process_cadence_entry_on_card_create() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'schedule_tasks_on_stage_change' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.schedule_tasks_on_stage_change() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_task_queue' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.process_task_queue() SET search_path = public;
    END IF;
END $$;

-- ============================================================
-- PARTE 4: Funcoes de Card (11 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_single_role_cards' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.cleanup_single_role_cards() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_assign_card_owner' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.auto_assign_card_owner() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_tipo_pessoa' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.calculate_tipo_pessoa(date) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_single_role_cards_contatos' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.check_single_role_cards_contatos() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_card_value_rules' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.enforce_card_value_rules() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_card_data' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.validate_card_data() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'execute_card_auto_creation' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.execute_card_auto_creation() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_card_status_automation' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.handle_card_status_automation() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'execute_automation_rules' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.execute_automation_rules() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_business_due_date' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.calculate_business_due_date(timestamp with time zone, integer) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

-- ============================================================
-- PARTE 5: Funcoes de Proposal (2 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auto_generate_proposal_token' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.auto_generate_proposal_token() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_proposal_public_token' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.generate_proposal_public_token() SET search_path = public;
    END IF;
END $$;

-- ============================================================
-- PARTE 6: Funcoes Utilitarias (5 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'f_unaccent' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.f_unaccent(text) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'find_jsonb_diffs' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.find_jsonb_diffs(jsonb, jsonb) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'jsonb_get_path' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.jsonb_get_path(jsonb, text) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'snapshot_briefing_inicial' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.snapshot_briefing_inicial() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'match_documents_v2' AND pronamespace = 'public'::regnamespace) THEN
        BEGIN
            ALTER FUNCTION public.match_documents_v2(vector, integer, double precision) SET search_path = public;
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END IF;
END $$;

-- ============================================================
-- PARTE 7: Funcoes de Updated_at Triggers (7 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.handle_updated_at() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_notas_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_notas_updated_at() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_pipeline_card_settings_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_pipeline_card_settings_updated_at() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_sections_updated_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_sections_updated_at() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_inbound_triggers_timestamp' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_inbound_triggers_timestamp() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_stage_entered_at' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.update_stage_entered_at() SET search_path = public;
    END IF;
END $$;

-- ============================================================
-- PARTE 8: Funcoes de Logging (3 funcoes)
-- ============================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_outbound_card_event' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.log_outbound_card_event() SET search_path = public;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_owner_change' AND pronamespace = 'public'::regnamespace) THEN
        ALTER FUNCTION public.log_owner_change() SET search_path = public;
    END IF;
END $$;

-- find_contact_by_whatsapp com 1 argumento (versao diferente da ja corrigida)
DO $$ BEGIN
    BEGIN
        ALTER FUNCTION public.find_contact_by_whatsapp(text) SET search_path = public;
    EXCEPTION WHEN undefined_function THEN
        NULL;
    END;
END $$;

-- ============================================================
-- VERIFICACAO POS-APLICACAO
-- ============================================================
-- Execute para verificar que todas as functions tem search_path:
--
-- SELECT p.proname, p.prosecdef,
--        array_to_string(p.proconfig, ', ') as config
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.prosecdef = true
--   AND (p.proconfig IS NULL OR NOT EXISTS (
--       SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'
--   ))
-- ORDER BY p.proname;
--
-- Esperado: 0 rows (todas tem search_path definido)
-- ============================================================

-- ============================================================
-- ROLLBACK SCRIPT (se precisar reverter):
-- ============================================================
/*
ALTER FUNCTION public.normalize_phone_brazil(text) RESET search_path;
ALTER FUNCTION public.normalize_phone_robust(text) RESET search_path;
ALTER FUNCTION public.normalize_phone(text) RESET search_path;
ALTER FUNCTION public.normalize_contato_meio() RESET search_path;
ALTER FUNCTION public.sync_travel_normalized_columns() RESET search_path;
ALTER FUNCTION public.sync_card_dates_from_json() RESET search_path;
ALTER FUNCTION public.sync_card_dates_to_json() RESET search_path;
ALTER FUNCTION public.sync_pipeline_stage_fase() RESET search_path;
ALTER FUNCTION public.should_sync_field(text, text) RESET search_path;
ALTER FUNCTION public.update_cadence_templates_updated_at() RESET search_path;
ALTER FUNCTION public.auto_start_cadence_for_new_card() RESET search_path;
ALTER FUNCTION public.execute_cadence_entry_rule_immediate(uuid, uuid) RESET search_path;
ALTER FUNCTION public.process_cadence_entry_on_stage_change() RESET search_path;
ALTER FUNCTION public.process_cadence_entry_on_card_create() RESET search_path;
ALTER FUNCTION public.schedule_tasks_on_stage_change() RESET search_path;
ALTER FUNCTION public.process_task_queue() RESET search_path;
ALTER FUNCTION public.cleanup_single_role_cards() RESET search_path;
ALTER FUNCTION public.auto_assign_card_owner() RESET search_path;
ALTER FUNCTION public.calculate_tipo_pessoa(date) RESET search_path;
ALTER FUNCTION public.check_single_role_cards_contatos() RESET search_path;
ALTER FUNCTION public.enforce_card_value_rules() RESET search_path;
ALTER FUNCTION public.validate_card_data() RESET search_path;
ALTER FUNCTION public.execute_card_auto_creation() RESET search_path;
ALTER FUNCTION public.handle_card_status_automation() RESET search_path;
ALTER FUNCTION public.execute_automation_rules() RESET search_path;
ALTER FUNCTION public.calculate_business_due_date(timestamp with time zone, integer) RESET search_path;
ALTER FUNCTION public.auto_generate_proposal_token() RESET search_path;
ALTER FUNCTION public.generate_proposal_public_token() RESET search_path;
ALTER FUNCTION public.f_unaccent(text) RESET search_path;
ALTER FUNCTION public.find_jsonb_diffs(jsonb, jsonb) RESET search_path;
ALTER FUNCTION public.jsonb_get_path(jsonb, text) RESET search_path;
ALTER FUNCTION public.snapshot_briefing_inicial() RESET search_path;
ALTER FUNCTION public.match_documents_v2(vector, integer, double precision) RESET search_path;
ALTER FUNCTION public.handle_updated_at() RESET search_path;
ALTER FUNCTION public.update_updated_at_column() RESET search_path;
ALTER FUNCTION public.update_notas_updated_at() RESET search_path;
ALTER FUNCTION public.update_pipeline_card_settings_updated_at() RESET search_path;
ALTER FUNCTION public.update_sections_updated_at() RESET search_path;
ALTER FUNCTION public.update_inbound_triggers_timestamp() RESET search_path;
ALTER FUNCTION public.update_stage_entered_at() RESET search_path;
ALTER FUNCTION public.log_outbound_card_event() RESET search_path;
ALTER FUNCTION public.log_owner_change() RESET search_path;
ALTER FUNCTION public.find_contact_by_whatsapp(text) RESET search_path;
*/
