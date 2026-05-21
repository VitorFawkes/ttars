-- AI Agent V2 — cérebro analítico estruturado.
--
-- Substitui o textão livre em `prompts_extra.context` (até hoje, 8.500
-- chars na Patricia com 5 sub-rotinas) por struct configurável pela UI:
--
--   {
--     "detect_contradictions":      { "enabled": true,  "instruction": "..." },
--     "detect_pending_promises":    { "enabled": true,  "instruction": "..." },
--     "detect_unanswered_questions":{ "enabled": true,  "instruction": "..." },
--     "detect_pitch_saturation":    { "enabled": true,  "instruction": "...",
--                                     "pitch_keywords": [...],
--                                     "window_turns": 5, "threshold": 2 },
--     "audit_viability":            { "enabled": true,  "instruction": "...",
--                                     "budget_field": "ww_orcamento_faixa",
--                                     "guests_field": "ww_num_convidados",
--                                     "zones": [...], "currency_rates": [...] }
--   }
--
-- Quando preenchido, o router V2 monta o bloco <context_rules> a partir
-- desse struct (cada sub-rotina enabled vira um parágrafo numerado).
-- Quando ausente/vazio, fallback pro texto legado em prompts_extra.context.
--
-- Aditiva, zero-impacto pra agentes existentes (Patricia continua via fallback).

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS cognitive_audit_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_agents.cognitive_audit_config IS
  'Cérebro analítico estruturado — substitui prompts_extra.context (texto livre). 5 sub-rotinas configuráveis pela UI: detect_contradictions, detect_pending_promises, detect_unanswered_questions, detect_pitch_saturation, audit_viability. Cada uma: {enabled, instruction, ...params específicos}. Vazio = fallback pro texto legado.';
