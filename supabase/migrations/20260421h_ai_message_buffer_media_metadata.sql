-- ============================================================
-- MIGRATION: ai_message_buffer ADD COLUMN media_url, metadata
-- Date: 2026-04-21
--
-- Bug descoberto em 2026-04-20: o código da edge function ai-agent-router
-- seleciona `media_url` e o whatsapp-webhook insere `media_url` + `metadata`,
-- mas essas colunas nunca foram criadas na tabela `ai_message_buffer`.
-- Consequência: INSERT do webhook falha silenciosamente (42703) e SELECT do
-- router retorna vazio — o debounce/combine de mensagens agrupadas NUNCA
-- funcionou em produção desde o commit e614bdc (2026-04-13).
--
-- Não-destrutivo: apenas ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE ai_message_buffer
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN ai_message_buffer.media_url IS
  'URL da mídia anexada (imagem/áudio/documento) quando message_type != text. Consumido pelo ai-agent-router.processMediaInline no combine de debounce.';

COMMENT ON COLUMN ai_message_buffer.metadata IS
  'Metadados extras vindos do webhook (ex: phone_number_label). Usado para diagnóstico e enriquecimento de contexto.';
