-- ============================================================================
-- 20260623a_ac_weddings_enable_create.sql
-- ----------------------------------------------------------------------------
-- Religa a CRIAÇÃO de cards via ActiveCampaign para WEDDING (o "pega-tudo" pros
-- leads que não entram pelo webhook do ttars — ex.: Facebook Lead Ads), MAS:
--  - aplicando as regras novas (título de casal + Noivo 2) no integration-process;
--  - atrás de um kill-switch `ac_create_cards` (começa DESLIGADO → deploy seguro);
--  - sem duplicar Leadster/site (dedup por external_id + pessoa_principal_id já existe).
--
-- 3 partes:
--  (1) reativa os 5 triggers "WW - Criação" (create_only), desligados na 20260609.
--      (Desqualificados não tem trigger de criação — de propósito.)
--  (2) cria a chave ac_create_cards = 'false' (workspace WEDDING). Liga depois.
--  (3) mapeia o campo do Active "WW Nome dos noivos" (contact[fields][81]) →
--      produto_data.ww_nome_noivos, pra montar o título de casal + Noivo 2.
-- Zero mutação de dados de card.
-- ============================================================================

BEGIN;

-- (1) Reativar os triggers de criação WEDDING (create_only). Só dispara em deal_add.
UPDATE public.integration_inbound_triggers
   SET is_active = true
 WHERE id IN (
   '5f22683f-8c0f-459e-b4b3-7316b1ed7f60',  -- SDR WW - Criação (pipeline 1)
   '5862f0a8-86ca-4bff-85cb-96639d067a35',  -- Closer WW - Criação (3)
   'ed29018d-e1c9-4c45-b146-6867c9fb059b',  -- Elopement WW - Criação (12)
   'd7fbea80-d5ba-4f31-9cd9-47a337653bd9',  -- Internacional WW - Criação (17)
   'dc48a207-aaf4-4f49-a6d8-85d1493387c0'   -- Planejamento WW - Criação (4)
 );

-- (2) Kill-switch da criação WEDDING via Active. Começa DESLIGADO.
INSERT INTO public.integration_settings (org_id, key, value, produto, description)
SELECT 'b0000000-0000-0000-0000-000000000002', 'ac_create_cards', 'false', NULL,
       'Liga/desliga a criação de cards WEDDING via ActiveCampaign (pega-tudo p/ Facebook etc). Dedup + regras novas no integration-process.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.integration_settings
   WHERE org_id = 'b0000000-0000-0000-0000-000000000002' AND key = 'ac_create_cards'
);

-- (3) De-para do Noivo 2: AC "WW Nome dos noivos" (contact field 81) → produto_data.ww_nome_noivos.
--     Modelado na linha viva de ww_onde_casar_refinado (contact[fields][11]).
INSERT INTO public.integration_field_map
  (source, entity_type, external_field_id, local_field_key, direction, integration_id, storage_location, external_pipeline_id, org_id, is_active, sync_always)
SELECT 'active_campaign', 'contact', 'contact[fields][81]', 'ww_nome_noivos', 'inbound',
       'a2141b92-561f-4514-92b4-9412a068d236', 'produto_data', NULL,
       'a0000000-0000-0000-0000-000000000001', true, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.integration_field_map
   WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
     AND external_field_id = 'contact[fields][81]'
     AND local_field_key = 'ww_nome_noivos'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
