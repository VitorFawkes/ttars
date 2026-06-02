-- ============================================================================
-- CLEANUP: remove o overload de 7 params de ww_qualidade_lead (criado por engano).
-- A versão VIVA é a de 8 params (com p_min_amostra, migration 20260530f) que JÁ
-- lê do AC (ww_ac_deal_funnel_cache). Os 2 overloads causavam ambiguidade (PGRST203).
-- ============================================================================
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, UUID, TEXT[]);
