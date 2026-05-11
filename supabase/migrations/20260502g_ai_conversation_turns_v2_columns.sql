-- ============================================================================
-- MIGRATION: ai_conversation_turns — 5 colunas v2 pra observabilidade
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- Permite rastrear por turno: qual versão do runtime rodou (v1/v2),
-- qual momento estava ativo, score de qualificação calculado, como o
-- momento foi detectado (determinístico/LLM/fallback) e a razão.
--
-- Fundamental pra:
--   - Filtro "Versão" na AiAgentConversationsPage (Marco 4)
--   - Badge de fase em cada resposta do assistant no detalhe da conversa
--   - View ai_agent_v1_v2_comparison pra card comparativo na AnalyticsPage
--   - Diagnóstico: "a conversa travou no momento X por qual razão?"
--
-- Todas default NULL (v1) ou 'v1' (agent_version com default). Turnos
-- antigos ficam marcados como v1, novos do v2 preenchem conforme persona_v2
-- retorna metadata.
-- ============================================================================

ALTER TABLE ai_conversation_turns
  ADD COLUMN IF NOT EXISTS agent_version TEXT NOT NULL DEFAULT 'v1'
    CHECK (agent_version IN ('v1', 'v2'));

ALTER TABLE ai_conversation_turns
  ADD COLUMN IF NOT EXISTS current_moment_key TEXT;

ALTER TABLE ai_conversation_turns
  ADD COLUMN IF NOT EXISTS qualification_score_at_turn NUMERIC;

ALTER TABLE ai_conversation_turns
  ADD COLUMN IF NOT EXISTS moment_detection_method TEXT
    CHECK (moment_detection_method IS NULL OR moment_detection_method IN ('deterministic', 'llm', 'fallback', 'manual'));

ALTER TABLE ai_conversation_turns
  ADD COLUMN IF NOT EXISTS moment_transition_reason TEXT;

-- Índices pra queries de analytics e filtros
CREATE INDEX IF NOT EXISTS ai_conversation_turns_agent_version_idx
  ON ai_conversation_turns(agent_id, agent_version, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_conversation_turns_moment_idx
  ON ai_conversation_turns(conversation_id, current_moment_key)
  WHERE agent_version = 'v2' AND current_moment_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_conversation_turns_score_idx
  ON ai_conversation_turns(agent_id, qualification_score_at_turn DESC)
  WHERE qualification_score_at_turn IS NOT NULL;

-- Comments
COMMENT ON COLUMN ai_conversation_turns.agent_version IS
  'v1 (default) ou v2. Qual runtime gerou este turno. Preenchido pelo router conforme ai_agents.playbook_enabled no momento da execução.';

COMMENT ON COLUMN ai_conversation_turns.current_moment_key IS
  'Slug do momento ativo no Playbook v2 quando este turno foi gerado. NULL em v1. Refere a ai_agent_moments.moment_key.';

COMMENT ON COLUMN ai_conversation_turns.qualification_score_at_turn IS
  'Score de qualificação calculado antes de gerar a resposta deste turno. NULL quando scoring desabilitado ou v1 sem cálculo explícito.';

COMMENT ON COLUMN ai_conversation_turns.moment_detection_method IS
  'deterministic: trigger explícito bateu (primeiro_contato, keyword, score_threshold). llm: backoffice classificou. fallback: last_moment ou primeiro disponível. manual: admin forçou via simulador.';

COMMENT ON COLUMN ai_conversation_turns.moment_transition_reason IS
  'Frase curta descrevendo por que este momento foi escolhido. Ex: "primeiro_contato", "trigger:keyword", "backoffice_classified", "last_moment_from_state".';
