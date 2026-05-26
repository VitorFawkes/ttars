-- ============================================================================
-- Wedding: 4 CONTACT fields do AC com os valores "refinados" pela Closer
--
-- Diferente dos deal fields (que dependem de pipeline), contact fields são
-- globais (entity_type='contact', sem pipeline_filter). O time atualiza esses
-- 4 campos depois da reunião com o casal, gerando a "realidade" que comparamos
-- contra a "entrada" do formulário do site.
--
--   contact 7  → ww_convidados_refinado      (radio — "Até 20 convidados", etc)
--   contact 8  → ww_investimento_refinado    (radio — "R$50 e R$80 mil", etc)
--   contact 11 → ww_onde_casar_refinado      (radio — "Nordeste Brasileiro", "Outro", etc)
--   contact 12 → ww_destino_livre_refinado   (textarea — caso disse "Outro" no 11)
-- ============================================================================

DO $$
DECLARE v_integration_id UUID := 'a2141b92-561f-4514-92b4-9412a068d236';
        v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.integration_field_map
    (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
  VALUES
    (gen_random_uuid(), v_org_id, 'active_campaign', 'contact', 'contact[fields][7]', 'ww_convidados_refinado', 'inbound',
     v_integration_id, NULL, false, true, 'produto_data', NULL),
    (gen_random_uuid(), v_org_id, 'active_campaign', 'contact', 'contact[fields][8]', 'ww_investimento_refinado', 'inbound',
     v_integration_id, NULL, false, true, 'produto_data', NULL),
    (gen_random_uuid(), v_org_id, 'active_campaign', 'contact', 'contact[fields][11]', 'ww_onde_casar_refinado', 'inbound',
     v_integration_id, NULL, false, true, 'produto_data', NULL),
    (gen_random_uuid(), v_org_id, 'active_campaign', 'contact', 'contact[fields][12]', 'ww_destino_livre_refinado', 'inbound',
     v_integration_id, NULL, false, true, 'produto_data', NULL)
  ON CONFLICT DO NOTHING;
END $$;
