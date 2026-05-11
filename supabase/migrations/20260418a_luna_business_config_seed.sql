-- Paridade estrutural Luna ⇄ Julia (2026-04-18)
--
-- A migration 20260417c_luna_parity_julia.sql preencheu ai_agents com os prompts,
-- validator_rules, handoff_signals e intelligent_decisions da Julia. Mas deixou
-- ai_agent_business_config, ai_agent_qualification_flow e ai_agent_special_scenarios
-- VAZIAS para a Luna — o router lê essas 3 tabelas em runtime e, sem elas, a Luna
-- opera mais crua do que a Julia (regras de negócio ficam só no prompt).
--
-- Este seed extrai os dados já presentes no prompt e na KB da Luna e os registra
-- de forma estruturada. Idempotente: só roda se a Luna existir neste banco e
-- só insere linhas que ainda não existem (ON CONFLICT / gates).

DO $$
DECLARE
  v_luna_id uuid := '0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ai_agents WHERE id = v_luna_id) THEN
    RAISE NOTICE 'Luna não existe neste banco — pulando seed de business_config/qualification/scenarios';
    RETURN;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 1. ai_agent_business_config — Regras de negócio estruturadas
  -- ──────────────────────────────────────────────────────────────────────────
  INSERT INTO ai_agent_business_config (
    agent_id,
    company_name, company_description,
    tone, language,
    pricing_model, pricing_json, fee_presentation_timing,
    process_steps, methodology_text,
    calendar_system, calendar_config,
    protected_fields, auto_update_fields, contact_update_fields,
    form_data_fields,
    has_secondary_contacts, secondary_contact_role_name, secondary_contact_fields,
    escalation_triggers
  )
  VALUES (
    v_luna_id,
    'Welcome Trips',
    'Agência boutique de viagens sob medida. Planejamento completo com consultora dedicada.',
    'friendly',
    'pt-BR',
    'flat',
    jsonb_build_object(
      'fee', 500,
      'currency', 'BRL',
      'when', 'after_qualification',
      'message', 'A taxa de planejamento é R$ 500 e garante dedicação exclusiva de uma consultora. Convertida em crédito quando a viagem é fechada.'
    ),
    'after_qualification',
    jsonb_build_array(
      'Qualificação — destino, período, viajantes, orçamento',
      'Taxa R$ 500 → reunião de briefing',
      'Consultora pesquisa e monta proposta',
      'Apresentação → ajustes → aprovação',
      'Reservas e emissões',
      'Suporte 24/7 antes, durante e depois'
    ),
    'Não vendemos pacotes prontos. Cada viagem é desenhada do zero com base nas preferências do cliente. Diferencial: atenção individual, roteiro sob medida, acesso a experiências exclusivas, rede de parceiros no destino.',
    'supabase_rpc',
    jsonb_build_object('rpc_name', 'agent_check_calendar', 'working_hours', '10:00-17:00', 'working_days', jsonb_build_array('mon','tue','wed','thu','fri')),
    jsonb_build_array('pessoa_principal_id', 'produto_data', 'valor_estimado', 'contato.telefone'),
    jsonb_build_array('titulo', 'ai_resumo', 'ai_contexto', 'pipeline_stage_id'),
    jsonb_build_array('nome', 'sobrenome', 'email', 'cpf', 'passaporte', 'data_nascimento', 'endereco', 'observacoes'),
    jsonb_build_array(
      'mkt_destino',
      'mkt_buscando_para_viagem',
      'mkt_quem_vai_viajar_junto',
      'mkt_pretende_viajar_tempo',
      'mkt_hospedagem_contratada',
      'mkt_valor_por_pessoa_viagem',
      'mkt_mensagem_personalizada_formulario',
      'utm_source'
    ),
    true,
    'traveler',
    jsonb_build_array('nome', 'sobrenome', 'cpf', 'passaporte', 'data_nascimento'),
    '[]'::jsonb
  )
  ON CONFLICT (agent_id) DO UPDATE SET
    company_name = EXCLUDED.company_name,
    company_description = EXCLUDED.company_description,
    tone = EXCLUDED.tone,
    language = EXCLUDED.language,
    pricing_model = EXCLUDED.pricing_model,
    pricing_json = EXCLUDED.pricing_json,
    fee_presentation_timing = EXCLUDED.fee_presentation_timing,
    process_steps = EXCLUDED.process_steps,
    methodology_text = EXCLUDED.methodology_text,
    calendar_system = EXCLUDED.calendar_system,
    calendar_config = EXCLUDED.calendar_config,
    protected_fields = EXCLUDED.protected_fields,
    auto_update_fields = EXCLUDED.auto_update_fields,
    contact_update_fields = EXCLUDED.contact_update_fields,
    form_data_fields = EXCLUDED.form_data_fields,
    has_secondary_contacts = EXCLUDED.has_secondary_contacts,
    secondary_contact_role_name = EXCLUDED.secondary_contact_role_name,
    secondary_contact_fields = EXCLUDED.secondary_contact_fields,
    escalation_triggers = EXCLUDED.escalation_triggers,
    updated_at = now();

  -- ──────────────────────────────────────────────────────────────────────────
  -- 2. ai_agent_qualification_flow — 4 stages derivados dos gates da Julia
  -- ──────────────────────────────────────────────────────────────────────────
  -- Gates originais: ["destino", "periodo", "viajantes", "orcamento_ou_recusa"]
  -- (vem de ai_agents.intelligent_decisions.criar_reuniao.config.gates)
  DELETE FROM ai_agent_qualification_flow WHERE agent_id = v_luna_id;

  INSERT INTO ai_agent_qualification_flow (
    agent_id, stage_order, stage_name, stage_key,
    question, subquestions, disqualification_triggers,
    response_options, maps_to_field, skip_if_filled,
    advance_condition
  )
  VALUES
  (
    v_luna_id, 1, 'Destino', 'destino',
    'Qual destino vocês estão pensando?',
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    'mkt_destino', true,
    'lead_replied'
  ),
  (
    v_luna_id, 2, 'Período', 'periodo',
    'Quando vocês pretendem viajar?',
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array('Próximos 3 meses', '3 a 6 meses', '6 a 12 meses', 'Mais de 1 ano', 'Datas flexíveis'),
    'mkt_pretende_viajar_tempo', true,
    'lead_replied'
  ),
  (
    v_luna_id, 3, 'Viajantes', 'viajantes',
    'Quantas pessoas vão viajar? (casal, família, grupo de amigos, sozinho)',
    '[]'::jsonb,
    '[]'::jsonb,
    NULL,
    'mkt_quem_vai_viajar_junto', true,
    'lead_replied'
  ),
  (
    v_luna_id, 4, 'Orçamento', 'orcamento_ou_recusa',
    'Qual a faixa de orçamento por pessoa para a viagem?',
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_array('Até R$ 10k', 'R$ 10k a 25k', 'R$ 25k a 50k', 'R$ 50k+', 'Prefiro não informar'),
    'mkt_valor_por_pessoa_viagem', true,
    'meeting_confirmed'
  );

  -- ──────────────────────────────────────────────────────────────────────────
  -- 3. ai_agent_special_scenarios — Cenário Club Med estruturado
  -- ──────────────────────────────────────────────────────────────────────────
  -- Hoje o Club Med é detectado por texto no prompt principal (frágil).
  -- Estruturar em tabela permite edição pela UI e trigger determinístico no router.
  INSERT INTO ai_agent_special_scenarios (
    agent_id, scenario_name,
    trigger_type, trigger_config,
    response_adjustment, simplified_qualification,
    skip_fee_presentation, skip_meeting_scheduling,
    auto_assign_tag, handoff_message,
    enabled, priority
  )
  VALUES (
    v_luna_id, 'Club Med',
    'keyword',
    jsonb_build_object('keywords', jsonb_build_array('club med', 'clubmed', 'club-med')),
    'Leads interessados em Club Med seguem fluxo SIMPLIFICADO: apenas 3 perguntas (resort, datas, quantas pessoas). NÃO apresentar taxa de R$ 500. NÃO agendar reunião. Após qualificar, informar que Planner especializado em Club Med entra em contato por outro número.',
    jsonb_build_array(
      jsonb_build_object('question', 'Qual resort Club Med vocês têm em mente?', 'stage_key', 'resort_club_med'),
      jsonb_build_object('question', 'Para quando estão pensando?', 'stage_key', 'datas_club_med'),
      jsonb_build_object('question', 'Quantas pessoas?', 'stage_key', 'viajantes_club_med')
    ),
    true,
    true,
    'Club Med',
    'Que legal! Já anotei tudo aqui. Um Planner nosso especializado em Club Med vai entrar em contato com você por outro número pra dar continuidade. Ele vai ter todas as informações que você me passou!',
    true, 10
  )
  ON CONFLICT (agent_id, scenario_name) DO UPDATE SET
    trigger_type = EXCLUDED.trigger_type,
    trigger_config = EXCLUDED.trigger_config,
    response_adjustment = EXCLUDED.response_adjustment,
    simplified_qualification = EXCLUDED.simplified_qualification,
    skip_fee_presentation = EXCLUDED.skip_fee_presentation,
    skip_meeting_scheduling = EXCLUDED.skip_meeting_scheduling,
    auto_assign_tag = EXCLUDED.auto_assign_tag,
    handoff_message = EXCLUDED.handoff_message,
    enabled = EXCLUDED.enabled,
    priority = EXCLUDED.priority;

  RAISE NOTICE 'Luna paridade estrutural: business_config, qualification_flow (4 stages), special_scenarios (Club Med) seedados';
END $$;
