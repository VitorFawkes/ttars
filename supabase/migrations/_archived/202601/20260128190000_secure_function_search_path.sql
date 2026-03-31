-- ============================================================
-- Migration: Secure Function Search Path
-- Data: 2026-01-28
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: Functions com SECURITY DEFINER sem search_path fixo
-- podem ser exploradas via search_path manipulation attack.
--
-- CORREÇÃO: Adicionar SET search_path = '' a todas as 53 functions
-- SECURITY DEFINER do projeto.
--
-- REFERÊNCIA: https://supabase.com/docs/guides/database/database-linter
-- ============================================================

-- ============================================================
-- PARTE 1: Functions de Permissão/Auth (CRÍTICAS - 6 functions)
-- ============================================================

ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.is_gestor() SET search_path = '';
ALTER FUNCTION public.is_operational() SET search_path = '';
ALTER FUNCTION public.is_manager_or_admin() SET search_path = '';
ALTER FUNCTION public.has_role(text) SET search_path = '';
ALTER FUNCTION public.get_user_role() SET search_path = '';

-- ============================================================
-- PARTE 2: Functions de API/Auth (CRÍTICAS - 7 functions)
-- ============================================================

ALTER FUNCTION public.exec_sql(text) SET search_path = '';
ALTER FUNCTION public.generate_api_key(text, jsonb, integer, timestamp with time zone) SET search_path = '';
ALTER FUNCTION public.validate_api_key(text) SET search_path = '';
ALTER FUNCTION public.revoke_api_key(uuid) SET search_path = '';
ALTER FUNCTION public.generate_invite(text, text, uuid, uuid) SET search_path = '';
ALTER FUNCTION public.check_invite_whitelist() SET search_path = '';
ALTER FUNCTION public.mark_invite_used() SET search_path = '';

-- ============================================================
-- PARTE 3: Functions de Logging (16 functions)
-- ============================================================

ALTER FUNCTION public.log_activity() SET search_path = '';
ALTER FUNCTION public.log_arquivo_activity() SET search_path = '';
ALTER FUNCTION public.log_card_changes() SET search_path = '';
ALTER FUNCTION public.log_card_created() SET search_path = '';
ALTER FUNCTION public.log_card_deletion() SET search_path = '';
ALTER FUNCTION public.log_card_update_activity() SET search_path = '';
ALTER FUNCTION public.log_cards_contatos_activity() SET search_path = '';
ALTER FUNCTION public.log_changes() SET search_path = '';
ALTER FUNCTION public.log_contrato_activity() SET search_path = '';
ALTER FUNCTION public.log_mensagem_activity() SET search_path = '';
ALTER FUNCTION public.log_nota_activity() SET search_path = '';
ALTER FUNCTION public.log_obligation_activity() SET search_path = '';
ALTER FUNCTION public.log_proposal_activity() SET search_path = '';
ALTER FUNCTION public.log_reuniao_activity() SET search_path = '';
ALTER FUNCTION public.log_stage_fields_changes() SET search_path = '';
ALTER FUNCTION public.log_tarefa_activity_v2() SET search_path = '';

-- ============================================================
-- PARTE 4: Functions de Workflow/Triggers (4 functions)
-- ============================================================

ALTER FUNCTION public.handle_outbound_webhook() SET search_path = '';
ALTER FUNCTION public.handle_proposal_status_change() SET search_path = '';
ALTER FUNCTION public.trigger_workflow_engine_webhook() SET search_path = '';
ALTER FUNCTION public.trigger_workflow_on_task_outcome() SET search_path = '';

-- ============================================================
-- PARTE 5: Functions de WhatsApp (6 functions)
-- ============================================================

ALTER FUNCTION public.find_contact_by_whatsapp(text, text) SET search_path = '';
ALTER FUNCTION public.process_all_pending_whatsapp_events() SET search_path = '';
ALTER FUNCTION public.process_pending_whatsapp_events() SET search_path = '';
ALTER FUNCTION public.process_whatsapp_raw_event(uuid) SET search_path = '';
ALTER FUNCTION public.process_whatsapp_raw_event_v2(uuid) SET search_path = '';
ALTER FUNCTION public.trigger_auto_process_whatsapp_event() SET search_path = '';

-- ============================================================
-- PARTE 6: Functions Utilitárias (13 functions)
-- ============================================================

ALTER FUNCTION public.auto_expire_proposals() SET search_path = '';
ALTER FUNCTION public.calculate_group_totals() SET search_path = '';
ALTER FUNCTION public.calculate_group_totals_from_contacts() SET search_path = '';
ALTER FUNCTION public.describe_table(text) SET search_path = '';
ALTER FUNCTION public.get_travel_history(uuid[]) SET search_path = '';
ALTER FUNCTION public.increment_library_usage(uuid) SET search_path = '';
ALTER FUNCTION public.list_all_tables() SET search_path = '';
ALTER FUNCTION public.mover_card(uuid, uuid, uuid) SET search_path = '';
ALTER FUNCTION public.recalculate_contact_stats() SET search_path = '';
ALTER FUNCTION public.save_workflow_definition(uuid, text, text, text, jsonb, boolean, jsonb, jsonb) SET search_path = '';
ALTER FUNCTION public.search_proposal_library(text, text, text, integer) SET search_path = '';
ALTER FUNCTION public.set_card_primary_contact(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.update_travelers_count() SET search_path = '';
ALTER FUNCTION public.validate_transition(uuid, uuid) SET search_path = '';

-- ============================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO
-- ============================================================
-- Execute para verificar que todas as functions agora têm search_path:
--
-- SELECT p.proname,
--        array_to_string(p.proconfig, ', ') as config
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
--   AND p.prosecdef = true
-- ORDER BY p.proname;
--
-- Todas devem mostrar: search_path=
