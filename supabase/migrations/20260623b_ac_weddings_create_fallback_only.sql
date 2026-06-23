-- ============================================================================
-- 20260623b_ac_weddings_create_fallback_only.sql
-- ----------------------------------------------------------------------------
-- Refino do 20260623a: ttars PRIMEIRO, Active como FALLBACK.
--
-- A criação normal do card vem do Leadster/site no momento do lead (deal_add).
-- O Active só deve criar quando, num deal_update POSTERIOR, ainda não existe card
-- pro casal (ex.: lead de Facebook que não passa pelo webhook do ttars).
--
-- Por isso os triggers "WW - Criação" (que disparam em deal_add) voltam a ficar
-- DESLIGADOS — senão o Active criaria o card no mesmo instante do lead, correndo
-- com o ttars. A criação via Active passa a acontecer SÓ no caminho update_only-
-- sem-card do integration-process (gated por ac_create_cards). Os triggers
-- "WW - Atualização" (update_only) seguem ativos e são o gatilho do fallback.
-- ============================================================================

UPDATE public.integration_inbound_triggers
   SET is_active = false
 WHERE id IN (
   '5f22683f-8c0f-459e-b4b3-7316b1ed7f60',  -- SDR WW - Criação
   '5862f0a8-86ca-4bff-85cb-96639d067a35',  -- Closer WW - Criação
   'ed29018d-e1c9-4c45-b146-6867c9fb059b',  -- Elopement WW - Criação
   'd7fbea80-d5ba-4f31-9cd9-47a337653bd9',  -- Internacional WW - Criação
   'dc48a207-aaf4-4f49-a6d8-85d1493387c0'   -- Planejamento WW - Criação
 );

NOTIFY pgrst, 'reload schema';
