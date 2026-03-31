-- ============================================================================
-- Migration: Add outbound + inbound mappings for 5 unmapped fields
--
-- OUTBOUND (CRM → AC):
--   algo_especial_viagem → AC 146 (A viagem tem algo especial?)
--   briefing             → AC 77  (SDR WT - Resumo do negócio)
--   epoca_viagem         → AC 56  (Epoca Viagem) — ATIVAR existente
--   frequencia_viagem    → AC 275 (QUALI - Frequência em viagem)
--   usa_agencia          → AC 277 (QUALI - Compra em Agencia?)
--
-- INBOUND (AC → CRM):
--   AC 146 → algo_especial_viagem  (produto_data)
--   AC 77  → briefing              (produto_data)
--   AC 275 → frequencia_viagem     (produto_data)
--   AC 277 → usa_agencia           (produto_data)
--   AC 157 → o_que_e_importante    (produto_data) — corrigir inbound existente
-- ============================================================================

-- Integration ID (ActiveCampaign)
DO $$
DECLARE
    v_int_id uuid := 'a2141b92-561f-4514-92b4-9412a068d236';
BEGIN

-- ═══════════════════════════════════════════════
-- OUTBOUND: CRM → ActiveCampaign
-- ═══════════════════════════════════════════════

-- 1. algo_especial_viagem → AC 146 (text)
INSERT INTO integration_outbound_field_map (integration_id, internal_field, external_field_id, external_field_name, is_active, sync_always, transform_type)
VALUES (v_int_id, 'algo_especial_viagem', '146', 'A viagem tem algum motivo especial?', true, false, 'direct')
ON CONFLICT (integration_id, internal_field) DO UPDATE SET
    external_field_id = EXCLUDED.external_field_id,
    external_field_name = EXCLUDED.external_field_name,
    is_active = true;

-- 2. briefing → AC 77 (textarea)
INSERT INTO integration_outbound_field_map (integration_id, internal_field, external_field_id, external_field_name, is_active, sync_always, transform_type)
VALUES (v_int_id, 'briefing', '77', 'SDR WT - Resumo do negócio', true, false, 'direct')
ON CONFLICT (integration_id, internal_field) DO UPDATE SET
    external_field_id = EXCLUDED.external_field_id,
    external_field_name = EXCLUDED.external_field_name,
    is_active = true;

-- 3. epoca_viagem → AC 56 — ATIVAR mapeamento existente
UPDATE integration_outbound_field_map
SET is_active = true
WHERE integration_id = v_int_id AND internal_field = 'epoca_viagem';

-- 4. frequencia_viagem → AC 275 (multiselect)
INSERT INTO integration_outbound_field_map (integration_id, internal_field, external_field_id, external_field_name, is_active, sync_always, transform_type)
VALUES (v_int_id, 'frequencia_viagem', '275', 'QUALI - Frequência em viagem', true, false, 'direct')
ON CONFLICT (integration_id, internal_field) DO UPDATE SET
    external_field_id = EXCLUDED.external_field_id,
    external_field_name = EXCLUDED.external_field_name,
    is_active = true;

-- 5. usa_agencia → AC 277 (multiselect)
INSERT INTO integration_outbound_field_map (integration_id, internal_field, external_field_id, external_field_name, is_active, sync_always, transform_type)
VALUES (v_int_id, 'usa_agencia', '277', 'QUALI - Compra em Agencia?', true, false, 'direct')
ON CONFLICT (integration_id, internal_field) DO UPDATE SET
    external_field_id = EXCLUDED.external_field_id,
    external_field_name = EXCLUDED.external_field_name,
    is_active = true;

-- ═══════════════════════════════════════════════
-- INBOUND: ActiveCampaign → CRM
-- ═══════════════════════════════════════════════
-- All use storage_location='produto_data', sync_always=false (protect CRM edits)
-- pipe=NULL = applies to ALL pipelines

-- 1. AC 146 → algo_especial_viagem
INSERT INTO integration_field_map (source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location)
VALUES ('active_campaign', 'deal', '146', 'algo_especial_viagem', 'inbound', v_int_id, 'observacoes_criticas', NULL, false, true, 'produto_data')
ON CONFLICT DO NOTHING;

-- 2. AC 77 → briefing
INSERT INTO integration_field_map (source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location)
VALUES ('active_campaign', 'deal', '77', 'briefing', 'inbound', v_int_id, 'observacoes_criticas', NULL, false, true, 'produto_data')
ON CONFLICT DO NOTHING;

-- 3. AC 275 → frequencia_viagem
INSERT INTO integration_field_map (source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location)
VALUES ('active_campaign', 'deal', '275', 'frequencia_viagem', 'inbound', v_int_id, 'observacoes_criticas', NULL, false, true, 'produto_data')
ON CONFLICT DO NOTHING;

-- 4. AC 277 → usa_agencia
INSERT INTO integration_field_map (source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location)
VALUES ('active_campaign', 'deal', '277', 'usa_agencia', 'inbound', v_int_id, 'observacoes_criticas', NULL, false, true, 'produto_data')
ON CONFLICT DO NOTHING;

-- 5. AC 157 → o_que_e_importante (inbound para produto_data, ALL pipelines)
-- Complementa o outbound existente (o_que_e_importante → AC 157)
INSERT INTO integration_field_map (source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location)
VALUES ('active_campaign', 'deal', '157', 'o_que_e_importante', 'inbound', v_int_id, 'observacoes_criticas', NULL, false, true, 'produto_data')
ON CONFLICT DO NOTHING;

END $$;
