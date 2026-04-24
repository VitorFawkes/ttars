-- ============================================================================
-- MIGRATION: ai_conversation_state.last_moment_key — rastreio de momento anterior
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- ai_conversation_state hoje é criada vazia pelo getOrCreateConversation
-- em ai-agent-router (~linha 896-903), mas NUNCA é lida em buildConversationContext.
-- O v2 precisa saber em qual momento a conversa estava no turno anterior
-- pra (a) evitar repetir momento que já rodou, (b) alimentar detecção híbrida
-- quando determinístico e LLM falham.
--
-- Adiciona coluna last_moment_key. Runtime v2 (persona_v2.ts) atualiza
-- essa coluna após emitir cada resposta. buildConversationContext passa
-- a ler essa coluna e injetar no ctx.last_moment_key — essa refatoração
-- acontece no Marco 2b (runtime backend).
-- ============================================================================

ALTER TABLE ai_conversation_state
  ADD COLUMN IF NOT EXISTS last_moment_key TEXT;

ALTER TABLE ai_conversation_state
  ADD COLUMN IF NOT EXISTS last_moment_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ai_conversation_state_last_moment_idx
  ON ai_conversation_state(conversation_id, last_moment_key)
  WHERE last_moment_key IS NOT NULL;

COMMENT ON COLUMN ai_conversation_state.last_moment_key IS
  'Slug do último momento classificado na conversa (Playbook v2). Atualizado pelo persona_v2.ts a cada turno. Lido por buildConversationContext pra alimentar ctx.last_moment_key → detectMoment.';

COMMENT ON COLUMN ai_conversation_state.last_moment_updated_at IS
  'Quando last_moment_key foi atualizado pela última vez. Útil pra debug e pra futuras lógicas de "volta depois de X tempo".';
