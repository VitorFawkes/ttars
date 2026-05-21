-- AI Agent V2 — regras de gravação de dados no CRM (estruturadas).
--
-- Substitui o texto livre em `prompts_extra.data_update` (até hoje, 2.500
-- chars na Patricia) por array de regras editáveis pela UI:
--
--   [
--     { "key": "no_null",   "title": "Nunca gravar null", "instruction": "...",
--       "enabled": true,    "order": 1 },
--     { "key": "normalize_numbers", "title": "Normalizar números", "instruction": "...",
--       "enabled": true,    "order": 2 },
--     ...
--   ]
--
-- Quando o array tem itens habilitados, o router monta o bloco
-- <data_update_rules> a partir disso (cada item enabled vira parágrafo
-- numerado). Quando vazio, fallback pro texto legado.
--
-- Aditiva, zero-impacto pra agentes existentes (Patricia continua via fallback).

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS data_update_rules JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ai_agents.data_update_rules IS
  'Regras estruturadas de gravação de dados no CRM — substitui prompts_extra.data_update (texto livre). Array de { key, title, instruction, enabled, order }. Quando vazio/[], fallback pro texto legado.';
