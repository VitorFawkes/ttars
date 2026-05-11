-- 20260508d_agent_name_placeholder.sql
--
-- Substitui o nome literal do agente por placeholder {agent_name} em campos
-- editáveis pelo admin. Resolver em runtime (placeholder_resolver.ts) já está
-- ativo em ai-agent-router e ai-agent-router-v2 — substitui {agent_name} pelo
-- valor de ai_agents.nome quando o agente roda.
--
-- Idempotente: se rodar 2x, segunda execução não faz nada (texto já tem
-- {agent_name}, não tem mais 'Estela'/'Patricia').
--
-- Campos cobertos (apenas 2 agentes em prod hoje):
--   Estela (43180319-650c-490a-87be-f275550285f8): replace 'Estela' → '{agent_name}'
--   Patricia (4d96d9b4-e909-4441-bd85-d3f807cccfa7): replace 'Patricia' → '{agent_name}'
--
-- Campos NÃO tocados (por design):
--   ai_conversation_turns, ai_conversations, ai_messages — histórico imutável
--   ai_agents.nome — é o valor que o resolver USA pra substituir
--
-- Risco: zero se resolver edge function deployado ANTES desta migration.
--   Verificação: `git log` mostra deploy de ai-agent-router e ai-agent-router-v2
--   anteriores a esta migration.

-- Helper local: faz REPLACE só se o valor não for NULL
-- (PostgreSQL REPLACE retorna NULL se input é NULL, nada a fazer).

-- ============================================================================
-- 1. ESTELA: replace 'Estela' → '{agent_name}'
-- ============================================================================

-- 1.1. ai_agents (campos TEXT)
UPDATE ai_agents
SET
  system_prompt = REPLACE(system_prompt, 'Estela', '{agent_name}'),
  descricao = REPLACE(descricao, 'Estela', '{agent_name}'),
  persona = REPLACE(persona, 'Estela', '{agent_name}'),
  fallback_message = REPLACE(fallback_message, 'Estela', '{agent_name}'),
  updated_at = NOW()
WHERE id = '43180319-650c-490a-87be-f275550285f8';

-- 1.2. ai_agents JSONB fields (cast text, replace, cast jsonb)
UPDATE ai_agents
SET
  identity_config = REPLACE(identity_config::text, 'Estela', '{agent_name}')::jsonb,
  voice_config = REPLACE(voice_config::text, 'Estela', '{agent_name}')::jsonb,
  boundaries_config = REPLACE(boundaries_config::text, 'Estela', '{agent_name}')::jsonb,
  listening_config = REPLACE(listening_config::text, 'Estela', '{agent_name}')::jsonb,
  handoff_actions = REPLACE(handoff_actions::text, 'Estela', '{agent_name}')::jsonb,
  handoff_signals = REPLACE(handoff_signals::text, 'Estela', '{agent_name}')::jsonb,
  intelligent_decisions = REPLACE(intelligent_decisions::text, 'Estela', '{agent_name}')::jsonb,
  validator_rules = REPLACE(validator_rules::text, 'Estela', '{agent_name}')::jsonb,
  prompts_extra = REPLACE(prompts_extra::text, 'Estela', '{agent_name}')::jsonb,
  context_fields_config = REPLACE(context_fields_config::text, 'Estela', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE id = '43180319-650c-490a-87be-f275550285f8';

-- 1.3. ai_agent_moments (anchor_text, intent são TEXT; red_lines/must_cover/literal_phrases são JSONB array)
UPDATE ai_agent_moments
SET
  anchor_text = REPLACE(anchor_text, 'Estela', '{agent_name}'),
  intent = REPLACE(intent, 'Estela', '{agent_name}'),
  red_lines = COALESCE(ARRAY(SELECT REPLACE(elem, 'Estela', '{agent_name}') FROM unnest(red_lines) AS elem), red_lines),
  must_cover = REPLACE(must_cover::text, 'Estela', '{agent_name}')::jsonb,
  literal_phrases = REPLACE(literal_phrases::text, 'Estela', '{agent_name}')::jsonb,
  trigger_config = REPLACE(trigger_config::text, 'Estela', '{agent_name}')::jsonb,
  discovery_config = REPLACE(discovery_config::text, 'Estela', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- 1.4. ai_agent_few_shot_examples
UPDATE ai_agent_few_shot_examples
SET
  lead_message = REPLACE(lead_message, 'Estela', '{agent_name}'),
  agent_response = REPLACE(agent_response, 'Estela', '{agent_name}'),
  context_note = REPLACE(context_note, 'Estela', '{agent_name}'),
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- 1.5. ai_agent_silent_signals
UPDATE ai_agent_silent_signals
SET
  signal_label = REPLACE(signal_label, 'Estela', '{agent_name}'),
  detection_hint = REPLACE(detection_hint, 'Estela', '{agent_name}'),
  how_to_use = REPLACE(how_to_use, 'Estela', '{agent_name}'),
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- 1.6. ai_agent_business_config
UPDATE ai_agent_business_config
SET
  company_description = REPLACE(company_description, 'Estela', '{agent_name}'),
  methodology_text = REPLACE(methodology_text, 'Estela', '{agent_name}'),
  custom_blocks = REPLACE(custom_blocks::text, 'Estela', '{agent_name}')::jsonb,
  process_steps = REPLACE(process_steps::text, 'Estela', '{agent_name}')::jsonb,
  pricing_json = REPLACE(pricing_json::text, 'Estela', '{agent_name}')::jsonb,
  calendar_config = REPLACE(calendar_config::text, 'Estela', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- 1.7. ai_agent_scoring_rules (label TEXT + condition_value JSONB)
UPDATE ai_agent_scoring_rules
SET
  label = REPLACE(label, 'Estela', '{agent_name}'),
  condition_value = REPLACE(condition_value::text, 'Estela', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- 1.8. ai_agent_special_scenarios (vazio na Estela mas é defensive — TEXT/JSONB mistos)
UPDATE ai_agent_special_scenarios
SET
  trigger_description = REPLACE(trigger_description, 'Estela', '{agent_name}'),
  response_adjustment = REPLACE(response_adjustment, 'Estela', '{agent_name}')
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

-- ============================================================================
-- 2. PATRICIA: replace 'Patricia' → '{agent_name}'
-- ============================================================================

UPDATE ai_agents
SET
  system_prompt = REPLACE(system_prompt, 'Patricia', '{agent_name}'),
  descricao = REPLACE(descricao, 'Patricia', '{agent_name}'),
  persona = REPLACE(persona, 'Patricia', '{agent_name}'),
  fallback_message = REPLACE(fallback_message, 'Patricia', '{agent_name}'),
  identity_config = REPLACE(identity_config::text, 'Patricia', '{agent_name}')::jsonb,
  voice_config = REPLACE(voice_config::text, 'Patricia', '{agent_name}')::jsonb,
  boundaries_config = REPLACE(boundaries_config::text, 'Patricia', '{agent_name}')::jsonb,
  listening_config = REPLACE(listening_config::text, 'Patricia', '{agent_name}')::jsonb,
  handoff_actions = REPLACE(handoff_actions::text, 'Patricia', '{agent_name}')::jsonb,
  handoff_signals = REPLACE(handoff_signals::text, 'Patricia', '{agent_name}')::jsonb,
  intelligent_decisions = REPLACE(intelligent_decisions::text, 'Patricia', '{agent_name}')::jsonb,
  validator_rules = REPLACE(validator_rules::text, 'Patricia', '{agent_name}')::jsonb,
  prompts_extra = REPLACE(prompts_extra::text, 'Patricia', '{agent_name}')::jsonb,
  context_fields_config = REPLACE(context_fields_config::text, 'Patricia', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_moments
SET
  anchor_text = REPLACE(anchor_text, 'Patricia', '{agent_name}'),
  intent = REPLACE(intent, 'Patricia', '{agent_name}'),
  red_lines = COALESCE(ARRAY(SELECT REPLACE(elem, 'Patricia', '{agent_name}') FROM unnest(red_lines) AS elem), red_lines),
  must_cover = REPLACE(must_cover::text, 'Patricia', '{agent_name}')::jsonb,
  literal_phrases = REPLACE(literal_phrases::text, 'Patricia', '{agent_name}')::jsonb,
  trigger_config = REPLACE(trigger_config::text, 'Patricia', '{agent_name}')::jsonb,
  discovery_config = REPLACE(discovery_config::text, 'Patricia', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_few_shot_examples
SET
  lead_message = REPLACE(lead_message, 'Patricia', '{agent_name}'),
  agent_response = REPLACE(agent_response, 'Patricia', '{agent_name}'),
  context_note = REPLACE(context_note, 'Patricia', '{agent_name}'),
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_silent_signals
SET
  signal_label = REPLACE(signal_label, 'Patricia', '{agent_name}'),
  detection_hint = REPLACE(detection_hint, 'Patricia', '{agent_name}'),
  how_to_use = REPLACE(how_to_use, 'Patricia', '{agent_name}'),
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_business_config
SET
  company_description = REPLACE(company_description, 'Patricia', '{agent_name}'),
  methodology_text = REPLACE(methodology_text, 'Patricia', '{agent_name}'),
  custom_blocks = REPLACE(custom_blocks::text, 'Patricia', '{agent_name}')::jsonb,
  process_steps = REPLACE(process_steps::text, 'Patricia', '{agent_name}')::jsonb,
  pricing_json = REPLACE(pricing_json::text, 'Patricia', '{agent_name}')::jsonb,
  calendar_config = REPLACE(calendar_config::text, 'Patricia', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_scoring_rules
SET
  label = REPLACE(label, 'Patricia', '{agent_name}'),
  condition_value = REPLACE(condition_value::text, 'Patricia', '{agent_name}')::jsonb,
  updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

UPDATE ai_agent_special_scenarios
SET
  trigger_description = REPLACE(trigger_description, 'Patricia', '{agent_name}'),
  response_adjustment = REPLACE(response_adjustment, 'Patricia', '{agent_name}')
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
