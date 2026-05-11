-- ============================================================
-- Fix TRIPS stage mappings: add missing AC stages + cleanup seeds
-- ============================================================
-- Integration ID: a2141b92-561f-4514-92b4-9412a068d236
-- TRIPS Pipeline (CRM): c8022522-4a1d-411c-9387-efe03ca725ee
--
-- AC Pipeline 6 (Consultoras TRIPS):
--   Stage 58 (Ganho) → Viagem Confirmada (Ganho) [PLANNER_WON]
--   Stage 164 (Clubmed 2025 - Leads qualificados) → Novo Lead
--
-- AC Pipeline 3 (WEDDING Closer — novos stages):
--   Stage 222 (Reagendamento Closer) → Reunião Agendada (WEDDING)
--   Stage 221 (Oportunidade futura) → 1ª Reunião (WEDDING)
-- ============================================================

BEGIN;

-- 1. Add missing TRIPS mappings (AC Pipeline 6)
-- Only insert if not already exists
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
SELECT 'a2141b92-561f-4514-92b4-9412a068d236', '6', '58', 'Ganho', 'cba42c81-7a3e-40bf-bf66-990d9c09b8d3', 'inbound'
WHERE NOT EXISTS (
  SELECT 1 FROM integration_stage_map
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND pipeline_id = '6' AND external_stage_id = '58' AND direction = 'inbound'
);

INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
SELECT 'a2141b92-561f-4514-92b4-9412a068d236', '6', '164', 'Clubmed 2025 - Leads qualificados', '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9', 'inbound'
WHERE NOT EXISTS (
  SELECT 1 FROM integration_stage_map
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND pipeline_id = '6' AND external_stage_id = '164' AND direction = 'inbound'
);

-- 2. Add missing WEDDING mappings (AC Pipeline 3 — new stages)
INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
SELECT 'a2141b92-561f-4514-92b4-9412a068d236', '3', '222', 'Reagendamento Closer', 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1', 'inbound'
WHERE NOT EXISTS (
  SELECT 1 FROM integration_stage_map
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND pipeline_id = '3' AND external_stage_id = '222' AND direction = 'inbound'
);

INSERT INTO integration_stage_map (integration_id, pipeline_id, external_stage_id, external_stage_name, internal_stage_id, direction)
SELECT 'a2141b92-561f-4514-92b4-9412a068d236', '3', '221', 'Oportunidade futura', 'ef9233fa-9c72-4c54-8995-c02061c4be9f', 'inbound'
WHERE NOT EXISTS (
  SELECT 1 FROM integration_stage_map
  WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND pipeline_id = '3' AND external_stage_id = '221' AND direction = 'inbound'
);

-- 3. Cleanup seed entries (non-numeric IDs that never match real AC events)
DELETE FROM integration_stage_map
WHERE external_stage_id LIKE 'seed_%';

COMMIT;
