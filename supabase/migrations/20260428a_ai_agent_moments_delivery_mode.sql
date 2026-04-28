-- ============================================================================
-- MIGRATION: ai_agent_moments.delivery_mode
-- Date: 2026-04-28
--
-- Permite controlar, por fase do Playbook, se a agente:
--   - all_at_once: manda toda a resposta numa rajada (até max_message_blocks)
--   - wait_for_reply: manda UMA mensagem só e espera o lead responder antes
--                     de avançar (útil pra abertura — não despejar tudo de uma vez)
--
-- Default 'all_at_once' preserva comportamento existente.
-- ============================================================================

ALTER TABLE ai_agent_moments
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'all_at_once'
    CHECK (delivery_mode IN ('all_at_once', 'wait_for_reply'));

COMMENT ON COLUMN ai_agent_moments.delivery_mode IS
  'all_at_once: agente quebra a resposta em até max_message_blocks blocos numa só vez. wait_for_reply: agente manda APENAS UMA mensagem e aguarda lead responder antes de avançar (controlado via instrução de prompt em prompt_builder_v2).';
