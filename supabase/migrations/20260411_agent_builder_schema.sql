-- ============================================================================
-- AGENT BUILDER — Schema para wizard de criacao de agentes IA
-- ============================================================================
-- 6 tabelas: ai_agent_templates, ai_agent_business_config,
--            ai_agent_qualification_flow, ai_agent_special_scenarios,
--            ai_agent_wizard_drafts, ai_message_buffer
-- Colunas novas em ai_agents: template_id, is_template_based
-- RPCs genericas: agent_check_calendar, agent_request_handoff, agent_assign_tag
-- ============================================================================

-- ============================================================================
-- 0. COLUNAS NOVAS EM AI_AGENTS
-- ============================================================================
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS template_id UUID,
  ADD COLUMN IF NOT EXISTS is_template_based BOOLEAN DEFAULT false;

-- FK para templates (criada depois da tabela existir)
-- Sera adicionada apos CREATE TABLE ai_agent_templates

-- ============================================================================
-- 1. AI_AGENT_TEMPLATES — Templates pre-construidos para o wizard
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  nome TEXT NOT NULL,
  descricao TEXT,

  -- Classificacao
  categoria TEXT NOT NULL CHECK (categoria IN (
    'sdr', 'support', 'onboarding', 'success', 'booking', 'custom'
  )),
  tipo TEXT NOT NULL CHECK (tipo IN ('sales', 'support', 'success', 'specialist', 'router')),

  -- Prompts-template para cada agente do pipeline
  -- Usam placeholders como {{company_name}}, {{persona}}, {{qualification_flow}}
  prompt_backoffice_template TEXT NOT NULL,   -- Agent 1: contexto + resumo
  prompt_data_template TEXT NOT NULL,         -- Agent 2: CRM updates + pipeline
  prompt_persona_template TEXT NOT NULL,      -- Agent 3: conversa com cliente
  prompt_validator_template TEXT,             -- Validador (NULL = usar default global)
  prompt_formatter_template TEXT,             -- Formatador (NULL = usar default global)

  -- Defaults do template
  default_skills JSONB DEFAULT '[]'::JSONB,
  default_routing_criteria JSONB DEFAULT '{}'::JSONB,
  default_escalation_rules JSONB DEFAULT '[]'::JSONB,
  default_qualification_flow JSONB DEFAULT '[]'::JSONB,
  -- [{ stage_order: 1, stage_name: "Discovery", question: "...", stage_key: "destination" }]

  default_special_scenarios JSONB DEFAULT '[]'::JSONB,
  -- [{ scenario_name: "Club Med", trigger_condition: "...", response_adjustment: "..." }]

  default_business_config JSONB DEFAULT '{}'::JSONB,
  -- { pricing_model: "flat", pricing_json: { fee: 500 }, tone: "empathetic" }

  -- UI
  icon_name TEXT DEFAULT 'Bot',
  preview_conversation JSONB DEFAULT '[]'::JSONB,
  -- [{ role: "user", content: "Oi!" }, { role: "assistant", content: "Olá! ..." }]

  -- Visibilidade
  is_public BOOLEAN DEFAULT true,      -- templates publicos (da plataforma)
  is_system BOOLEAN DEFAULT false,     -- templates do sistema (nao editaveis)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Templates de org: unique por (org_id, nome)
CREATE UNIQUE INDEX idx_ai_templates_org_nome
  ON ai_agent_templates(org_id, nome)
  WHERE org_id IS NOT NULL;

-- Templates de sistema (org_id IS NULL): unique por nome
CREATE UNIQUE INDEX idx_ai_templates_system_nome
  ON ai_agent_templates(nome)
  WHERE org_id IS NULL;

CREATE INDEX idx_ai_templates_public ON ai_agent_templates(is_public, categoria) WHERE is_public = true;

ALTER TABLE ai_agent_templates ENABLE ROW LEVEL SECURITY;

-- Templates publicos sao visiveis para todos; privados so para a org
CREATE POLICY "ai_templates_select" ON ai_agent_templates FOR SELECT TO authenticated
  USING (is_public = true OR org_id = requesting_org_id());
CREATE POLICY "ai_templates_insert" ON ai_agent_templates FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_templates_update" ON ai_agent_templates FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id() AND is_system = false);
CREATE POLICY "ai_templates_delete" ON ai_agent_templates FOR DELETE TO authenticated
  USING (org_id = requesting_org_id() AND is_system = false);
CREATE POLICY "ai_templates_service" ON ai_agent_templates FOR ALL TO service_role USING (true);

-- Agora adicionar FK em ai_agents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_ai_agents_template'
  ) THEN
    ALTER TABLE ai_agents
      ADD CONSTRAINT fk_ai_agents_template
      FOREIGN KEY (template_id) REFERENCES ai_agent_templates(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- ============================================================================
-- 2. AI_AGENT_BUSINESS_CONFIG — Config de negocio (1:1 com ai_agents)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_business_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Empresa
  company_name TEXT,
  company_description TEXT,

  -- Tom e idioma
  tone TEXT CHECK (tone IS NULL OR tone IN (
    'formal', 'professional', 'friendly', 'casual', 'empathetic'
  )),
  language TEXT DEFAULT 'pt-BR',

  -- Precificacao
  pricing_model TEXT CHECK (pricing_model IS NULL OR pricing_model IN (
    'flat', 'percentage', 'tiered', 'free', 'custom'
  )),
  pricing_json JSONB DEFAULT '{}'::JSONB,
  -- { fee: 500, currency: "BRL", when: "after_qualification", message: "Nossa taxa..." }

  fee_presentation_timing TEXT CHECK (fee_presentation_timing IS NULL OR fee_presentation_timing IN (
    'immediately', 'after_discovery', 'after_qualification', 'at_commitment', 'never'
  )),

  -- Processo e metodologia
  process_steps JSONB DEFAULT '[]'::JSONB,
  -- ["Entender necessidades", "Criar proposta", "Agendar reuniao", "Fechar"]
  methodology_text TEXT,

  -- Calendario
  calendar_system TEXT CHECK (calendar_system IS NULL OR calendar_system IN (
    'calendly', 'google', 'n8n', 'supabase_rpc', 'none'
  )),
  calendar_config JSONB DEFAULT '{}'::JSONB,
  -- { rpc_name: "check_calendar", owner_field: "sdr_owner_id", buffer_minutes: 30 }

  -- Campos do CRM
  protected_fields JSONB DEFAULT '["pessoa_principal_id", "produto_data", "valor_estimado"]'::JSONB,
  auto_update_fields JSONB DEFAULT '["titulo", "ai_resumo", "ai_contexto"]'::JSONB,
  contact_update_fields JSONB DEFAULT '["nome", "sobrenome", "email", "cpf", "passaporte", "data_nascimento", "endereco"]'::JSONB,

  -- Dados de formulario (para regra NO-REPEAT)
  form_data_fields JSONB DEFAULT '[]'::JSONB,
  -- ["mkt_destino", "mkt_quem_vai_viajar_junto", "mkt_pretende_viajar_tempo", "mkt_valor_por_pessoa_viagem"]

  -- Contatos secundarios (traveler/titular)
  has_secondary_contacts BOOLEAN DEFAULT false,
  secondary_contact_role_name TEXT DEFAULT 'traveler',
  -- Campos que secundarios podem fornecer
  secondary_contact_fields JSONB DEFAULT '["passaporte", "cpf", "data_nascimento", "preferencias"]'::JSONB,

  -- Escalacao customizada
  escalation_triggers JSONB DEFAULT '[]'::JSONB,
  -- [{ type: "turn_count", threshold: 15 }, { type: "sentiment", threshold: -0.5 }, { type: "keyword", values: ["falar com alguem"] }]

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_agent_business_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_biz_config_select" ON ai_agent_business_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_biz_config_insert" ON ai_agent_business_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_biz_config_update" ON ai_agent_business_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_biz_config_delete" ON ai_agent_business_config FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_biz_config_service" ON ai_agent_business_config FOR ALL TO service_role USING (true);

-- ============================================================================
-- 3. AI_AGENT_QUALIFICATION_FLOW — Estagios do funil de qualificacao
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_qualification_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  stage_order INT NOT NULL,
  stage_name TEXT NOT NULL,
  stage_key TEXT,  -- "destination", "budget", "group_size", etc.

  -- Pergunta principal
  question TEXT NOT NULL,

  -- Sub-perguntas opcionais
  subquestions JSONB DEFAULT '[]'::JSONB,
  -- ["Sao todos adultos?", "Qual a faixa de orcamento?"]

  -- Desqualificadores deste estagio
  disqualification_triggers JSONB DEFAULT '[]'::JSONB,
  -- [{ trigger: "accommodation_only", message: "Nossa forca e planejamento completo..." }]

  -- Mapeamento para pipeline do CRM
  advance_to_stage_id UUID,  -- pipeline_stages.id para avancar quando este estagio for completado
  advance_condition TEXT,     -- descricao legivel: "destination != null", "budget AND dates"

  -- Opcoes de resposta (para campos com opcoes predefinidas)
  response_options JSONB DEFAULT NULL,
  -- ["ate 10k", "10-25k", "25-50k", "50k+"] para budget

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, stage_order)
);

CREATE INDEX idx_ai_qual_flow_agent ON ai_agent_qualification_flow(agent_id, stage_order);

ALTER TABLE ai_agent_qualification_flow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_qual_flow_select" ON ai_agent_qualification_flow FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_qual_flow_insert" ON ai_agent_qualification_flow FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_qual_flow_update" ON ai_agent_qualification_flow FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_qual_flow_delete" ON ai_agent_qualification_flow FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_qual_flow_service" ON ai_agent_qualification_flow FOR ALL TO service_role USING (true);

-- ============================================================================
-- 4. AI_AGENT_SPECIAL_SCENARIOS — Cenarios condicionais (Club Med, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_special_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  scenario_name TEXT NOT NULL,

  -- Trigger: quando ativar este cenario
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'keyword', 'tag', 'field_value', 'intent', 'custom'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- keyword: { keywords: ["Club Med", "clubmed"] }
  -- tag: { tag_name: "vip" }
  -- field_value: { field: "budget", operator: ">", value: 50000 }
  -- intent: { intent: "club_med_interest" }

  -- O que muda quando o cenario e ativado
  response_adjustment TEXT,       -- instrucoes em linguagem natural para o Agent 3
  simplified_qualification JSONB DEFAULT NULL,
  -- Se nao-null, substitui o qualification_flow normal
  -- [{ question: "Qual resort?", stage_key: "resort" }]

  skip_fee_presentation BOOLEAN DEFAULT false,
  skip_meeting_scheduling BOOLEAN DEFAULT false,
  auto_assign_tag TEXT DEFAULT NULL,    -- tag para atribuir automaticamente
  handoff_message TEXT DEFAULT NULL,    -- mensagem de handoff especial
  target_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, scenario_name)
);

CREATE INDEX idx_ai_scenarios_agent ON ai_agent_special_scenarios(agent_id) WHERE enabled = true;

ALTER TABLE ai_agent_special_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_scenarios_select" ON ai_agent_special_scenarios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_scenarios_insert" ON ai_agent_special_scenarios FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_scenarios_update" ON ai_agent_special_scenarios FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_scenarios_delete" ON ai_agent_special_scenarios FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_scenarios_service" ON ai_agent_special_scenarios FOR ALL TO service_role USING (true);

-- ============================================================================
-- 5. AI_AGENT_WIZARD_DRAFTS — Rascunhos do wizard (retomar depois)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_wizard_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Progresso
  current_step INT DEFAULT 1 CHECK (current_step BETWEEN 1 AND 7),
  template_id UUID REFERENCES ai_agent_templates(id) ON DELETE SET NULL,

  -- Dados acumulados de cada step
  step_data JSONB DEFAULT '{}'::JSONB,
  -- {
  --   "step1": { company_name: "...", tone: "friendly", agent_name: "Julia" },
  --   "step2": { template_id: "..." },
  --   "step3": { stages: [...] },
  --   "step4": { kb_items: [...] },
  --   "step5": { pricing_model: "flat", fee: 500, ... },
  --   "step6": { escalation_rules: [...] },
  --   "step7": { phone_line_id: "...", go_live: true }
  -- }

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'abandoned')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_wizard_drafts_org ON ai_agent_wizard_drafts(org_id, status)
  WHERE status = 'draft';

ALTER TABLE ai_agent_wizard_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_wizard_select" ON ai_agent_wizard_drafts FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_wizard_insert" ON ai_agent_wizard_drafts FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_wizard_update" ON ai_agent_wizard_drafts FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_wizard_delete" ON ai_agent_wizard_drafts FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_wizard_service" ON ai_agent_wizard_drafts FOR ALL TO service_role USING (true);

-- ============================================================================
-- 6. AI_MESSAGE_BUFFER — Buffer para debounce de mensagens (20s)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_message_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificacao do contato
  contact_phone TEXT NOT NULL,
  phone_number_id TEXT,          -- linha WhatsApp que recebeu

  -- Mensagem
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN (
    'text', 'audio', 'image', 'document', 'video', 'location', 'sticker'
  )),
  raw_payload JSONB DEFAULT '{}'::JSONB,

  -- Metadata
  contact_name TEXT,
  whatsapp_message_id TEXT,      -- ID da mensagem no WhatsApp (dedup)
  echo_conversation_id TEXT,

  -- Status de processamento
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para buscar mensagens nao processadas de um contato
CREATE INDEX idx_ai_msg_buffer_pending
  ON ai_message_buffer(contact_phone, created_at)
  WHERE processed = false;

-- Index para cleanup de mensagens antigas
CREATE INDEX idx_ai_msg_buffer_cleanup
  ON ai_message_buffer(created_at)
  WHERE processed = true;

ALTER TABLE ai_message_buffer ENABLE ROW LEVEL SECURITY;

-- Buffer e acessado apenas via service_role (edge functions)
CREATE POLICY "ai_msg_buffer_service" ON ai_message_buffer FOR ALL TO service_role USING (true);

-- ============================================================================
-- RPC: Processar buffer de debounce — retorna mensagens agrupadas
-- ============================================================================
CREATE OR REPLACE FUNCTION process_message_buffer(
  p_debounce_seconds INT DEFAULT 20
)
RETURNS TABLE (
  contact_phone TEXT,
  phone_number_id TEXT,
  contact_name TEXT,
  messages JSONB,
  message_count INT,
  org_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH ready_contacts AS (
    -- Contatos cuja ultima mensagem tem mais de p_debounce_seconds
    SELECT
      b.contact_phone,
      MAX(b.created_at) AS last_msg_at
    FROM ai_message_buffer b
    WHERE b.processed = false
    GROUP BY b.contact_phone
    HAVING MAX(b.created_at) < (now() - (p_debounce_seconds || ' seconds')::INTERVAL)
  ),
  messages_to_process AS (
    SELECT
      b.id,
      b.contact_phone,
      b.phone_number_id,
      b.contact_name,
      b.message_text,
      b.message_type,
      b.raw_payload,
      b.whatsapp_message_id,
      b.echo_conversation_id,
      b.org_id,
      b.created_at
    FROM ai_message_buffer b
    INNER JOIN ready_contacts rc ON rc.contact_phone = b.contact_phone
    WHERE b.processed = false
    ORDER BY b.created_at ASC
  ),
  mark_processed AS (
    UPDATE ai_message_buffer
    SET processed = true, processed_at = now()
    WHERE id IN (SELECT mtp.id FROM messages_to_process mtp)
    RETURNING ai_message_buffer.id
  )
  SELECT
    mtp.contact_phone,
    (array_agg(mtp.phone_number_id ORDER BY mtp.created_at))[1] AS phone_number_id,
    (array_agg(mtp.contact_name ORDER BY mtp.created_at))[1] AS contact_name,
    jsonb_agg(
      jsonb_build_object(
        'text', mtp.message_text,
        'type', mtp.message_type,
        'whatsapp_id', mtp.whatsapp_message_id,
        'timestamp', mtp.created_at
      )
      ORDER BY mtp.created_at
    ) AS messages,
    COUNT(*)::INT AS message_count,
    (array_agg(mtp.org_id ORDER BY mtp.created_at))[1] AS org_id
  FROM messages_to_process mtp
  GROUP BY mtp.contact_phone;
END;
$$;

-- ============================================================================
-- RPC: Limpar buffer antigo (rodar via cron diario)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_message_buffer(
  p_older_than_hours INT DEFAULT 24
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM ai_message_buffer
  WHERE processed = true
    AND created_at < (now() - (p_older_than_hours || ' hours')::INTERVAL);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- RPC GENERICA: Check calendar (desacoplada da Julia)
-- Nota: referencia tabela 'tarefas' — no staging pode falhar no CALL, nao no CREATE
-- ============================================================================
CREATE OR REPLACE FUNCTION agent_check_calendar(
  p_owner_id UUID,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_to DATE;
  v_slots JSONB;
BEGIN
  -- Default: proximos 5 dias uteis
  v_date_to := COALESCE(p_date_to, p_date_from + INTERVAL '7 days');

  -- Buscar tarefas tipo reuniao ja agendadas no periodo
  SELECT jsonb_agg(
    jsonb_build_object(
      'date', t.data_vencimento::DATE,
      'time', to_char(t.data_vencimento, 'HH24:MI'),
      'title', t.titulo,
      'duration_min', 30
    )
    ORDER BY t.data_vencimento
  )
  INTO v_slots
  FROM tarefas t
  WHERE t.responsavel_id = p_owner_id
    AND t.tipo = 'reuniao'
    AND t.status IN ('agendada', 'pendente')
    AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to;

  RETURN jsonb_build_object(
    'owner_id', p_owner_id,
    'date_from', p_date_from,
    'date_to', v_date_to,
    'booked_slots', COALESCE(v_slots, '[]'::JSONB),
    'working_hours', jsonb_build_object(
      'start', '09:00',
      'end', '18:00',
      'days', ARRAY['mon', 'tue', 'wed', 'thu', 'fri'],
      'slot_duration_min', 30,
      'timezone', 'America/Sao_Paulo'
    )
  );
END;
$$;

-- ============================================================================
-- RPC GENERICA: Request handoff para humano
-- ============================================================================
CREATE OR REPLACE FUNCTION agent_request_handoff(
  p_card_id UUID,
  p_reason TEXT DEFAULT 'cliente_pede_humano',
  p_context_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
BEGIN
  -- Atualizar card: marcar que humano assumiu
  UPDATE cards
  SET
    ai_responsavel = 'humano',
    updated_at = now()
  WHERE id = p_card_id
  RETURNING id, titulo, responsavel_id INTO v_card;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_not_found');
  END IF;

  -- Criar atividade de registro
  INSERT INTO activities (card_id, profile_id, tipo, conteudo, created_at)
  VALUES (
    p_card_id,
    v_card.responsavel_id,
    'nota',
    format('🤖 Handoff para humano. Motivo: %s. Contexto: %s',
      p_reason, COALESCE(p_context_summary, 'N/A')),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'assigned_to', v_card.responsavel_id,
    'reason', p_reason
  );
END;
$$;

-- ============================================================================
-- RPC GENERICA: Assign tag a um card
-- ============================================================================
CREATE OR REPLACE FUNCTION agent_assign_tag(
  p_card_id UUID,
  p_tag_name TEXT,
  p_tag_color TEXT DEFAULT '#6366f1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_id UUID;
  v_org_id UUID;
BEGIN
  -- Pegar org_id do card
  SELECT org_id INTO v_org_id FROM cards WHERE id = p_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_not_found');
  END IF;

  -- Criar tag se nao existe
  INSERT INTO tags (nome, cor, org_id)
  VALUES (p_tag_name, p_tag_color, v_org_id)
  ON CONFLICT (org_id, nome) DO UPDATE SET cor = EXCLUDED.cor
  RETURNING id INTO v_tag_id;

  -- Associar tag ao card
  INSERT INTO card_tags (card_id, tag_id)
  VALUES (p_card_id, v_tag_id)
  ON CONFLICT (card_id, tag_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'tag_id', v_tag_id,
    'tag_name', p_tag_name
  );
END;
$$;
