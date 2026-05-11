-- ============================================================================
-- MIGRATION: ai_agent_templates.default_playbook_structure — suporte a v2
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- Estende ai_agent_templates pra suportar templates com estrutura de Playbook.
-- Admin ao criar agente novo via wizard escolhe template; se o template
-- tem default_playbook_structure preenchido, o wizard (Marco 3) permite
-- ativar Modo Playbook e popular as tabelas ai_agent_moments +
-- ai_agent_silent_signals + ai_agent_few_shot_examples + scoring rules
-- + os configs JSONB (identity/voice/boundaries) em ai_agents.
--
-- NULL = template v1 apenas (não tem versão Playbook). Seed dos 3 templates
-- iniciais (SDR Clássico, Suporte Reativo, Qualificação Simples) em
-- 20260502j_seed_playbook_templates.sql.
-- ============================================================================

ALTER TABLE ai_agent_templates
  ADD COLUMN IF NOT EXISTS default_playbook_structure JSONB DEFAULT NULL;

-- Shape esperado (simplificado):
-- {
--   "identity": { "role": "SDR", "mission_one_liner": "..." },
--   "voice": { "tone_tags": ["profissional","direta"], "formality": 3, "emoji_policy": "after_rapport", "regionalisms": {...}, "typical_phrases": [...], "forbidden_phrases": [...] },
--   "boundaries": { "library_active": ["never_price","never_transfer"], "custom": [...] },
--   "moments": [
--     { "moment_key": "abertura", "moment_label": "Abertura", "display_order": 1, "trigger_type": "primeiro_contato", "trigger_config": {}, "message_mode": "faithful", "anchor_text": "...", "red_lines": [...], "collects_fields": [] },
--     ...
--   ],
--   "silent_signals": [
--     { "signal_key": "...", "signal_label": "...", "detection_hint": "...", "crm_field_key": "...", "how_to_use": "..." },
--     ...
--   ],
--   "few_shot_examples": [
--     { "lead_message": "...", "agent_response": "...", "related_moment_key": "..." },
--     ...
--   ],
--   "scoring_rules_suggestion": [
--     { "rule_type": "qualify" | "disqualify" | "bonus", "dimension": "...", "label": "...", "condition_type": "equals|range|boolean_true", "condition_value": {...}, "weight": N }
--   ]
-- }

COMMENT ON COLUMN ai_agent_templates.default_playbook_structure IS
  'JSONB com estrutura inicial do Playbook v2. NULL = template v1 apenas. Consumido pelo wizard ao criar agente e marcar Modo Playbook. Popula ai_agent_moments + silent_signals + few_shot + identity/voice/boundaries + sugere scoring_rules pro admin revisar.';
