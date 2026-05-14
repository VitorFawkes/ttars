-- =====================================================================
-- ROLLBACK de 20260516b_create_nps_tables.sql + 20260516c_backfill_nps_welcome_trips.sql
--
-- Remove TUDO que a feature NPS adicionou ao banco:
--   1) Tabelas nps_responses e nps_surveys (com CASCADE, dropa policies,
--      triggers, indexes e a FK uniq do response→survey).
--   2) Trigger functions nps_surveys_enforce_card_org e
--      nps_responses_enforce_survey_org.
--
-- Como o backfill (20260516c) só INSERE em nps_surveys/nps_responses, esse
-- rollback também desfaz o backfill — não precisa de rollback separado.
--
-- Após rodar:
--   • Aba /nps no frontend vai mostrar erro 404/406 ao consultar as tabelas.
--     O usuário vê empty state genérico (queries falham silenciosamente no
--     react-query e a UI renderiza "0 enviadas" + empty state).
--   • Nenhuma outra parte do CRM depende dessas tabelas — feature isolada.
--
-- COMO RODAR:
--   bash .claude/hooks/promote-to-prod.sh \
--     supabase/migrations/_rollback/20260516b_nps_tables_rollback.sql
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS public.nps_responses CASCADE;
DROP TABLE IF EXISTS public.nps_surveys   CASCADE;

DROP FUNCTION IF EXISTS public.nps_responses_enforce_survey_org() CASCADE;
DROP FUNCTION IF EXISTS public.nps_surveys_enforce_card_org()     CASCADE;

COMMIT;
