-- ============================================================
-- Wedding Inbound Triggers: 11 triggers (6 AC pipelines)
-- Controla quando criar/atualizar cards a partir de deals AC
-- Depende de: 20260228_wedding_pipeline_stages.sql
-- ============================================================

-- Helper: resolve CRM stage UUID by name within Wedding pipeline
CREATE OR REPLACE FUNCTION _ww_stage(p_nome TEXT) RETURNS UUID AS $$
    SELECT id FROM pipeline_stages
    WHERE pipeline_id = 'f4611f84-ce9c-48ad-814b-dcd6081f15db' AND nome = p_nome
    LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ═══════════════════════════════════════════════════════════
-- Pipeline 1 — SDR Weddings
-- ═══════════════════════════════════════════════════════════

-- Criação: apenas quando deal entra no stage 1 (Triagem MQL)
INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'SDR WW - Criação',
    '1', ARRAY['1'], '1', ARRAY['1'],
    'create_only', _ww_stage('Novo Lead'), 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
    ARRAY['deal','contact'], false, 'fields_only', 'stage', true
);

-- Atualização: qualquer stage no pipeline 1
INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'SDR WW - Atualização',
    '1', ARRAY['1'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- ═══════════════════════════════════════════════════════════
-- Pipeline 3 — Closer Weddings
-- ═══════════════════════════════════════════════════════════

-- Criação: qualquer stage (import inicial de deals existentes)
INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Closer WW - Criação',
    '3', ARRAY['3'], '', ARRAY['13','14','15','16','37','163','193'],
    'create_only', NULL, 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
    ARRAY['deal','contact'], false, 'fields_only', 'stage', true
);

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Closer WW - Atualização',
    '3', ARRAY['3'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- ═══════════════════════════════════════════════════════════
-- Pipeline 4 — Planejamento Weddings
-- ═══════════════════════════════════════════════════════════

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Planejamento WW - Criação',
    '4', ARRAY['4'], '', ARRAY['20','21','22','23','25','146','147'],
    'create_only', NULL, 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
    ARRAY['deal','contact'], false, 'fields_only', 'stage', true
);

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Planejamento WW - Atualização',
    '4', ARRAY['4'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- ═══════════════════════════════════════════════════════════
-- Pipeline 12 — Elopment Wedding
-- ═══════════════════════════════════════════════════════════

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Elopement WW - Criação',
    '12', ARRAY['12'], '', ARRAY['62','182','184','185','186','198','199'],
    'create_only', NULL, 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
    ARRAY['deal','contact'], false, 'fields_only', 'stage', true
);

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Elopement WW - Atualização',
    '12', ARRAY['12'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- ═══════════════════════════════════════════════════════════
-- Pipeline 17 — WW Internacional
-- ═══════════════════════════════════════════════════════════

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Internacional WW - Criação',
    '17', ARRAY['17'], '81', ARRAY['81'],
    'create_only', _ww_stage('Novo Lead'), 'f4611f84-ce9c-48ad-814b-dcd6081f15db',
    ARRAY['deal','contact'], false, 'fields_only', 'stage', true
);

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Internacional WW - Atualização',
    '17', ARRAY['17'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- ═══════════════════════════════════════════════════════════
-- Pipeline 31 — Outros Desqualificados (só update)
-- ═══════════════════════════════════════════════════════════

INSERT INTO integration_inbound_triggers (
    integration_id, name, external_pipeline_id, external_pipeline_ids, external_stage_id, external_stage_ids,
    action_type, target_stage_id, target_pipeline_id,
    entity_types, bypass_validation, validation_level, quarantine_mode, is_active
) VALUES (
    'a2141b92-561f-4514-92b4-9412a068d236',
    'Desqualificados WW - Atualização',
    '31', ARRAY['31'], '', NULL,
    'update_only', NULL, NULL,
    ARRAY['deal','contact'], true, 'fields_only', 'stage', true
);

-- Cleanup helper function
DROP FUNCTION _ww_stage(TEXT);

-- Verificação
DO $$
DECLARE
    cnt INT;
BEGIN
    SELECT COUNT(*) INTO cnt FROM integration_inbound_triggers
    WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
      AND external_pipeline_id IN ('1','3','4','12','17','31');
    IF cnt != 11 THEN
        RAISE EXCEPTION 'Expected 11 inbound triggers for Wedding, got %', cnt;
    END IF;
    RAISE NOTICE 'Wedding inbound triggers: % created', cnt;
END $$;
