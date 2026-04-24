-- ============================================================================
-- MIGRATION: ai_agent_scoring_rules.rule_type — diferenciar qualify/disqualify/bonus
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- A infra de scoring (ai_agent_scoring_rules + ai_agent_scoring_config +
-- RPC calculate_agent_qualification_score) já está em produção com 14 regras
-- da Estela. O v2 reusa essa infra pra bloco <qualification> do prompt.
--
-- Adiciona coluna rule_type pra diferenciar:
--   - 'qualify' (default): critério positivo que soma pontos
--   - 'disqualify': condição que desqualifica imediatamente o lead
--   - 'bonus': sinal indireto que adiciona bônus (capped por max_sinal_bonus)
--
-- Backfill: regras existentes com dimension='sinal_indireto' viram
-- rule_type='bonus'. Demais ficam em 'qualify' (comportamento anterior
-- preservado).
--
-- RPC calculate_agent_qualification_score é estendida em 20260502f pra
-- suportar a lógica de disqualify.
-- ============================================================================

ALTER TABLE ai_agent_scoring_rules
  ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'qualify'
    CHECK (rule_type IN ('qualify','disqualify','bonus'));

-- Backfill: regras de sinal_indireto viram bonus (semântica equivalente)
UPDATE ai_agent_scoring_rules
  SET rule_type = 'bonus'
  WHERE dimension = 'sinal_indireto';

CREATE INDEX IF NOT EXISTS ai_agent_scoring_rules_type_idx
  ON ai_agent_scoring_rules(agent_id, rule_type, ativa)
  WHERE ativa = true;

COMMENT ON COLUMN ai_agent_scoring_rules.rule_type IS
  'qualify: critério positivo (soma ao score). disqualify: condição que desqualifica imediatamente (hard stop). bonus: sinal indireto com cap (max_sinal_bonus em ai_agent_scoring_config). Estende sistema v1 pro Playbook v2 sem quebrar compat (backfill seta sinal_indireto → bonus).';
