-- ============================================================
-- Marco 1 — Travel Planner: Triggers & Functions
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0. updated_at genérico
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.travel_planner_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_viagens_updated_at
  BEFORE UPDATE ON viagens
  FOR EACH ROW EXECUTE FUNCTION public.travel_planner_set_updated_at();

CREATE TRIGGER trg_trip_items_updated_at
  BEFORE UPDATE ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.travel_planner_set_updated_at();

CREATE TRIGGER trg_trip_library_items_updated_at
  BEFORE UPDATE ON trip_library_items
  FOR EACH ROW EXECUTE FUNCTION public.travel_planner_set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 1. FK cross-org guard: viagens ← cards
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_viagens_org_from_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
BEGIN
  SELECT org_id INTO card_org
  FROM public.cards
  WHERE id = NEW.card_id;

  IF card_org IS NULL THEN
    RAISE EXCEPTION 'viagens: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'viagens.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_viagens_org_from_card
  BEFORE INSERT OR UPDATE OF card_id, org_id ON viagens
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_viagens_org_from_card();

-- ────────────────────────────────────────────────────────────
-- 2. FK cross-org guard: trip_items ← viagens
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_trip_items_org_from_viagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  viagem_org UUID;
BEGIN
  SELECT org_id INTO viagem_org
  FROM public.viagens
  WHERE id = NEW.viagem_id;

  IF viagem_org IS NULL THEN
    RAISE EXCEPTION 'trip_items: viagem_id % não encontrado em viagens', NEW.viagem_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> viagem_org THEN
    RAISE EXCEPTION 'trip_items.org_id (%) diverge de viagens.org_id (%) para viagem %',
      NEW.org_id, viagem_org, NEW.viagem_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := viagem_org;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_trip_items_org_from_viagem
  BEFORE INSERT OR UPDATE OF viagem_id, org_id ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_items_org_from_viagem();

-- ────────────────────────────────────────────────────────────
-- 3. FK cross-org guard: trip_item_history ← trip_items
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_trip_item_history_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  item_org UUID;
  item_viagem UUID;
BEGIN
  SELECT org_id, viagem_id INTO item_org, item_viagem
  FROM public.trip_items
  WHERE id = NEW.item_id;

  IF item_org IS NULL THEN
    RAISE EXCEPTION 'trip_item_history: item_id % não encontrado em trip_items', NEW.item_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.org_id := item_org;
  NEW.viagem_id := item_viagem;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_trip_item_history_org
  BEFORE INSERT OR UPDATE OF item_id ON trip_item_history
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_item_history_org();

-- ────────────────────────────────────────────────────────────
-- 4. FK cross-org guard: trip_comments ← viagens
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_trip_comments_org_from_viagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  viagem_org UUID;
BEGIN
  SELECT org_id INTO viagem_org
  FROM public.viagens
  WHERE id = NEW.viagem_id;

  IF viagem_org IS NULL THEN
    RAISE EXCEPTION 'trip_comments: viagem_id % não encontrado em viagens', NEW.viagem_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> viagem_org THEN
    RAISE EXCEPTION 'trip_comments.org_id (%) diverge de viagens.org_id (%) para viagem %',
      NEW.org_id, viagem_org, NEW.viagem_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := viagem_org;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_trip_comments_org_from_viagem
  BEFORE INSERT OR UPDATE OF viagem_id, org_id ON trip_comments
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_comments_org_from_viagem();

-- ────────────────────────────────────────────────────────────
-- 5. FK cross-org guard: trip_events ← viagens
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_trip_events_org_from_viagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  viagem_org UUID;
BEGIN
  SELECT org_id INTO viagem_org
  FROM public.viagens
  WHERE id = NEW.viagem_id;

  IF viagem_org IS NULL THEN
    RAISE EXCEPTION 'trip_events: viagem_id % não encontrado em viagens', NEW.viagem_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> viagem_org THEN
    RAISE EXCEPTION 'trip_events.org_id (%) diverge de viagens.org_id (%) para viagem %',
      NEW.org_id, viagem_org, NEW.viagem_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := viagem_org;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_trip_events_org_from_viagem
  BEFORE INSERT OR UPDATE OF viagem_id, org_id ON trip_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_events_org_from_viagem();

-- ────────────────────────────────────────────────────────────
-- 6. Totalização: trip_items → viagens.total_estimado / total_aprovado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_items_totalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  target_viagem_id UUID;
  v_total_estimado NUMERIC;
  v_total_aprovado NUMERIC;
BEGIN
  target_viagem_id := COALESCE(NEW.viagem_id, OLD.viagem_id);

  SELECT
    COALESCE(SUM(
      CASE WHEN status IN ('proposto', 'aprovado', 'operacional', 'vivido')
           THEN (comercial->>'preco')::numeric
           ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN status IN ('aprovado', 'operacional', 'vivido')
           THEN (comercial->>'preco')::numeric
           ELSE 0 END
    ), 0)
  INTO v_total_estimado, v_total_aprovado
  FROM public.trip_items
  WHERE viagem_id = target_viagem_id
    AND deleted_at IS NULL
    AND parent_id IS NOT NULL;  -- dias (parent_id IS NULL) não têm preço

  UPDATE public.viagens
  SET total_estimado = v_total_estimado,
      total_aprovado = v_total_aprovado
  WHERE id = target_viagem_id;

  RETURN NULL;  -- AFTER trigger
END
$fn$;

CREATE TRIGGER trg_trip_items_totalize
  AFTER INSERT OR UPDATE OF status, comercial, deleted_at
  OR DELETE ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_trip_items_totalize();

-- ────────────────────────────────────────────────────────────
-- 7. Audit: trip_items → trip_item_history
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_items_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_papel TEXT;
  v_autor UUID;
BEGIN
  v_papel := COALESCE(NEW.editado_por_papel, 'sistema');
  v_autor := NEW.editado_por;

  IF OLD.comercial IS DISTINCT FROM NEW.comercial THEN
    INSERT INTO public.trip_item_history (item_id, viagem_id, org_id, autor, papel, campo, valor_anterior, valor_novo)
    VALUES (NEW.id, NEW.viagem_id, NEW.org_id, v_autor, v_papel, 'comercial', to_jsonb(OLD.comercial), to_jsonb(NEW.comercial));
  END IF;

  IF OLD.operacional IS DISTINCT FROM NEW.operacional THEN
    INSERT INTO public.trip_item_history (item_id, viagem_id, org_id, autor, papel, campo, valor_anterior, valor_novo)
    VALUES (NEW.id, NEW.viagem_id, NEW.org_id, v_autor, v_papel, 'operacional', to_jsonb(OLD.operacional), to_jsonb(NEW.operacional));
  END IF;

  IF OLD.alternativas IS DISTINCT FROM NEW.alternativas THEN
    INSERT INTO public.trip_item_history (item_id, viagem_id, org_id, autor, papel, campo, valor_anterior, valor_novo)
    VALUES (NEW.id, NEW.viagem_id, NEW.org_id, v_autor, v_papel, 'alternativas', to_jsonb(OLD.alternativas), to_jsonb(NEW.alternativas));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.trip_item_history (item_id, viagem_id, org_id, autor, papel, campo, valor_anterior, valor_novo)
    VALUES (NEW.id, NEW.viagem_id, NEW.org_id, v_autor, v_papel, 'status', to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  RETURN NULL;  -- AFTER trigger
END
$fn$;

CREATE TRIGGER trg_trip_items_audit
  AFTER UPDATE ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_trip_items_audit();

-- ────────────────────────────────────────────────────────────
-- 8. State machine: transições válidas de trip_item_status
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_items_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  valid BOOLEAN := false;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Tabela de adjacência
  CASE OLD.status::text
    WHEN 'rascunho'     THEN valid := NEW.status IN ('proposto', 'arquivado');
    WHEN 'proposto'     THEN valid := NEW.status IN ('aprovado', 'recusado', 'rascunho');
    WHEN 'aprovado'     THEN valid := NEW.status IN ('operacional', 'recusado');
    WHEN 'recusado'     THEN valid := NEW.status IN ('rascunho', 'proposto');
    WHEN 'operacional'  THEN valid := NEW.status IN ('vivido', 'aprovado');
    WHEN 'vivido'       THEN valid := NEW.status IN ('arquivado');
    WHEN 'arquivado'    THEN valid := false;
    ELSE valid := false;
  END CASE;

  IF NOT valid THEN
    RAISE EXCEPTION 'trip_items: transição inválida % → % para item %',
      OLD.status, NEW.status, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-preencher aprovado_em quando aprovado
  IF NEW.status = 'aprovado' AND OLD.status <> 'aprovado' THEN
    NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_trip_items_status_transition
  BEFORE UPDATE OF status ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_trip_items_status_transition();

-- ────────────────────────────────────────────────────────────
-- 9. Sync: cards.pipeline_stage_id → viagens.estado (pós-aceite)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cards_sync_viagem_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  novo_estado viagem_estado;
  viagem_atual RECORD;
BEGIN
  -- Só atua em cards TRIPS
  IF NEW.produto::text <> 'TRIPS' THEN
    RETURN NULL;
  END IF;

  -- Só se stage_id realmente mudou
  IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN
    RETURN NULL;
  END IF;

  -- Buscar viagem do card (pode não existir)
  SELECT id, estado INTO viagem_atual
  FROM public.viagens
  WHERE card_id = NEW.id;

  IF viagem_atual IS NULL THEN
    RETURN NULL;
  END IF;

  -- Só atualiza estados pós-aceite (viagem já confirmada)
  IF viagem_atual.estado NOT IN ('confirmada', 'em_montagem', 'aguardando_embarque', 'em_andamento', 'pos_viagem') THEN
    RETURN NULL;
  END IF;

  -- Mapeamento stage_id → viagem_estado
  CASE NEW.pipeline_stage_id::text
    WHEN 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36' THEN novo_estado := 'em_montagem';
    WHEN '1f684773-f8f3-434a-a44d-4994750c41aa' THEN novo_estado := 'aguardando_embarque';
    WHEN '3ce80249-b579-4a9c-9b82-f8569735cea9' THEN novo_estado := 'aguardando_embarque';
    WHEN '0ebab355-6d0e-4b19-af13-b4b31268275f' THEN novo_estado := 'em_andamento';
    WHEN '2c07134a-cb83-4075-bc86-4750beec9393' THEN novo_estado := 'pos_viagem';
    ELSE
      RETURN NULL;  -- stage desconhecido, não mexer
  END CASE;

  UPDATE public.viagens
  SET estado = novo_estado
  WHERE id = viagem_atual.id
    AND estado <> novo_estado;  -- evitar update desnecessário

  RETURN NULL;  -- AFTER trigger
END
$fn$;

CREATE TRIGGER trg_cards_sync_viagem_estado
  AFTER UPDATE OF pipeline_stage_id ON cards
  FOR EACH ROW EXECUTE FUNCTION public.fn_cards_sync_viagem_estado();
