-- ============================================================================
-- AUTOMAÇÃO DE MENSAGENS WHATSAPP — Schema Completo
-- ============================================================================
-- 5 tabelas: mensagem_templates, automacao_regras, automacao_regra_passos,
--            automacao_execucoes, automacao_optout
-- 3 triggers: card events, documento events, proposta events
-- RLS com org_id isolation
-- ============================================================================

-- ============================================================================
-- 1. MENSAGEM_TEMPLATES — Templates de mensagem com 3 modos de geração
-- ============================================================================
CREATE TABLE IF NOT EXISTS mensagem_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  produto app_product,  -- NULL = todos os produtos

  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'follow_up'
    CHECK (categoria IN (
      'follow_up', 'nurturing', 'lembrete', 'reativacao', 'pos_venda',
      'aviso', 'boas_vindas', 'confirmacao', 'aniversario', 'outro'
    )),

  -- Modo de geração
  modo TEXT NOT NULL DEFAULT 'template_fixo'
    CHECK (modo IN ('template_fixo', 'template_ia', 'ia_generativa')),

  -- MODO template_fixo / template_ia: texto com {{variáveis}}
  corpo TEXT,

  -- MODO template_ia / ia_generativa: instrução para a IA
  ia_prompt TEXT,

  -- Config de contexto IA: o que a IA pode ver
  ia_contexto_config JSONB DEFAULT '{}'::JSONB,
  -- {
  --   "conversa": true, "conversa_limite": 30,
  --   "card_campos": ["titulo","destino","data_viagem_inicio","valor_estimado"],
  --   "contato_campos": ["nome","tipo_cliente","tags"],
  --   "proposta": false, "voos": false, "briefing": true,
  --   "historico_viagens": false, "observacoes": true
  -- }

  -- Restrições para a IA
  ia_restricoes JSONB DEFAULT '{}'::JSONB,
  -- {
  --   "max_caracteres": 500, "tom": "informal_caloroso",
  --   "idioma": "pt_BR", "proibido": ["preço","desconto"],
  --   "deve_incluir": ["nome_agente"], "persona": "agente_viagem"
  -- }

  -- HSM (Meta oficial)
  is_hsm BOOLEAN DEFAULT false,
  hsm_template_name TEXT,
  hsm_namespace TEXT,
  hsm_language TEXT DEFAULT 'pt_BR',
  corpo_fallback TEXT,

  -- Metadata
  variaveis JSONB DEFAULT '[]'::JSONB,
  ativa BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mt_org_produto ON mensagem_templates(org_id, produto) WHERE ativa = true;

ALTER TABLE mensagem_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mt_select" ON mensagem_templates FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "mt_insert" ON mensagem_templates FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "mt_update" ON mensagem_templates FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "mt_delete" ON mensagem_templates FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "mt_service" ON mensagem_templates FOR ALL TO service_role USING (true);

-- ============================================================================
-- 2. AUTOMACAO_REGRAS — A automação em si (trigger + condições + ação)
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacao_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  produto app_product NOT NULL,

  nome TEXT NOT NULL,
  descricao TEXT,
  ativa BOOLEAN DEFAULT false,  -- Sempre começa desativada

  -- single = 1 trigger → 1 msg, jornada = N passos sequenciais
  tipo TEXT NOT NULL DEFAULT 'single' CHECK (tipo IN ('single', 'jornada')),

  -- Trigger de entrada
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    -- Pipeline
    'stage_enter', 'stage_exit', 'card_won', 'card_lost',
    'card_created', 'field_changed', 'owner_changed',
    -- Temporal
    'dias_no_stage', 'dias_sem_contato', 'sem_resposta_horas',
    'dias_antes_viagem', 'dias_apos_viagem', 'aniversario_contato',
    -- Dados
    'documento_recebido', 'documento_pendente', 'proposta_visualizada',
    'proposta_aceita', 'proposta_expirada', 'voo_alterado',
    'pagamento_recebido', 'milestone_atingido',
    -- Externo
    'webhook_externo'
  )),

  trigger_config JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Condições (AND entre todas)
  condicoes JSONB DEFAULT '[]'::JSONB,

  -- Ação (para tipo='single')
  template_id UUID REFERENCES mensagem_templates(id),

  -- Controle
  max_envios_por_card INT DEFAULT 1,
  dedup_janela_horas INT DEFAULT 24,
  max_mensagens_contato_dia INT DEFAULT 3,
  response_aware BOOLEAN DEFAULT true,
  modo_aprovacao BOOLEAN DEFAULT false,

  -- Métricas
  total_disparados INT DEFAULT 0,
  total_enviados INT DEFAULT 0,
  total_entregues INT DEFAULT 0,
  total_lidos INT DEFAULT 0,
  total_respondidos INT DEFAULT 0,
  total_falhas INT DEFAULT 0,
  total_skipped INT DEFAULT 0,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ar_org_produto ON automacao_regras(org_id, produto) WHERE ativa = true;
CREATE INDEX idx_ar_trigger ON automacao_regras(trigger_type) WHERE ativa = true;

ALTER TABLE automacao_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_select" ON automacao_regras FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ar_insert" ON automacao_regras FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ar_update" ON automacao_regras FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ar_delete" ON automacao_regras FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ar_service" ON automacao_regras FOR ALL TO service_role USING (true);

-- ============================================================================
-- 3. AUTOMACAO_REGRA_PASSOS — Passos de jornada multi-step
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacao_regra_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id UUID NOT NULL REFERENCES automacao_regras(id) ON DELETE CASCADE,
  ordem INT NOT NULL,

  tipo TEXT NOT NULL CHECK (tipo IN (
    'enviar_mensagem', 'aguardar', 'criar_tarefa',
    'verificar_resposta', 'atualizar_campo'
  )),

  config JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_arp_regra_ordem ON automacao_regra_passos(regra_id, ordem);

-- RLS herda da regra pai (service_role + authenticated via join)
ALTER TABLE automacao_regra_passos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arp_select" ON automacao_regra_passos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automacao_regras ar WHERE ar.id = regra_id AND ar.org_id = requesting_org_id()
  ));
CREATE POLICY "arp_insert" ON automacao_regra_passos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM automacao_regras ar WHERE ar.id = regra_id AND ar.org_id = requesting_org_id()
  ));
CREATE POLICY "arp_update" ON automacao_regra_passos FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automacao_regras ar WHERE ar.id = regra_id AND ar.org_id = requesting_org_id()
  ));
CREATE POLICY "arp_delete" ON automacao_regra_passos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM automacao_regras ar WHERE ar.id = regra_id AND ar.org_id = requesting_org_id()
  ));
CREATE POLICY "arp_service" ON automacao_regra_passos FOR ALL TO service_role USING (true);

-- ============================================================================
-- 4. AUTOMACAO_EXECUCOES — Fila de execução + log completo
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacao_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id(),

  regra_id UUID NOT NULL REFERENCES automacao_regras(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contatos(id) ON DELETE SET NULL,

  -- Jornada tracking
  passo_atual_id UUID REFERENCES automacao_regra_passos(id),
  passo_atual_ordem INT DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'aguardando_horario', 'aguardando_passo',
    'gerando_ia', 'aguardando_aprovacao',
    'enviando', 'enviado', 'entregue', 'lido',
    'respondido', 'falhou', 'skipped', 'pausado', 'cancelado', 'completo'
  )),

  skip_reason TEXT,

  -- Trigger info
  trigger_type TEXT,
  trigger_data JSONB,

  -- Mensagem
  template_id UUID REFERENCES mensagem_templates(id),
  corpo_renderizado TEXT,
  corpo_ia_gerado TEXT,
  ia_contexto_usado JSONB,

  -- Echo tracking
  whatsapp_message_id UUID,
  echo_message_id TEXT,

  -- Retry
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  proximo_passo_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  enviado_at TIMESTAMPTZ,
  entregue_at TIMESTAMPTZ,
  lido_at TIMESTAMPTZ,
  respondido_at TIMESTAMPTZ,

  -- Dedup
  dedup_key TEXT
);

CREATE INDEX idx_ae_processaveis ON automacao_execucoes(status)
  WHERE status IN ('pending', 'aguardando_passo', 'aguardando_horario', 'aguardando_aprovacao', 'gerando_ia');
CREATE INDEX idx_ae_regra_status ON automacao_execucoes(regra_id, status);
CREATE INDEX idx_ae_card ON automacao_execucoes(card_id);
CREATE INDEX idx_ae_contact ON automacao_execucoes(contact_id);
CREATE INDEX idx_ae_proximo_passo ON automacao_execucoes(proximo_passo_at)
  WHERE status = 'aguardando_passo';
CREATE INDEX idx_ae_retry ON automacao_execucoes(next_retry_at)
  WHERE status = 'falhou' AND attempts < 3;
CREATE INDEX idx_ae_dedup ON automacao_execucoes(dedup_key);

ALTER TABLE automacao_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ae_select" ON automacao_execucoes FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ae_service" ON automacao_execucoes FOR ALL TO service_role USING (true);

-- ============================================================================
-- 5. AUTOMACAO_OPTOUT — Blocklist de contatos
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacao_optout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id(),
  contact_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  regra_id UUID REFERENCES automacao_regras(id) ON DELETE CASCADE,  -- NULL = optout global
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, regra_id)
);

CREATE INDEX idx_ao_contact ON automacao_optout(contact_id) WHERE regra_id IS NULL;

ALTER TABLE automacao_optout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ao_select" ON automacao_optout FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ao_insert" ON automacao_optout FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY "ao_delete" ON automacao_optout FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY "ao_service" ON automacao_optout FOR ALL TO service_role USING (true);

-- ============================================================================
-- 6. TRIGGER: Eventos de card → fila de automação
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_automacao_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
  v_trigger_data JSONB;
BEGIN
  -- Detectar evento
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'card_created';
    v_trigger_data := jsonb_build_object('card_id', NEW.id);

  ELSIF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    v_event_type := 'stage_enter';
    v_trigger_data := jsonb_build_object(
      'old_stage_id', OLD.pipeline_stage_id,
      'new_stage_id', NEW.pipeline_stage_id
    );

  ELSIF OLD.status_comercial IS DISTINCT FROM NEW.status_comercial THEN
    IF NEW.status_comercial = 'ganho' THEN
      v_event_type := 'card_won';
    ELSIF NEW.status_comercial = 'perdido' THEN
      v_event_type := 'card_lost';
    END IF;
    v_trigger_data := jsonb_build_object(
      'old_status', OLD.status_comercial,
      'new_status', NEW.status_comercial
    );

  ELSIF OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id THEN
    v_event_type := 'owner_changed';
    v_trigger_data := jsonb_build_object(
      'old_owner', OLD.dono_atual_id,
      'new_owner', NEW.dono_atual_id
    );
  END IF;

  -- Enfileirar para cada automação que matcha
  IF v_event_type IS NOT NULL AND NEW.pessoa_principal_id IS NOT NULL THEN
    INSERT INTO automacao_execucoes (
      org_id, regra_id, card_id, contact_id,
      trigger_type, trigger_data, template_id, dedup_key
    )
    SELECT
      ar.org_id,
      ar.id,
      NEW.id,
      NEW.pessoa_principal_id,
      v_event_type,
      v_trigger_data,
      ar.template_id,
      ar.id || '|' || NEW.id || '|' || CURRENT_DATE::TEXT
    FROM automacao_regras ar
    WHERE ar.ativa = true
      AND ar.produto::TEXT = NEW.produto::TEXT
      AND ar.trigger_type = v_event_type
      AND (
        v_event_type != 'stage_enter'
        OR NEW.pipeline_stage_id = ANY(
          ARRAY(SELECT jsonb_array_elements_text(ar.trigger_config->'stage_ids'))::UUID[]
        )
      )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_automacao_card_event
AFTER INSERT OR UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION queue_automacao_event();

-- ============================================================================
-- 7. TRIGGER: Documento recebido → fila de automação
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_automacao_documento_event()
RETURNS TRIGGER AS $$
DECLARE
  v_card_produto TEXT;
BEGIN
  -- Só dispara quando status muda para 'received'
  IF NEW.status = 'received' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'received') THEN
    SELECT c.produto::TEXT INTO v_card_produto
    FROM cards c WHERE c.id = NEW.card_id;

    INSERT INTO automacao_execucoes (
      org_id, regra_id, card_id, contact_id,
      trigger_type, trigger_data, template_id, dedup_key
    )
    SELECT
      ar.org_id,
      ar.id,
      NEW.card_id,
      NEW.contato_id,
      'documento_recebido',
      jsonb_build_object('document_type_id', NEW.document_type_id),
      ar.template_id,
      ar.id || '|' || NEW.card_id || '|' || NEW.document_type_id::TEXT || '|' || CURRENT_DATE::TEXT
    FROM automacao_regras ar
    WHERE ar.ativa = true
      AND ar.trigger_type = 'documento_recebido'
      AND (v_card_produto IS NULL OR ar.produto::TEXT = v_card_produto)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Só cria trigger se a tabela card_document_requirements existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'card_document_requirements') THEN
    EXECUTE 'CREATE TRIGGER trg_automacao_documento_event
      AFTER INSERT OR UPDATE ON card_document_requirements
      FOR EACH ROW EXECUTE FUNCTION queue_automacao_documento_event()';
  END IF;
END $$;

-- ============================================================================
-- 8. TRIGGER: Proposta visualizada → fila de automação
-- ============================================================================
CREATE OR REPLACE FUNCTION queue_automacao_proposta_event()
RETURNS TRIGGER AS $$
DECLARE
  v_card_id UUID;
  v_contact_id UUID;
  v_card_produto TEXT;
BEGIN
  IF NEW.event_type = 'viewed' THEN
    SELECT p.card_id INTO v_card_id
    FROM proposals p WHERE p.id = NEW.proposal_id;

    IF v_card_id IS NOT NULL THEN
      SELECT c.pessoa_principal_id, c.produto::TEXT
      INTO v_contact_id, v_card_produto
      FROM cards c WHERE c.id = v_card_id;

      INSERT INTO automacao_execucoes (
        org_id, regra_id, card_id, contact_id,
        trigger_type, trigger_data, template_id, dedup_key
      )
      SELECT
        ar.org_id,
        ar.id,
        v_card_id,
        v_contact_id,
        'proposta_visualizada',
        jsonb_build_object(
          'scroll_depth', NEW.scroll_depth,
          'duration_seconds', NEW.duration_seconds,
          'proposal_id', NEW.proposal_id
        ),
        ar.template_id,
        ar.id || '|' || v_card_id || '|' || CURRENT_DATE::TEXT
      FROM automacao_regras ar
      WHERE ar.ativa = true
        AND ar.trigger_type = 'proposta_visualizada'
        AND (v_card_produto IS NULL OR ar.produto::TEXT = v_card_produto)
        AND (
          (ar.trigger_config->>'min_scroll_depth') IS NULL
          OR COALESCE(NEW.scroll_depth, 0) >= (ar.trigger_config->>'min_scroll_depth')::INT
        )
        AND (
          (ar.trigger_config->>'min_duration_seconds') IS NULL
          OR COALESCE(NEW.duration_seconds, 0) >= (ar.trigger_config->>'min_duration_seconds')::INT
        )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Só cria trigger se a tabela proposal_events existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposal_events') THEN
    EXECUTE 'CREATE TRIGGER trg_automacao_proposta_event
      AFTER INSERT ON proposal_events
      FOR EACH ROW EXECUTE FUNCTION queue_automacao_proposta_event()';
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE mensagem_templates IS 'Templates de mensagem WhatsApp com 3 modos: fixo, template+IA, IA generativa';
COMMENT ON TABLE automacao_regras IS 'Regras de automação com trigger, condições e ação';
COMMENT ON TABLE automacao_regra_passos IS 'Passos sequenciais para jornadas multi-step';
COMMENT ON TABLE automacao_execucoes IS 'Fila de execução e log de cada disparo de automação';
COMMENT ON TABLE automacao_optout IS 'Blocklist de contatos (global ou por automação)';
