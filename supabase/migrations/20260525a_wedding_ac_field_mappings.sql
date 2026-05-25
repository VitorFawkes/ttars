-- ============================================================================
-- Wedding: cadastrar mapeamentos AC custom fields → CRM
--
-- Contexto:
-- O CRM tinha 12 mapeamentos pra pipeline AC 6 (que NÃO existe no AC real). Os
-- pipelines AC ativos pra Wedding são: 1 (SDR Weddings), 3 (Closer Weddings),
-- 4 (Planejamento), 12 (Elopment), 17 (WW Internacional).
--
-- Como resultado, dos 1.395 cards Wedding ativos no banco, só 10-15 têm faixa
-- de investimento / número de convidados / destino preenchidos. Os dados vêm
-- do AC mas ficam em marketing_data.unmapped_fields porque nenhum mapeamento
-- bate.
--
-- Esta migration cadastra os mapeamentos corretos pros pipelines 1 e 3
-- (priorizando fase SDR + Closer onde os campos chave são preenchidos).
-- Pipeline 4 (Planejamento) recebe os mesmos via fallback global.
-- ============================================================================

DO $$
DECLARE
  v_integration_id UUID := 'a2141b92-561f-4514-92b4-9412a068d236'; -- ActiveCampaign
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group (account pai)
  v_pipeline TEXT;
BEGIN
  -- Aplicar mapeamentos pra pipelines 1 (SDR) e 3 (Closer)
  FOREACH v_pipeline IN ARRAY ARRAY['1', '3']
  LOOP
    -- ===== CAMPOS DO FORMULÁRIO DO SITE (sync_always=true, sempre vem do AC) =====

    -- AC 21: "Qual é o nome do(a) seu(sua) noivo(a)?" (text)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '21', 'ww_nome_parceiro', 'inbound',
       v_integration_id, v_pipeline, true, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 26: "Quantas pessoas vão no seu casamento?" (radio: "Apenas o casal", "Até 20", "Entre 20 a 50", "50-80", "80-100", "+100")
    -- → guardar no campo de marketing (snapshot do formulário) E no campo principal
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '26', 'ww_mkt_convidados_form', 'inbound',
       v_integration_id, v_pipeline, true, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 27: "Quanto você pensa em investir?*" (radio: "Até R$50 mil", "R$50-80 mil", etc)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '27', 'ww_mkt_orcamento_form', 'inbound',
       v_integration_id, v_pipeline, true, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 28: "Onde você quer casar?*" (radio: "Nordeste Brasileiro", "Caribe", "Itália", "Outro"…)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '28', 'ww_mkt_destino_form', 'inbound',
       v_integration_id, v_pipeline, true, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 29: "Se 'Outro', qual?" (textarea complementar ao 28)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '29', 'ww_mkt_destino_outro', 'inbound',
       v_integration_id, v_pipeline, true, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 30: "DW ou Elopment?" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '30', 'ww_tipo_casamento', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 117: "Previsão data de casamento" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '117', 'ww_sdr_previsao_data', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 16: "Cidade" do contato/lead (text) - cidade onde o casal mora
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '16', 'ww_sdr_cidade', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- ===== CAMPOS DE SDR (qualificação) =====

    -- AC 6: "Data e horário do agendamento da 1ª reunião" (datetime)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '6', 'ww_sdr_data_reuniao', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 17: "Como foi feita a 1ª reunião?" (multiselect)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '17', 'ww_sdr_como_reuniao', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 20: "Pagamento de Taxa?" (radio Sim/Não)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '20', 'ww_sdr_taxa_paga', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 2: "Motivo de perda" (radio) - usado pelo SDR
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '2', 'ww_motivo_perda_sdr', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 83: "Motivos de qualificação SDR" (radio Sim/Não)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '83', 'ww_sdr_qualificado', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 98: "Automático - WW - Data Qualificação SDR" (datetime)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '98', 'ww_sdr_data_qualificacao', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- ===== CAMPOS DE CLOSER =====

    -- AC 18: "Data e horário do agendamento com a Closer" (datetime)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '18', 'ww_closer_data_reuniao', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 19: "Tipo da reunião com a Closer" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '19', 'ww_closer_como_reuniao', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 47: "[WW] [Closer] Motivo de Perda" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '47', 'ww_motivo_perda_closer', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 64: "Valor fechado em contrato:" (currency) → coluna valor_final
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '64', 'valor_final', 'inbound',
       v_integration_id, v_pipeline, false, true, 'column', 'valor_final')
    ON CONFLICT DO NOTHING;

    -- AC 87: "[WW] [Closer] Data-Hora Ganho" (datetime)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '87', 'ww_closer_data_ganho', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- ===== CAMPOS DE PLANEJAMENTO (que podem vir do AC já em Closer) =====

    -- AC 121: "Destino" (dropdown) - destino confirmado (pode reescrever ww_mkt_destino_form)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '121', 'ww_destino', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 131: "Local do Casamento" (text)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '131', 'ww_local', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 128: "Data e horário definidos para o casamento" (datetime)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '128', 'ww_data_casamento', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 132: "Data Confirmada do Casamento" (text)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '132', 'ww_plan_data_casamento_final', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- ===== EXTRAS DE QUALIFICAÇÃO =====

    -- AC 67: "Tempo de relacionamento" (text)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '67', 'ww_tempo_relacionamento', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 120: "Já tem destino definido?" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '120', 'ww_sdr_ja_tem_destino', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 123: "Como conheceu a WW?" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '123', 'ww_sdr_como_conheceu', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 124: "Motivo da escolha de um Destination Wedding?" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '124', 'ww_sdr_motivo_dw', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

    -- AC 125: "Já foi em algum Destination Wedding?" (dropdown)
    INSERT INTO public.integration_field_map
      (id, org_id, source, entity_type, external_field_id, local_field_key, direction, integration_id, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
    VALUES
      (gen_random_uuid(), v_org_id, 'active_campaign', 'deal', '125', 'ww_sdr_ja_foi_dw', 'inbound',
       v_integration_id, v_pipeline, false, true, 'produto_data', NULL)
    ON CONFLICT DO NOTHING;

  END LOOP;
END $$;

-- ============================================================================
-- Sanity check: confirmar que mapeamentos foram criados
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.integration_field_map
  WHERE source = 'active_campaign'
    AND entity_type = 'deal'
    AND direction = 'inbound'
    AND integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND external_pipeline_id IN ('1', '3')
    AND is_active = TRUE;

  RAISE NOTICE 'Mapeamentos Wedding cadastrados (pipelines 1+3): %', v_count;

  IF v_count < 50 THEN
    RAISE EXCEPTION 'Esperava 54 mapeamentos (27 campos × 2 pipelines), encontrei %', v_count;
  END IF;
END $$;
