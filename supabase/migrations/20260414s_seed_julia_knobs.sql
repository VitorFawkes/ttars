-- ============================================================================
-- C1 - Seed: Popula Julia com valores reais extraídos do workflow n8n
-- ============================================================================
-- Idempotente: usa UPDATE WHERE ... EXISTS para não falhar se Julia não existir
-- Staging apenas: os valores refletem a configuração atual do workflow n8n da Julia
-- IDs reais: agent_id para Julia = procuramos por nome (não hardcodamos UUID)

-- UPDATE idempotente na Julia (by name)
UPDATE ai_agents
SET
  -- Timings extraídos do n8n
  timings = jsonb_build_object(
    'debounce_seconds', 20,
    'typing_delay_seconds', 4,
    'max_message_blocks', 3
  ),

  -- Modelos extraídos do n8n
  pipeline_models = jsonb_build_object(
    'main', jsonb_build_object(
      'model', 'gpt-5.1',
      'temperature', 0.7,
      'max_tokens', 1024
    ),
    'formatter', jsonb_build_object(
      'model', 'gpt-5-mini',
      'temperature', 0.5,
      'max_tokens', 500
    ),
    'validator', jsonb_build_object(
      'model', 'gpt-5.1',
      'temperature', 0,
      'max_tokens', 500
    ),
    'context', jsonb_build_object(
      'model', 'gpt-5.1',
      'temperature', 0.3,
      'max_tokens', 2000
    ),
    'data', jsonb_build_object(
      'model', 'gpt-5.1',
      'temperature', 0,
      'max_tokens', 500
    )
  ),

  -- Multimodal (Julia aceita áudio, imagem, PDF)
  multimodal_config = jsonb_build_object(
    'audio', true,
    'image', true,
    'pdf', true
  ),

  -- Regras do Validador extraídas do n8n (8 regras)
  validator_rules = jsonb_build_array(
    jsonb_build_object(
      'id', 'mentions_ai_model',
      'condition', 'message contains (ai|modelo|prompt|agente|sistema|bastidores)',
      'action', 'block',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'invents_facts',
      'condition', 'invented facts not in context',
      'action', 'block',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'inappropriate_tone',
      'condition', 'tone is (cold|robotic|aggressive)',
      'action', 'correct',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'repeats_presentation',
      'condition', 'repeats presentation when not first contact',
      'action', 'correct',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'mentions_system_details',
      'condition', 'mentions (form|system data|ActiveCampaign)',
      'action', 'block',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'rejects_without_investigation',
      'condition', 'rejects lead on first message without investigation',
      'action', 'block',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'says_no_product_standalone',
      'condition', 'says "we do not work with X alone" without client confirmation',
      'action', 'correct',
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'club_med_fee_or_meeting',
      'condition', 'Club Med: shows R$ 500 fee or tries to schedule meeting',
      'action', 'correct',
      'enabled', true
    )
  ),

  -- Sinais de handoff (todos desabilitados por padrão)
  handoff_signals = jsonb_build_array(
    jsonb_build_object(
      'slug', 'customer_dissatisfied',
      'enabled', false,
      'description', 'Cliente está insatisfeito (tom frustrado, críticas repetidas, ironia)'
    ),
    jsonb_build_object(
      'slug', 'explicit_human_request',
      'enabled', false,
      'description', 'Cliente sinaliza que quer falar com outra pessoa (em qualquer linguagem)'
    ),
    jsonb_build_object(
      'slug', 'out_of_scope',
      'enabled', false,
      'description', 'Situação fora do escopo (tema que o agente não domina)'
    ),
    jsonb_build_object(
      'slug', 'sensitive_info',
      'enabled', false,
      'description', 'Informação sensível/crítica (cobrança errada, dado pessoal comprometido, risco reputacional)'
    ),
    jsonb_build_object(
      'slug', 'incomprehension_loop',
      'enabled', false,
      'description', 'Loop de incompreensão (agente já tentou N vezes e cliente não avançou)'
    ),
    jsonb_build_object(
      'slug', 'regulatory',
      'enabled', false,
      'description', 'Assunto regulatório (devolução, cancelamento de contrato, exige humano por política)'
    ),
    jsonb_build_object(
      'slug', 'high_purchase_intent_blocked',
      'enabled', false,
      'description', 'Alta intenção de compra bloqueada (cliente perto de fechar mas agente não consegue sozinho)'
    ),
    jsonb_build_object(
      'slug', 'conversation_timeout',
      'enabled', false,
      'description', 'Conversa muito longa sem resolução (timeout configurável em minutos)'
    )
  ),

  -- Decisões inteligentes (todos desabilitados por padrão)
  intelligent_decisions = jsonb_build_object(
    'when_create_meeting', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'prerequisites', jsonb_build_array('email_available'),
        'min_interactions', 1
      )
    ),
    'when_update_contact', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'fields', jsonb_build_array('name', 'email', 'phone'),
        'evidence_level', 'high'
      )
    ),
    'when_apply_tag', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'allowed_tags', jsonb_build_array()
      )
    ),
    'when_search_kb', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'relevance_threshold', 0.7
      )
    ),
    'when_ask_context_vs_answer', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'max_consecutive_questions', 3
      )
    ),
    'tone_adjustment', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'adapt_to_customer', true
      )
    ),
    'consolidate_summary', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'min_new_facts', 2,
        'frequency_minutes', 15
      )
    ),
    're_presentation', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'frequency', 'never'
      )
    ),
    'escalate_to_other_agent', jsonb_build_object(
      'enabled', false,
      'config', jsonb_build_object(
        'peer_agents', jsonb_build_array()
      )
    )
  ),

  -- Contexto de entrada (Julia enxerga tudo, pode atualizar campos seguros)
  context_fields_config = jsonb_build_object(
    'visible_fields', jsonb_build_array(
      'nome', 'email', 'telefone', 'pessoa_principal', 'destination',
      'data_viagem', 'numero_viajantes', 'orcamento'
    ),
    'updatable_fields', jsonb_build_array('email', 'telefone'),
    'evidence_level', jsonb_build_object(
      'email', 'high',
      'telefone', 'high'
    )
  ),

  -- Ações de handoff (padrão vazio — sem mudanças automáticas no card)
  handoff_actions = jsonb_build_object(
    'change_stage_id', null,
    'apply_tag', null,
    'notify_responsible', true,
    'transition_message', null,
    'pause_permanently', false
  ),

  updated_at = now()

WHERE nome = 'Julia'
  AND EXISTS (SELECT 1 FROM ai_agents WHERE nome = 'Julia');

-- ============================================================================
-- Nota: Esta migration é idempotente e segura para aplicar múltiplas vezes.
-- Se Julia não existir, nenhuma linha é afetada (UPDATE sem WHERE match).
-- Os valores refletem a configuração extraída do workflow n8n em 2026-04-14.
-- ============================================================================
