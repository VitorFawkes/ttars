-- ============================================================
-- Cancelamento de Viagem Pós-Aceite — Schema (Travel Planner extension)
-- ============================================================
-- Adiciona "modo cancelamento" ortogonal à máquina de estados da viagem.
-- 3 tipos: total / parcial / mudanca_brusca. Ciclo: abrir → trabalhar → concluir.
-- Cliente continua com card ganho (decisão comercial: cancelado pós-aceite NÃO é perdido).
-- Plano completo: ~/.claude/plans/em-viagens-n-s-temos-sparkling-lemon.md
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. pipeline_stages.is_terminal — coluna nova
-- ────────────────────────────────────────────────────────────
-- Marca etapas terminais (cards param de receber roteamento automático).
-- A etapa "Cancelada" do pipeline Trips usa essa flag.
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS is_terminal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pipeline_stages.is_terminal IS
  'Marca etapa terminal: cards parados aqui são ignorados pelo cron de roteamento. Usado pela etapa Cancelada do Travel Planner.';

-- ────────────────────────────────────────────────────────────
-- 2. motivos_cancelamento — tabela nova
-- ────────────────────────────────────────────────────────────
-- Catálogo por org de motivos de cancelamento pós-aceite.
-- Espelha estrutura de motivos_perda, mas conceitualmente separado:
-- motivos_perda = "perdi a venda"; motivos_cancelamento = "cliente cancelou venda fechada".
-- Coluna escopo filtra motivos compatíveis com o tipo de cancelamento (total/parcial/mudanca/qualquer).
CREATE TABLE IF NOT EXISTS motivos_cancelamento (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  ordem       INT NOT NULL DEFAULT 0,
  escopo      TEXT NOT NULL DEFAULT 'qualquer'
              CHECK (escopo IN ('total', 'parcial', 'mudanca', 'qualquer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE motivos_cancelamento IS
  'Catálogo de motivos de cancelamento pós-aceite, por org. Separado de motivos_perda. Coluna escopo restringe motivos compatíveis com cada tipo de cancelamento.';

ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY motivos_cancelamento_org_all ON motivos_cancelamento TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY motivos_cancelamento_service_all ON motivos_cancelamento TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_motivos_cancelamento_org_ativo
  ON motivos_cancelamento (org_id, ativo, ordem);

-- updated_at automático
CREATE OR REPLACE FUNCTION motivos_cancelamento_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_motivos_cancelamento_updated_at ON motivos_cancelamento;
CREATE TRIGGER trg_motivos_cancelamento_updated_at
  BEFORE UPDATE ON motivos_cancelamento
  FOR EACH ROW EXECUTE FUNCTION motivos_cancelamento_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. viagens — 6 colunas novas
-- ────────────────────────────────────────────────────────────
ALTER TABLE viagens
  ADD COLUMN IF NOT EXISTS modo_cancelamento TEXT NULL
    CHECK (modo_cancelamento IN ('total', 'parcial', 'mudanca_brusca')),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento_id UUID NULL REFERENCES motivos_cancelamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento_obs TEXT NULL,
  ADD COLUMN IF NOT EXISTS cancelamento_aberto_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelamento_aberto_por UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelamento_concluido_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelamento_stage_anterior_id UUID NULL REFERENCES pipeline_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN viagens.modo_cancelamento IS
  'NULL = sem cancelamento em curso. ''total'' / ''parcial'' / ''mudanca_brusca'' indicam modo aberto.';
COMMENT ON COLUMN viagens.cancelamento_stage_anterior_id IS
  'Etapa de pipeline em que o card estava antes do cancelamento total. Usado para reabertura (restaurar posição).';

-- Índices pra relatórios e queries de "em curso"
CREATE INDEX IF NOT EXISTS idx_viagens_modo_cancelamento
  ON viagens (modo_cancelamento) WHERE modo_cancelamento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viagens_cancelamento_aberto_em
  ON viagens (cancelamento_aberto_em) WHERE cancelamento_aberto_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viagens_org_cancelamento_concluido
  ON viagens (org_id, cancelamento_concluido_em);
CREATE INDEX IF NOT EXISTS idx_viagens_tp_owner_cancelamento
  ON viagens (tp_owner_id) WHERE modo_cancelamento IS NOT NULL AND cancelamento_concluido_em IS NULL;

-- ────────────────────────────────────────────────────────────
-- 4. trip_items — 3 colunas novas
-- ────────────────────────────────────────────────────────────
ALTER TABLE trip_items
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT NULL;

COMMENT ON COLUMN trip_items.cancelado_em IS
  'Quando o item foi cancelado durante o modo cancelamento da viagem. NULL = não cancelado. Item cancelado também recebe status=arquivado.';

CREATE INDEX IF NOT EXISTS idx_trip_items_cancelado_em
  ON trip_items (cancelado_em) WHERE cancelado_em IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Etapa terminal "Cancelada" no pipeline Welcome Trips
-- ────────────────────────────────────────────────────────────
-- Lookup dinâmico do phase_id da fase pos_venda do pipeline Trips.
-- Pipeline Trips: c8022522-4a1d-411c-9387-efe03ca725ee (referenciado em CLAUDE.md e migrations).
DO $$
DECLARE
  v_pipeline_id  uuid := 'c8022522-4a1d-411c-9387-efe03ca725ee';
  v_phase_id     uuid;
  v_org_id       uuid := 'b0000000-0000-0000-0000-000000000001';  -- Welcome Trips
  v_max_ordem    int;
BEGIN
  -- pipeline_phases é por org (não por pipeline). Lookup por org + slug.
  SELECT id INTO v_phase_id
    FROM pipeline_phases
   WHERE org_id = v_org_id
     AND slug = 'pos_venda'
   LIMIT 1;

  IF v_phase_id IS NULL THEN
    RAISE NOTICE 'Pipeline Trips pos_venda phase não encontrada — etapa Cancelada não criada. Rodar manualmente após pipeline setup.';
    RETURN;
  END IF;

  -- Idempotente: só cria se ainda não existe
  IF EXISTS (
    SELECT 1 FROM pipeline_stages
     WHERE pipeline_id = v_pipeline_id
       AND phase_id = v_phase_id
       AND nome = 'Cancelada'
  ) THEN
    RAISE NOTICE 'Etapa Cancelada já existe — pulando criação.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(ordem), 0) + 1 INTO v_max_ordem
    FROM pipeline_stages
   WHERE pipeline_id = v_pipeline_id
     AND phase_id = v_phase_id;

  INSERT INTO pipeline_stages (
    pipeline_id, phase_id, org_id, nome, ordem, ativo,
    is_terminal, auto_advance, description
  ) VALUES (
    v_pipeline_id, v_phase_id, v_org_id, 'Cancelada', v_max_ordem, true,
    true, false, 'Etapa terminal para viagens com cancelamento total concluído. Card não recebe roteamento automático aqui.'
  );

  RAISE NOTICE 'Etapa Cancelada criada no pipeline Trips com ordem %', v_max_ordem;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Trigger: registrar abertura/conclusão/reabertura de cancelamento
-- ────────────────────────────────────────────────────────────
-- Quando viagens.modo_cancelamento muda, registra em trip_events + activities.
CREATE OR REPLACE FUNCTION fn_on_viagens_cancelamento_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_card_id     uuid;
  v_motivo_nome text;
  v_autor       uuid;
  v_event_tipo  text;
  v_descricao   text;
BEGIN
  -- Skip se nada relevante mudou
  IF NEW.modo_cancelamento IS NOT DISTINCT FROM OLD.modo_cancelamento
     AND NEW.cancelamento_concluido_em IS NOT DISTINCT FROM OLD.cancelamento_concluido_em
  THEN
    RETURN NEW;
  END IF;

  v_card_id := NEW.card_id;
  v_autor   := COALESCE(NEW.cancelamento_aberto_por, auth.uid());

  -- Caso 1: abertura (NULL → não-NULL)
  IF OLD.modo_cancelamento IS NULL AND NEW.modo_cancelamento IS NOT NULL THEN
    SELECT nome INTO v_motivo_nome FROM motivos_cancelamento WHERE id = NEW.motivo_cancelamento_id;
    v_event_tipo := 'cancelamento_aberto';
    v_descricao := format('Cancelamento %s aberto. Motivo: %s',
      NEW.modo_cancelamento,
      COALESCE(v_motivo_nome, 'sem motivo'));

  -- Caso 2: conclusão (concluido_em foi setado)
  ELSIF OLD.cancelamento_concluido_em IS NULL AND NEW.cancelamento_concluido_em IS NOT NULL THEN
    v_event_tipo := 'cancelamento_concluido';
    v_descricao := format('Cancelamento %s concluído.', NEW.modo_cancelamento);

  -- Caso 3: reabertura (concluido_em foi zerado, modo continua preenchido)
  ELSIF OLD.cancelamento_concluido_em IS NOT NULL AND NEW.cancelamento_concluido_em IS NULL
        AND NEW.modo_cancelamento IS NOT NULL
  THEN
    v_event_tipo := 'cancelamento_reaberto';
    v_descricao := format('Cancelamento %s reaberto.', NEW.modo_cancelamento);

  -- Caso 4: cancelamento desfeito antes de concluir (modo → NULL sem concluído)
  ELSIF OLD.modo_cancelamento IS NOT NULL AND NEW.modo_cancelamento IS NULL THEN
    v_event_tipo := 'cancelamento_desfeito';
    v_descricao := 'Cancelamento desfeito antes de conclusão.';

  ELSE
    RETURN NEW;  -- mudança não relevante
  END IF;

  -- Insert em trip_events
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (
    NEW.id,
    NEW.org_id,
    v_event_tipo,
    jsonb_build_object(
      'modo', NEW.modo_cancelamento,
      'motivo_id', NEW.motivo_cancelamento_id,
      'motivo_obs', NEW.motivo_cancelamento_obs,
      'autor_id', v_autor,
      'aberto_em', NEW.cancelamento_aberto_em,
      'concluido_em', NEW.cancelamento_concluido_em
    )
  );

  -- Insert em activities (timeline do card)
  IF v_card_id IS NOT NULL THEN
    INSERT INTO activities (card_id, org_id, tipo, descricao, actor_id, actor_type, metadata)
    VALUES (
      v_card_id,
      NEW.org_id,
      v_event_tipo,
      v_descricao,
      v_autor,
      'user',
      jsonb_build_object(
        'viagem_id', NEW.id,
        'modo', NEW.modo_cancelamento,
        'motivo_id', NEW.motivo_cancelamento_id
      )
    );
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_viagens_cancelamento_change ON viagens;
CREATE TRIGGER trg_viagens_cancelamento_change
  AFTER UPDATE OF modo_cancelamento, cancelamento_concluido_em ON viagens
  FOR EACH ROW EXECUTE FUNCTION fn_on_viagens_cancelamento_change();

-- ────────────────────────────────────────────────────────────
-- 7. Trigger: registrar cancelamento de item individual
-- ────────────────────────────────────────────────────────────
-- Quando trip_items.cancelado_em é setado, registra em trip_events e
-- propaga data_cancelamento para card_financial_items relacionados (best-effort
-- via match por título — não falha se não encontrar).
CREATE OR REPLACE FUNCTION fn_on_trip_items_cancelamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_card_id   uuid;
  v_titulo    text;
BEGIN
  -- Skip se cancelado_em não mudou pra valor não-NULL
  IF NEW.cancelado_em IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.cancelado_em IS NOT NULL THEN
    RETURN NEW;  -- já estava cancelado, não loga duas vezes
  END IF;

  SELECT card_id INTO v_card_id FROM viagens WHERE id = NEW.viagem_id;
  v_titulo := COALESCE(NEW.comercial->>'titulo', NEW.tipo::text);

  -- Insert em trip_events
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (
    NEW.viagem_id,
    NEW.org_id,
    'item_cancelado',
    jsonb_build_object(
      'item_id', NEW.id,
      'item_tipo', NEW.tipo,
      'item_titulo', v_titulo,
      'motivo', NEW.cancelado_motivo,
      'autor_id', NEW.cancelado_por
    )
  );

  -- Propaga pra card_financial_items: best-effort match por card_id + descrição.
  -- Não bloqueia se não encontrar (item pode ser de tipo sem financeiro associado).
  IF v_card_id IS NOT NULL THEN
    UPDATE card_financial_items
       SET data_cancelamento = NEW.cancelado_em,
           archived_reason = COALESCE(archived_reason, 'cancelamento_viagem')
     WHERE card_id = v_card_id
       AND data_cancelamento IS NULL
       AND (description ILIKE '%' || v_titulo || '%' OR documento ILIKE '%' || v_titulo || '%');
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_items_cancelamento ON trip_items;
CREATE TRIGGER trg_trip_items_cancelamento
  AFTER UPDATE OF cancelado_em ON trip_items
  FOR EACH ROW EXECUTE FUNCTION fn_on_trip_items_cancelamento();

-- ────────────────────────────────────────────────────────────
-- 8. Guard no cron de roteamento pós-venda Trips
-- ────────────────────────────────────────────────────────────
-- O filtro atual em fn_roteamento_pos_venda_trips lista as etapas operacionais
-- explicitamente, então etapas terminais (como "Cancelada") já são naturalmente
-- ignoradas. Esta migration NÃO altera a função do cron para evitar risco.
-- A etapa "Cancelada" criada acima funciona como sumidouro: cards lá não
-- entram no SELECT da função.
--
-- Se no futuro o filtro do cron mudar para incluir todas as etapas de uma fase,
-- adicionar guard explícito:
--   AND ps.is_terminal IS NOT TRUE
-- ============================================================
