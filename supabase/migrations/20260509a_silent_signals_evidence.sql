-- 20260509a_silent_signals_evidence.sql
--
-- Adiciona campos estruturados pra detecção de sinais silenciosos:
--
--   detection_mode: 'inferred' (LLM julga) | 'explicit' (lead deve mencionar
--     palavra-chave). Default 'inferred' pra backward compat.
--
--   evidence_keywords: array de palavras/frases que contam como evidência
--     explícita do sinal. Renderizado no prompt como lista estruturada,
--     e (futuro) validador pode checar antes de creditar o sinal.
--
-- Justificativa: detection_hint (textarea livre) tem ~60-80% de obediência
-- porque é prose. Estruturar evidence_keywords dá ao LLM critério explícito
-- e ao admin garantia de o que conta vs não conta como evidência.
--
-- Backward compat: campos novos são opcionais, sinais existentes seguem
-- funcionando exatamente como antes (detection_mode default = 'inferred',
-- evidence_keywords default = []).

ALTER TABLE ai_agent_silent_signals
  ADD COLUMN IF NOT EXISTS detection_mode TEXT NOT NULL DEFAULT 'inferred'
    CHECK (detection_mode IN ('inferred', 'explicit'));

ALTER TABLE ai_agent_silent_signals
  ADD COLUMN IF NOT EXISTS evidence_keywords TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN ai_agent_silent_signals.detection_mode IS
  'inferred: LLM julga pelo contexto (default, prose hint). explicit: só credita se lead mencionar palavra de evidence_keywords.';

COMMENT ON COLUMN ai_agent_silent_signals.evidence_keywords IS
  'Palavras/frases que contam como evidência explícita do sinal. Usado quando detection_mode=explicit. Render estruturado no prompt + (futuro) gate determinístico.';
