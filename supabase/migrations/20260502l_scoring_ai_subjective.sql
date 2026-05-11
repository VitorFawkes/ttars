-- ============================================================================
-- MIGRATION: ai_agent_scoring_rules — adiciona condition_type 'ai_subjective'
-- Date: 2026-05-02
--
-- Parte do Marco 3.1 do Playbook Conversacional v2 (UX Qualificação).
--
-- Permite critérios de qualificação que não dependem de campo preenchido
-- no CRM — a IA avalia subjetivamente do histórico da conversa.
--
-- Exemplo de regra ai_subjective:
--   condition_type = 'ai_subjective'
--   condition_value = { "question": "O casal demonstra senso de urgência clara pra casar?" }
--   weight = 5
--   rule_type = 'qualify'
--
-- Runtime (persona_v2.ts): antes de chamar calculate_agent_qualification_score,
-- avalia regras ai_subjective com uma única chamada LLM agregada (resposta
-- yes/no por regra) e injeta no p_inputs como campo booleano resolvido,
-- convertendo a regra pra condition_type='boolean_true' em memória.
-- A RPC não precisa mudar.
-- ============================================================================

-- Expande CHECK constraint de condition_type
ALTER TABLE ai_agent_scoring_rules
  DROP CONSTRAINT IF EXISTS ai_agent_scoring_rules_condition_type_check;

ALTER TABLE ai_agent_scoring_rules
  ADD CONSTRAINT ai_agent_scoring_rules_condition_type_check
  CHECK (condition_type IN ('equals', 'range', 'boolean_true', 'ai_subjective'));

COMMENT ON COLUMN ai_agent_scoring_rules.condition_value IS
  'JSONB: formato depende de condition_type. equals: {value}. range: {min, max}. boolean_true: {field} (nome do campo em p_inputs que deve ser true). ai_subjective: {question} (pergunta que a IA avalia sobre o histórico da conversa, runtime resolve antes de chamar a RPC).';
