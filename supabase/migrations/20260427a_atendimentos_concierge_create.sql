-- =====================================================================
-- Módulo Concierge — Marco 1 (Fundação)
-- 20260427a: criar tabela atendimentos_concierge
--
-- Modelo híbrido: tarefa + complemento concierge ligado 1:1 por FK.
-- Tarefas com complemento concierge aparecem em UI especializada (página
-- /concierge, aba Concierge no card). Tarefas sem complemento continuam
-- funcionando como hoje pra todos os papéis.
-- =====================================================================

CREATE TABLE IF NOT EXISTS atendimentos_concierge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL UNIQUE REFERENCES tarefas(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  card_id UUID NOT NULL REFERENCES cards(id),

  -- Domínio: 4 tipos de alto nível + categoria granular
  tipo_concierge TEXT NOT NULL CHECK (tipo_concierge IN ('oferta', 'reserva', 'suporte', 'operacional')),
  categoria TEXT NOT NULL,
    -- valores típicos: 'passaporte', 'check_in', 'assento', 'ingresso', 'bagagem',
    -- 'restaurante', 'passeio', 'seguro', 'transfer', 'locacao',
    -- 'welcome_letter', 'vip_treatment', 'formulario', 'hotel_contato',
    -- 'roteiro_auxilio', 'publicar_app', 'pesquisa_pos', 'outro'

  -- Origem
  source TEXT NOT NULL CHECK (source IN ('cadencia', 'manual', 'cliente', 'planner_request')),
  cadence_step_id UUID REFERENCES cadence_steps(id),
  origem_descricao TEXT,

  -- Receita (preenchido quando aplica)
  valor NUMERIC(12,2),
  moeda TEXT DEFAULT 'BRL',
  cobrado_de TEXT CHECK (cobrado_de IN ('cliente', 'cortesia', 'incluido_pacote')),

  -- Outcome
  outcome TEXT CHECK (outcome IN ('aceito', 'recusado', 'feito', 'cancelado')),
  outcome_em TIMESTAMPTZ,
  outcome_por UUID REFERENCES profiles(id),

  -- Vínculo com entidade da viagem (futuro Travel Planner Redesign)
  trip_item_id UUID,
  hospedagem_ref TEXT,

  -- Comunicação
  notificou_cliente_em TIMESTAMPTZ,

  -- Payload tipado (campos específicos por categoria)
  payload JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_atend_concierge_card
  ON atendimentos_concierge(card_id, tipo_concierge);
CREATE INDEX IF NOT EXISTS idx_atend_concierge_org_outcome_pending
  ON atendimentos_concierge(org_id, outcome) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_atend_concierge_categoria
  ON atendimentos_concierge(org_id, categoria);
CREATE INDEX IF NOT EXISTS idx_atend_concierge_cadence
  ON atendimentos_concierge(cadence_step_id) WHERE cadence_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atend_concierge_tarefa
  ON atendimentos_concierge(tarefa_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_atend_concierge_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atend_concierge_set_updated_at ON atendimentos_concierge;
CREATE TRIGGER atend_concierge_set_updated_at
  BEFORE UPDATE ON atendimentos_concierge
  FOR EACH ROW EXECUTE FUNCTION trg_atend_concierge_set_updated_at();

-- =====================================================================
-- FK cross-org guard: garantir que org_id bate com tarefa pai E card pai
-- (padrão canônico: 20260414_h3_029_cadence_steps_strict_template_org.sql)
-- =====================================================================
CREATE OR REPLACE FUNCTION trg_atend_concierge_force_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_tarefa_org UUID;
  v_card_org UUID;
BEGIN
  SELECT org_id INTO v_tarefa_org FROM tarefas WHERE id = NEW.tarefa_id;
  SELECT org_id INTO v_card_org FROM cards WHERE id = NEW.card_id;

  IF v_tarefa_org IS NULL THEN
    RAISE EXCEPTION 'Tarefa % não encontrada para atendimento_concierge', NEW.tarefa_id;
  END IF;
  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'Card % não encontrado para atendimento_concierge', NEW.card_id;
  END IF;

  -- Forçar org_id = card.org_id (fonte de verdade)
  NEW.org_id := v_card_org;

  -- Validar consistência: tarefa precisa ser do mesmo org
  IF v_tarefa_org <> v_card_org THEN
    RAISE EXCEPTION 'org_id divergente: tarefa.org_id=% mas card.org_id=%', v_tarefa_org, v_card_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atend_concierge_force_org ON atendimentos_concierge;
CREATE TRIGGER atend_concierge_force_org
  BEFORE INSERT OR UPDATE OF tarefa_id, card_id, org_id ON atendimentos_concierge
  FOR EACH ROW EXECUTE FUNCTION trg_atend_concierge_force_org_consistency();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE atendimentos_concierge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atendimentos_concierge_org_all ON atendimentos_concierge;
CREATE POLICY atendimentos_concierge_org_all ON atendimentos_concierge
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS atendimentos_concierge_service_all ON atendimentos_concierge;
CREATE POLICY atendimentos_concierge_service_all ON atendimentos_concierge
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE atendimentos_concierge IS
  'Complemento de tarefas que são do domínio concierge. Liga 1:1 com tarefas via FK.
   Tarefa que tem linha aqui = atendimento concierge (oferta/reserva/suporte/operacional).
   Tarefa sem linha aqui = tarefa comum (continua funcionando como sempre).
   Marcar tarefas.concluida=true dispara trigger que atualiza outcome_em (migration 20260427e).';
