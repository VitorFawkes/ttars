-- ============================================================================
-- MIGRATION: ai_agent_moments.intent
-- Date: 2026-04-29
--
-- Separa "intenção" (POR QUÊ a fase existe / o que queremos extrair) do
-- "texto" (anchor_text — COMO a agente fala). Hoje o anchor_text serve
-- pros dois propósitos dependendo do message_mode (literal/faithful = texto
-- exato; free = descrição da intenção). Isso confunde admin e perde info
-- quando troca de modo.
--
-- Com intent separado:
--   - literal/faithful: admin escreve texto + intenção. Agente segue texto;
--     intent é guard rail e contexto pro LLM.
--   - free: anchor_text vira opcional, intent é o conteúdo principal.
--   - Trocar modo preserva ambas info — sem retrabalho.
--
-- Default NULL pra manter backward compat. Moments existentes continuam
-- funcionando sem intent (LLM usa só anchor_text como antes).
-- ============================================================================

ALTER TABLE ai_agent_moments
  ADD COLUMN IF NOT EXISTS intent TEXT;

COMMENT ON COLUMN ai_agent_moments.intent IS
  'Intenção da fase em 1-2 frases (POR QUÊ ela existe / o que queremos extrair). Separado de anchor_text (que é o COMO falar). Útil em modo literal/faithful como guard rail e contexto, e em free como objetivo principal.';
