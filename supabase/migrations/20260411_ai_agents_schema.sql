-- ============================================================================
-- AGENTES IA WHATSAPP — Schema Completo
-- ============================================================================
-- 12 tabelas: ai_agents, ai_skills, ai_agent_skills, ai_knowledge_bases,
--             ai_knowledge_base_items, ai_conversations, ai_conversation_turns,
--             ai_conversation_state, ai_agent_prompts, ai_agent_metrics,
--             ai_agent_phone_line_config, ai_skill_usage_logs
-- RLS com org_id isolation via requesting_org_id()
-- ============================================================================

-- ============================================================================
-- 1. AI_AGENTS — Definicao de agentes IA configuráveis
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  produto app_product NOT NULL,

  -- Identidade
  nome TEXT NOT NULL,
  descricao TEXT,
  persona TEXT,
  ativa BOOLEAN DEFAULT false,

  -- Modelo & Config
  modelo TEXT NOT NULL DEFAULT 'gpt-5.1',
  temperature NUMERIC DEFAULT 0.7,
  max_tokens INT DEFAULT 1024,

  -- System Prompt (versao inline — versionamento em ai_agent_prompts)
  system_prompt TEXT NOT NULL,
  system_prompt_version INT DEFAULT 1,

  -- Tipo do agente
  tipo TEXT NOT NULL CHECK (tipo IN ('sales', 'support', 'success', 'specialist', 'router')),

  -- Criterios de roteamento — quando esse agente deve assumir
  routing_criteria JSONB DEFAULT '{}'::JSONB,
  -- {
  --   "keywords": ["viagem", "cotação"],
  --   "intents": ["get_quote", "book_trip"],
  --   "card_status": ["novo", "qualificado"],
  --   "tags": ["hot_lead"],
  --   "exclude_statuses": ["perdido"]
  -- }

  -- Regras de escalacao
  escalation_rules JSONB DEFAULT '[]'::JSONB,
  -- [
  --   {
  --     "condition": "customer_frustration >= 3",
  --     "target_agent_id": "uuid-support",
  --     "message": "Vou transferir para especialista..."
  --   }
  -- ]

  -- Config de memoria
  memory_config JSONB DEFAULT '{"short_term_turns": 5, "use_card_context": true, "use_conversation_history": true, "max_history_turns": 20}'::JSONB,

  -- Fallback
  fallback_message TEXT DEFAULT 'Desculpe, não consegui processar sua mensagem. Um agente humano vai ajudá-lo em breve.',
  fallback_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  -- n8n webhook do agente (onde o router envia mensagens para processar)
  n8n_webhook_url TEXT,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, nome)
);

CREATE INDEX idx_ai_agents_org_produto ON ai_agents(org_id, produto) WHERE ativa = true;
CREATE INDEX idx_ai_agents_tipo ON ai_agents(tipo) WHERE ativa = true;

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agents_select" ON ai_agents FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_agents_insert" ON ai_agents FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_agents_update" ON ai_agents FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_agents_delete" ON ai_agents FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_agents_service" ON ai_agents FOR ALL TO service_role USING (true);

-- ============================================================================
-- 2. AI_SKILLS — Capacidades composiveis dos agentes
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN (
    'data_retrieval', 'action', 'analytics', 'integration', 'query'
  )),

  -- Tipo de implementacao
  tipo TEXT NOT NULL CHECK (tipo IN (
    'supabase_query', 'n8n_webhook', 'edge_function', 'http_api'
  )),

  -- Config especifica por tipo
  config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Schema de entrada/saida (para montar tool do LLM)
  input_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_schema JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Exemplos para few-shot do agente
  examples JSONB DEFAULT '[]'::JSONB,

  -- Rate limiting
  rate_limit_per_hour INT DEFAULT 100,

  ativa BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, nome)
);

CREATE INDEX idx_ai_skills_org ON ai_skills(org_id) WHERE ativa = true;

ALTER TABLE ai_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_skills_select" ON ai_skills FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_skills_insert" ON ai_skills FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_skills_update" ON ai_skills FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_skills_delete" ON ai_skills FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_skills_service" ON ai_skills FOR ALL TO service_role USING (true);

-- ============================================================================
-- 3. AI_AGENT_SKILLS — N:N Agente ↔ Skill
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,

  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  config_override JSONB DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, skill_id)
);

CREATE INDEX idx_ai_agent_skills_agent ON ai_agent_skills(agent_id) WHERE enabled = true;

ALTER TABLE ai_agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agent_skills_select" ON ai_agent_skills FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_agent_skills_insert" ON ai_agent_skills FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_agent_skills_update" ON ai_agent_skills FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_agent_skills_delete" ON ai_agent_skills FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_agent_skills_service" ON ai_agent_skills FOR ALL TO service_role USING (true);

-- ============================================================================
-- 4. AI_KNOWLEDGE_BASES — Bases de conhecimento para RAG
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  produto app_product,  -- NULL = compartilhado entre produtos

  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'faq', 'product_catalog', 'policies', 'procedures', 'custom'
  )),

  descricao TEXT,
  tags JSONB DEFAULT '[]'::JSONB,
  ativa BOOLEAN DEFAULT true,

  -- Embedding config
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  last_synced_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, nome)
);

CREATE INDEX idx_ai_kb_org_produto ON ai_knowledge_bases(org_id, produto) WHERE ativa = true;

ALTER TABLE ai_knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_kb_select" ON ai_knowledge_bases FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_kb_insert" ON ai_knowledge_bases FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_kb_update" ON ai_knowledge_bases FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_kb_delete" ON ai_knowledge_bases FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_kb_service" ON ai_knowledge_bases FOR ALL TO service_role USING (true);

-- ============================================================================
-- 5. AI_KNOWLEDGE_BASE_ITEMS — Itens individuais com embeddings vetoriais
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_knowledge_base_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES ai_knowledge_bases(id) ON DELETE CASCADE,

  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::JSONB,

  -- Embedding vetorial (pgvector)
  embedding vector(1536),

  ordem INT DEFAULT 0,
  ativa BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(kb_id, titulo)
);

CREATE INDEX idx_ai_kb_items_kb ON ai_knowledge_base_items(kb_id) WHERE ativa = true;
-- Index para busca semantica (HNSW — funciona sem dados pre-existentes)
CREATE INDEX idx_ai_kb_items_embedding ON ai_knowledge_base_items
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE ai_knowledge_base_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_kb_items_select" ON ai_knowledge_base_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_knowledge_bases WHERE id = kb_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_kb_items_insert" ON ai_knowledge_base_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_knowledge_bases WHERE id = kb_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_kb_items_update" ON ai_knowledge_base_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_knowledge_bases WHERE id = kb_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_kb_items_delete" ON ai_knowledge_base_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_knowledge_bases WHERE id = kb_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_kb_items_service" ON ai_knowledge_base_items FOR ALL TO service_role USING (true);

-- ============================================================================
-- 6. AI_CONVERSATIONS — Sessoes de conversa com agentes
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Participantes
  contact_id UUID,
  card_id UUID,

  -- Roteamento
  primary_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  current_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  human_agent_id UUID REFERENCES profiles(id),

  -- Estado
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'waiting', 'escalated', 'completed', 'archived'
  )),

  -- Metadata da conversa
  intent TEXT,
  tags JSONB DEFAULT '[]'::JSONB,

  -- Contadores
  message_count INT DEFAULT 0,
  ai_message_count INT DEFAULT 0,
  human_message_count INT DEFAULT 0,

  -- Escalacao
  escalation_reason TEXT,
  escalation_at TIMESTAMPTZ,
  resolution_status TEXT CHECK (resolution_status IS NULL OR resolution_status IN (
    'resolved', 'pending', 'follow_up_needed'
  )),

  -- Link com WhatsApp
  phone_number_id TEXT,

  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_conv_contact ON ai_conversations(contact_id, status);
CREATE INDEX idx_ai_conv_card ON ai_conversations(card_id);
CREATE INDEX idx_ai_conv_agent ON ai_conversations(primary_agent_id, status);
CREATE INDEX idx_ai_conv_org_status ON ai_conversations(org_id, status, created_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conv_select" ON ai_conversations FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_conv_insert" ON ai_conversations FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ai_conv_update" ON ai_conversations FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_conv_delete" ON ai_conversations FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ai_conv_service" ON ai_conversations FOR ALL TO service_role USING (true);

-- ============================================================================
-- 7. AI_CONVERSATION_TURNS — Mensagens individuais da conversa
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,

  -- Mensagem
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Agente (se role = assistant)
  agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  -- Skills usadas neste turn
  skills_used JSONB DEFAULT '[]'::JSONB,

  -- Contexto usado pelo agente
  context_used JSONB DEFAULT '{}'::JSONB,

  -- Raciocinio interno (chain-of-thought)
  reasoning TEXT,

  -- Analise
  detected_sentiment TEXT,
  detected_intent TEXT,
  is_fallback BOOLEAN DEFAULT false,
  confidence NUMERIC DEFAULT 1.0,

  -- Uso de tokens (para tracking de custo)
  input_tokens INT,
  output_tokens INT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_turns_conversation ON ai_conversation_turns(conversation_id, created_at);

ALTER TABLE ai_conversation_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_turns_select" ON ai_conversation_turns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_turns_insert" ON ai_conversation_turns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_turns_service" ON ai_conversation_turns FOR ALL TO service_role USING (true);

-- ============================================================================
-- 8. AI_CONVERSATION_STATE — Memoria e estado da conversa
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_conversation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES ai_conversations(id) ON DELETE CASCADE,

  -- Topico atual
  current_topic TEXT,

  -- Variaveis extraidas da conversa
  extracted_variables JSONB DEFAULT '{}'::JSONB,
  -- {
  --   "destination": "Paris",
  --   "travel_dates": { "start": "2025-06-15", "end": "2025-06-22" },
  --   "budget_per_person": 5000,
  --   "number_travelers": 3
  -- }

  -- Preferencias do cliente
  preferences JSONB DEFAULT '{}'::JSONB,

  -- Resumo da conversa (para compressao de contexto)
  summary TEXT,

  -- Acoes pendentes
  pending_actions JSONB DEFAULT '[]'::JSONB,

  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ai_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_state_select" ON ai_conversation_state FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_state_insert" ON ai_conversation_state FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_state_update" ON ai_conversation_state FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_conversations WHERE id = conversation_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_state_service" ON ai_conversation_state FOR ALL TO service_role USING (true);

-- ============================================================================
-- 9. AI_AGENT_PROMPTS — Versionamento e A/B testing de prompts
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Versao
  version INT NOT NULL,
  is_active BOOLEAN DEFAULT false,

  -- Conteudo
  system_prompt TEXT NOT NULL,
  instructions TEXT,

  -- A/B testing
  variant_name TEXT,
  is_variant BOOLEAN DEFAULT false,

  -- Metricas de performance desta versao
  total_conversations INT DEFAULT 0,
  avg_resolution_rate NUMERIC,
  avg_sentiment_score NUMERIC,
  avg_turn_count NUMERIC,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agent_id, version)
);

CREATE INDEX idx_ai_prompts_agent ON ai_agent_prompts(agent_id) WHERE is_active = true;

ALTER TABLE ai_agent_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_prompts_select" ON ai_agent_prompts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_prompts_insert" ON ai_agent_prompts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_prompts_update" ON ai_agent_prompts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_prompts_delete" ON ai_agent_prompts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_prompts_service" ON ai_agent_prompts FOR ALL TO service_role USING (true);

-- ============================================================================
-- 10. AI_AGENT_METRICS — Metricas agregadas por dia
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Bucket temporal
  date_bucket DATE NOT NULL,
  period TEXT DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly')),

  -- Metricas de conversas
  conversations_started INT DEFAULT 0,
  conversations_completed INT DEFAULT 0,
  conversations_escalated INT DEFAULT 0,
  avg_conversation_duration_seconds INT,

  -- Qualidade
  avg_sentiment_score NUMERIC,
  customer_satisfaction_score NUMERIC,
  resolution_rate NUMERIC,
  first_contact_resolution_rate NUMERIC,

  -- Engajamento
  avg_turns_per_conversation INT,
  avg_response_time_ms INT,

  -- Roteamento
  handoff_rate NUMERIC,
  fallback_rate NUMERIC,

  -- Impacto de negocio
  leads_qualified INT DEFAULT 0,
  proposals_generated INT DEFAULT 0,
  bookings_influenced INT DEFAULT 0,

  -- Custo
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, date_bucket, period)
);

CREATE INDEX idx_ai_metrics_agent_date ON ai_agent_metrics(agent_id, date_bucket DESC);

ALTER TABLE ai_agent_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_metrics_select" ON ai_agent_metrics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_metrics_service" ON ai_agent_metrics FOR ALL TO service_role USING (true);

-- ============================================================================
-- 11. AI_AGENT_PHONE_LINE_CONFIG — Qual agente roda em qual linha WhatsApp
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agent_phone_line_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  phone_line_id UUID NOT NULL,  -- FK para whatsapp_linha_config (adicionada via ALTER se tabela existir)

  ativa BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,  -- Maior = mais prioridade

  -- Filtros adicionais de roteamento
  routing_filter JSONB DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, phone_line_id)
);

CREATE INDEX idx_ai_phone_line ON ai_agent_phone_line_config(phone_line_id) WHERE ativa = true;

ALTER TABLE ai_agent_phone_line_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_phone_select" ON ai_agent_phone_line_config FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_phone_insert" ON ai_agent_phone_line_config FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_phone_update" ON ai_agent_phone_line_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_phone_delete" ON ai_agent_phone_line_config FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_phone_service" ON ai_agent_phone_line_config FOR ALL TO service_role USING (true);

-- ============================================================================
-- 12. AI_SKILL_USAGE_LOGS — Log de execucao de skills
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_skill_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_turn_id UUID REFERENCES ai_conversation_turns(id) ON DELETE SET NULL,
  skill_id UUID NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Execucao
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INT,
  success BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_skill_logs_skill ON ai_skill_usage_logs(skill_id, created_at DESC);
CREATE INDEX idx_ai_skill_logs_agent ON ai_skill_usage_logs(agent_id, created_at DESC);

ALTER TABLE ai_skill_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_skill_logs_select" ON ai_skill_usage_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id()));
CREATE POLICY "ai_skill_logs_service" ON ai_skill_usage_logs FOR ALL TO service_role USING (true);

-- ============================================================================
-- RPC: Busca semantica em knowledge base
-- ============================================================================
CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_kb_id UUID,
  p_query_embedding vector(1536),
  p_match_threshold NUMERIC DEFAULT 0.7,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  conteudo TEXT,
  tags JSONB,
  similarity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kbi.id,
    kbi.titulo,
    kbi.conteudo,
    kbi.tags,
    (1 - (kbi.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM ai_knowledge_base_items kbi
  WHERE kbi.kb_id = p_kb_id
    AND kbi.ativa = true
    AND kbi.embedding IS NOT NULL
    AND (1 - (kbi.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY kbi.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ============================================================================
-- RPC: Agregar metricas diarias de um agente
-- ============================================================================
CREATE OR REPLACE FUNCTION aggregate_ai_agent_metrics(
  p_agent_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started INT;
  v_completed INT;
  v_escalated INT;
  v_avg_turns INT;
  v_avg_sentiment NUMERIC;
  v_total_input_tokens BIGINT;
  v_total_output_tokens BIGINT;
BEGIN
  -- Contar conversas do dia
  SELECT
    COUNT(*) FILTER (WHERE status IN ('active', 'waiting', 'escalated', 'completed', 'archived')),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'escalated')
  INTO v_started, v_completed, v_escalated
  FROM ai_conversations
  WHERE primary_agent_id = p_agent_id
    AND DATE(created_at) = p_date;

  -- Media de turns e sentiment
  SELECT
    AVG(sub.turn_count)::INT,
    AVG(sub.avg_sent)
  INTO v_avg_turns, v_avg_sentiment
  FROM (
    SELECT
      c.id,
      COUNT(t.id) AS turn_count,
      AVG(t.confidence) AS avg_sent
    FROM ai_conversations c
    JOIN ai_conversation_turns t ON t.conversation_id = c.id
    WHERE c.primary_agent_id = p_agent_id
      AND DATE(c.created_at) = p_date
    GROUP BY c.id
  ) sub;

  -- Total de tokens
  SELECT
    COALESCE(SUM(t.input_tokens), 0),
    COALESCE(SUM(t.output_tokens), 0)
  INTO v_total_input_tokens, v_total_output_tokens
  FROM ai_conversation_turns t
  JOIN ai_conversations c ON c.id = t.conversation_id
  WHERE c.primary_agent_id = p_agent_id
    AND DATE(c.created_at) = p_date;

  -- Upsert metricas
  INSERT INTO ai_agent_metrics (
    agent_id, date_bucket, period,
    conversations_started, conversations_completed, conversations_escalated,
    avg_turns_per_conversation, avg_sentiment_score,
    total_input_tokens, total_output_tokens,
    resolution_rate, handoff_rate
  )
  VALUES (
    p_agent_id, p_date, 'daily',
    v_started, v_completed, v_escalated,
    v_avg_turns, v_avg_sentiment,
    v_total_input_tokens, v_total_output_tokens,
    CASE WHEN v_started > 0 THEN v_completed::NUMERIC / v_started ELSE 0 END,
    CASE WHEN v_started > 0 THEN v_escalated::NUMERIC / v_started ELSE 0 END
  )
  ON CONFLICT (agent_id, date_bucket, period)
  DO UPDATE SET
    conversations_started = EXCLUDED.conversations_started,
    conversations_completed = EXCLUDED.conversations_completed,
    conversations_escalated = EXCLUDED.conversations_escalated,
    avg_turns_per_conversation = EXCLUDED.avg_turns_per_conversation,
    avg_sentiment_score = EXCLUDED.avg_sentiment_score,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    resolution_rate = EXCLUDED.resolution_rate,
    handoff_rate = EXCLUDED.handoff_rate;
END;
$$;

-- ============================================================================
-- FKs condicionais (tabelas que podem nao existir no staging)
-- ============================================================================
DO $$
BEGIN
  -- FK conversations → contatos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contatos' AND table_schema = 'public') THEN
    ALTER TABLE ai_conversations ADD CONSTRAINT fk_ai_conv_contato
      FOREIGN KEY (contact_id) REFERENCES contatos(id) ON DELETE SET NULL;
  END IF;

  -- FK conversations → cards
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cards' AND table_schema = 'public') THEN
    ALTER TABLE ai_conversations ADD CONSTRAINT fk_ai_conv_card
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL;
  END IF;

  -- FK phone_line_config → whatsapp_linha_config
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_linha_config' AND table_schema = 'public') THEN
    ALTER TABLE ai_agent_phone_line_config ADD CONSTRAINT fk_ai_phone_line
      FOREIGN KEY (phone_line_id) REFERENCES whatsapp_linha_config(id) ON DELETE CASCADE;
  END IF;
END;
$$;
