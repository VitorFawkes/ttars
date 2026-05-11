-- ============================================================
-- Reativação v4 — Novas colunas em reactivation_patterns
-- ============================================================

ALTER TABLE reactivation_patterns
  ADD COLUMN IF NOT EXISTS last_lost_reason_id UUID REFERENCES motivos_perda(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_lost_reason_name TEXT,
  ADD COLUMN IF NOT EXISTS last_responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recent_interaction_warning BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_sibling_open_card BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_reactivation_patterns_responsavel
  ON reactivation_patterns(org_id, last_responsavel_id);

CREATE INDEX IF NOT EXISTS idx_reactivation_patterns_lost_reason
  ON reactivation_patterns(org_id, last_lost_reason_id);

COMMENT ON COLUMN reactivation_patterns.last_responsavel_id IS
  'Responsável do último card (ganho ou perdido) do contato. Usado como filtro "minha carteira".';

COMMENT ON COLUMN reactivation_patterns.recent_interaction_warning IS
  'TRUE se days_since_interaction < 30. Badge âmbar na UI, não exclui.';

COMMENT ON COLUMN reactivation_patterns.has_sibling_open_card IS
  'TRUE se contato tem card aberto em org irmã (mesma account com sharing). Informativo.';
