-- ============================================================================
-- C1 - Adiciona JSONB knobs ao ai_agents para suportar 14 configurações
-- ============================================================================
-- Marco C1 do roadmap: Fundação do banco de dados para editor de agentes
-- Campos adicionados:
--   - handoff_signals: lista de sinais inteligentes (8 sinais habilitáveis)
--   - intelligent_decisions: 9 decisões inteligentes do agente (toggle + config)
--   - validator_rules: regras editáveis do validador (lista de condição/ação)
--   - timings: debounce, typing delay, max blocos
--   - pipeline_models: modelos por fase (main, formatter, validator, context, data)
--   - multimodal_config: áudio/imagem/PDF on/off
--   - context_fields_config: campos visíveis e atualizáveis do CRM
--   - handoff_actions: o que acontece no card quando handoff dispara
--   - memory_config: expandido semanticamente (já existe, apenas documentamos esperado)

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS handoff_signals JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS intelligent_decisions JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS validator_rules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS timings JSONB DEFAULT '{"debounce_seconds":20,"typing_delay_seconds":4,"max_message_blocks":3}'::jsonb,
ADD COLUMN IF NOT EXISTS pipeline_models JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS multimodal_config JSONB DEFAULT '{"audio":true,"image":true,"pdf":true}'::jsonb,
ADD COLUMN IF NOT EXISTS context_fields_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS handoff_actions JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- Documentação dos campos JSONB novos
-- ============================================================================

COMMENT ON COLUMN ai_agents.handoff_signals IS
'Array de objetos com os sinais habilitáveis para handoff inteligente.
Estrutura: [
  {
    "slug": "customer_dissatisfied",
    "enabled": true,
    "description": "Cliente está insatisfeito (tom frustrado, críticas repetidas)"
  },
  ...
]
Sinais suportados: customer_dissatisfied, explicit_human_request, out_of_scope, sensitive_info, incomprehension_loop, regulatory, high_purchase_intent_blocked, conversation_timeout';

COMMENT ON COLUMN ai_agents.intelligent_decisions IS
'Objeto com as 9 decisões inteligentes que o agente considera.
Estrutura: {
  "when_create_meeting": {
    "enabled": true,
    "config": {
      "prerequisites": ["email_available"],
      "min_interactions": 1
    }
  },
  "when_update_contact": {
    "enabled": true,
    "config": {
      "fields": ["name", "email", "phone"],
      "evidence_level": "medium"
    }
  },
  ...
}
Decisões: when_create_meeting, when_update_contact, when_apply_tag, when_search_kb,
when_ask_context_vs_answer, tone_adjustment, consolidate_summary, re_presentation,
escalate_to_other_agent';

COMMENT ON COLUMN ai_agents.validator_rules IS
'Array de regras do validador (guardrails antes de enviar).
Estrutura: [
  {
    "id": "mentions_ai_model",
    "condition": "message contains (ai|modelo|prompt|agente|sistema)",
    "action": "block",
    "enabled": true
  },
  ...
]
Ações: block, correct, ignore';

COMMENT ON COLUMN ai_agents.timings IS
'Configurações temporais de comportamento.
Esperado: {
  "debounce_seconds": 20,
  "typing_delay_seconds": 4,
  "max_message_blocks": 3
}';

COMMENT ON COLUMN ai_agents.pipeline_models IS
'Modelos de IA por fase do pipeline.
Estrutura esperada: {
  "main": {"model": "gpt-5.1", "temperature": 0.7, "max_tokens": 1024},
  "formatter": {"model": "gpt-5-mini", "temperature": 0.5, "max_tokens": 500},
  "validator": {"model": "gpt-5.1", "temperature": 0, "max_tokens": 500},
  "context": {"model": "gpt-5.1", "temperature": 0.3, "max_tokens": 2000},
  "data": {"model": "gpt-5.1", "temperature": 0, "max_tokens": 500}
}';

COMMENT ON COLUMN ai_agents.multimodal_config IS
'Capabilities multimodais do agente.
Esperado: {
  "audio": true,
  "image": true,
  "pdf": true
}';

COMMENT ON COLUMN ai_agents.context_fields_config IS
'Configuração de quais campos do CRM o agente pode ver e atualizar.
Estrutura esperada: {
  "visible_fields": ["name", "email", "phone", "destination"],
  "updatable_fields": ["email", "phone"],
  "evidence_level": {"email": "high", "phone": "medium"}
}';

COMMENT ON COLUMN ai_agents.handoff_actions IS
'Ações que disparam quando handoff é detectado.
Estrutura esperada: {
  "change_stage_id": "uuid-stage-id",
  "apply_tag": {"color": "red", "name": "handoff_needed"},
  "notify_responsible": true,
  "transition_message": null,
  "pause_permanently": false
}';

COMMENT ON COLUMN ai_agents.memory_config IS
'Configuração semântica de memória (já existe).
Esperado: {
  "type": "buffer_window",
  "session_key_template": "phone+card",
  "window_size_turns": 20,
  "short_term_turns": 5,
  "use_card_context": true,
  "use_conversation_history": true,
  "max_history_turns": 20
}';
