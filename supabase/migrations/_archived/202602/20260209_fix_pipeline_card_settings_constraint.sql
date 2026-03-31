-- ============================================================
-- Fix: pipeline_card_settings - adicionar constraint para upsert por phase_id
--
-- Problema: Admin UI (KanbanGrid/KanbanSequencer) salva com
-- onConflict: 'phase_id,usuario_id', mas só existia constraint
-- UNIQUE (fase, usuario_id). O upsert falhava silenciosamente.
-- ============================================================

-- 1. Popular phase_id nos registros existentes (baseado no nome da fase)
UPDATE pipeline_card_settings pcs
SET phase_id = pp.id
FROM pipeline_phases pp
WHERE pcs.fase = pp.name
  AND pcs.phase_id IS NULL;

-- 2. Adicionar unique constraint em (phase_id, usuario_id)
-- para que o upsert do admin funcione corretamente
ALTER TABLE pipeline_card_settings
DROP CONSTRAINT IF EXISTS pipeline_card_settings_phase_id_usuario_id_key;

ALTER TABLE pipeline_card_settings
ADD CONSTRAINT pipeline_card_settings_phase_id_usuario_id_key
UNIQUE (phase_id, usuario_id);

-- Manter constraint antiga (fase, usuario_id) para fallback/compatibilidade
