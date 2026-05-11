-- ============================================================================
-- Fix: Corrigir mapeamentos inbound de deal custom fields que estavam trocados
--
-- Campos do AC que estavam mapeados para o CRM com chave errada:
--   54 (WT Tempo para Viagem)         → era 'motivo', deveria ser tempo/timeline
--   55 (WT Tem destino? Sim/Não)      → era 'mkt_destino', deveria ser flag
--   56 (SDR WT - Motivo de Perda)     → era 'epoca_viagem', deveria ser motivo_perda
--   57 (SDR WT - Destino pelo lead)   → era 'ad_image_url', deveria ser destino_lead
--  157 (Observações)                  → era 'o_que_e_importante', deveria ser 'observacoes'
--
-- Também adiciona mapeamentos que faltam:
--  145 (Intuito da viagem)            → motivo (trip_info)
--  148 (Destino(s) do roteiro)        → destino_roteiro (produto_data)
--  153 (Orçamento por pessoa)         → orcamento_por_pessoa (produto_data)
-- ============================================================================

-- ===== CORREÇÕES =====

-- AC 54: "WT Tempo para Viagem" (ex: "Daqui 3 a 6 meses")
-- Estava mapeado como 'motivo' (motivo viagem) — ERRADO
-- Corrigir para: tempo_para_viagem em produto_data
UPDATE public.integration_field_map
SET local_field_key = 'tempo_para_viagem',
    storage_location = 'produto_data',
    db_column_name = NULL
WHERE external_field_id = '54'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND local_field_key = 'motivo';

-- AC 55: "WT Tem destino?" (Sim/Não)
-- Estava mapeado como 'mkt_destino' (texto do destino) — ERRADO
-- Corrigir para: tem_destino em produto_data
UPDATE public.integration_field_map
SET local_field_key = 'tem_destino',
    storage_location = 'produto_data',
    db_column_name = NULL
WHERE external_field_id = '55'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND local_field_key = 'mkt_destino';

-- AC 56: "SDR WT - Motivo de Perda" (dropdown de motivos)
-- Estava mapeado como 'epoca_viagem' (época da viagem) — ERRADO
-- Corrigir para: motivo_perda_sdr em briefing_inicial
UPDATE public.integration_field_map
SET local_field_key = '__briefing_inicial__.motivo_perda_sdr_wt',
    storage_location = 'briefing_inicial',
    db_column_name = NULL,
    sync_always = false
WHERE external_field_id = '56'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND local_field_key = 'epoca_viagem';

-- AC 57: "SDR WT - Destino informado pelo lead"
-- Estava mapeado como 'ad_image_url' — ERRADO
-- Corrigir para: destino_informado_lead em briefing_inicial
UPDATE public.integration_field_map
SET local_field_key = '__briefing_inicial__.destino_informado_lead',
    storage_location = 'briefing_inicial',
    db_column_name = NULL,
    sync_always = false
WHERE external_field_id = '57'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND local_field_key = 'ad_image_url';

-- AC 157: "Observações:" (textarea)
-- Estava mapeado como 'o_que_e_importante' — ERRADO (confundido com field 146)
-- Corrigir para: observacoes em produto_data
UPDATE public.integration_field_map
SET local_field_key = 'observacoes',
    storage_location = 'produto_data',
    db_column_name = NULL
WHERE external_field_id = '157'
  AND entity_type = 'deal'
  AND direction = 'inbound'
  AND local_field_key = 'o_que_e_importante';

-- ===== NOVOS MAPEAMENTOS =====

-- AC 145: "Qual o intuito da viagem (lazer, lua de mel, trabalho, família...)"
-- Mapear para: motivo (trip_info — system_field 'motivo')
INSERT INTO public.integration_field_map
    (id, source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
VALUES
    (gen_random_uuid(), 'active_campaign', 'deal', '145', 'motivo', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', false, true, 'produto_data', NULL)
ON CONFLICT DO NOTHING;

-- AC 148: "Destino(s) do roteiro?"
-- Mapear para: destino_roteiro em produto_data
INSERT INTO public.integration_field_map
    (id, source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
VALUES
    (gen_random_uuid(), 'active_campaign', 'deal', '148', 'destino_roteiro', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', false, true, 'produto_data', NULL)
ON CONFLICT DO NOTHING;

-- AC 153: "Qual o orçamento por pessoa?"
-- Mapear para: orcamento_por_pessoa em produto_data
INSERT INTO public.integration_field_map
    (id, source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
VALUES
    (gen_random_uuid(), 'active_campaign', 'deal', '153', 'orcamento_por_pessoa', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', false, true, 'produto_data', NULL)
ON CONFLICT DO NOTHING;
