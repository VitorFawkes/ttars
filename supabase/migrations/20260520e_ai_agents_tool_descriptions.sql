-- AI Agent V2 — override per-agente das descrições das tools no prompt.
--
-- Hoje as descrições das 8 tools built-in (calculate_qualification_score,
-- search_knowledge_base, check_calendar, confirm_meeting_slot,
-- request_handoff, update_contact, assign_tag, create_task) vivem hardcoded
-- em prompt_assembler.ts (DEFAULT_TOOL_DESCRIPTIONS). Esta coluna permite
-- ao admin sobrescrever o texto que vai pro LLM por agente, sem deploy.
--
-- Estrutura: { tool_name: "texto customizado", ... }. Chaves ausentes →
-- usa o default hardcoded. Default da coluna {} mantém comportamento atual.
--
-- Aditiva, zero-impacto pra agentes existentes (Patricia inclui).

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS tool_descriptions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_agents.tool_descriptions IS
  'Override per-agente das descrições das tools built-in no prompt. Chave = nome da tool (ex "request_handoff"). Valor = texto que substitui o default hardcoded em prompt_assembler.ts. Chave ausente = usa default.';
