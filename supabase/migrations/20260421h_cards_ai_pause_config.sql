-- Adiciona campo ai_pause_config em cards para suportar handoff_actions.pause_permanently.
-- Estrutura: { permanent: bool, reason: text, paused_at: timestamptz }
-- Quando permanent=true, o router não deve reativar o agente automaticamente.
-- ai_responsavel='humano' já pausa o agente; este campo adiciona intenção de
-- "não reativar via automação" (ex: se um fluxo automático zerasse ai_responsavel).

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS ai_pause_config JSONB;

COMMENT ON COLUMN public.cards.ai_pause_config IS
  'Config de pausa do agente IA. Estrutura: {permanent: bool, reason: text, paused_at: timestamptz}. Populada por ai-agent-router quando request_handoff dispara com handoff_actions.pause_permanently=true.';
