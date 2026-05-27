-- ============================================================================
-- Wedding: campos de fechamento (Closer) que a closer preenche no AC
--
-- 5 campos novos da fase Closer + extensão de TODOS os mapeamentos atuais
-- (pipelines 1, 3) pro pipeline 4 (Planejamento) — quando o lead migra pra
-- Planejamento no AC, atualizações precisam continuar refletindo no CRM.
--
-- Campos novos (do que a Closer preenche no fechamento):
--   AC 31  → ww_grupo_whats_criado        (Grupo de whats criado? Sim/Não)
--   AC 62  → ww_closer_pacote_convidados  (Pacote WW - Nº de Convidados)
--   AC 65  → ww_closer_cerimonial         (Cerimonial incluso? Quantos?)
--   AC 68  → ww_closer_monde_venda        (Número da Venda MONDE)
--   AC 70  → ww_closer_prazo_contrato     (Prazo para devolução do contrato)
-- ============================================================================

DO $$
DECLARE
  v_integration_id UUID := 'a2141b92-561f-4514-92b4-9412a068d236';
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_pipeline TEXT;
  v_field RECORD;
BEGIN
  FOREACH v_pipeline IN ARRAY ARRAY['1', '3', '4']
  LOOP
    -- Mapeamentos novos da fase Closer
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '31', 'ww_grupo_whats_criado', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL),
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '62', 'ww_closer_pacote_convidados', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL),
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '65', 'ww_closer_cerimonial', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL),
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '68', 'ww_closer_monde_venda', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL),
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '70', 'ww_closer_prazo_contrato', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Extender TODOS os mapeamentos de pipeline 1 pra pipeline 4 (Planejamento)
  -- Quando lead migra pro Planejamento no AC, atualizações do AC continuam
  -- refletindo no CRM (caso contrário, fica congelado no que veio do Closer).
  FOR v_field IN
    SELECT external_field_id, local_field_key, storage_location, db_column_name, sync_always
      FROM public.integration_field_map
     WHERE source = 'active_campaign'
       AND entity_type = 'deal'
       AND direction = 'inbound'
       AND integration_id = v_integration_id
       AND external_pipeline_id = '1'
       AND is_active = TRUE
       AND external_field_id NOT IN ('31', '62', '65', '68', '70')  -- já adicionados acima
  LOOP
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', v_field.external_field_id, v_field.local_field_key, 'inbound',
       v_integration_id, '4', v_field.sync_always, true, v_field.storage_location, v_field.db_column_name)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Sanity check
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.integration_field_map
   WHERE source = 'active_campaign' AND entity_type = 'deal' AND direction = 'inbound'
     AND integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
     AND external_pipeline_id IN ('1', '3', '4') AND is_active = TRUE;
  RAISE NOTICE 'Total mapeamentos Wedding (pipelines 1+3+4): %', v_count;
END $$;
