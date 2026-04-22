-- ============================================================
-- Travel Planner — Viagem opcionalmente ligada a card + hidratação de Produto-Vendas
--
-- Mudanças:
-- 1. viagens.card_id agora é NULLABLE (viagem pode nascer sem card e ser atrelada depois)
-- 2. Trigger auto_set_viagens_org_from_card aceita card_id NULL (usa requesting_org_id)
-- 3. trip_items ganha source_type + source_id (para rastrear origem e evitar duplicar)
-- 4. Função helper fn_infer_trip_item_tipo (heurística por palavra-chave)
-- 5. RPC criar_viagem (p_card_id opcional, p_hidratar default true)
-- 6. RPC atrelar_viagem_a_card (liga viagem solta a um card depois)
-- 7. RPC hidratar_viagem_de_financeiro (copia card_financial_items → trip_items, skip se já existe)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. card_id NULLABLE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.viagens
  ALTER COLUMN card_id DROP NOT NULL;

COMMENT ON COLUMN public.viagens.card_id IS
  'Card ao qual a viagem está ligada. NULL = viagem solta (será atrelada depois via atrelar_viagem_a_card). UNIQUE permite múltiplos NULL.';

-- ────────────────────────────────────────────────────────────
-- 2. Trigger auto_set_viagens_org_from_card — aceita card_id NULL
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_viagens_org_from_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
  ctx_org  UUID;
BEGIN
  -- Caso 1: viagem solta (sem card) — usa org do JWT
  IF NEW.card_id IS NULL THEN
    IF NEW.org_id IS NULL THEN
      ctx_org := requesting_org_id();
      IF ctx_org IS NULL THEN
        RAISE EXCEPTION 'viagens: org_id não pode ser NULL quando card_id é NULL (requesting_org_id também é NULL)'
          USING ERRCODE = 'not_null_violation';
      END IF;
      NEW.org_id := ctx_org;
    END IF;
    RETURN NEW;
  END IF;

  -- Caso 2: viagem ligada a card — org obrigatoriamente vem do card
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

-- ────────────────────────────────────────────────────────────
-- 3. trip_items: source_type + source_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.trip_items
  ADD COLUMN IF NOT EXISTS source_type TEXT
    CHECK (source_type IS NULL OR source_type IN ('manual', 'proposal', 'financeiro', 'library')),
  ADD COLUMN IF NOT EXISTS source_id UUID;

COMMENT ON COLUMN public.trip_items.source_type IS
  'Origem do item: manual (criado à mão), proposal (veio da proposta aceita), financeiro (veio de card_financial_items), library (veio da biblioteca de itens reutilizáveis). NULL = sem origem rastreada (itens legacy).';

COMMENT ON COLUMN public.trip_items.source_id IS
  'ID do registro de origem na tabela correspondente ao source_type. Usado para evitar duplicar ao re-hidratar.';

CREATE INDEX IF NOT EXISTS idx_trip_items_source
  ON public.trip_items (source_type, source_id)
  WHERE source_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 4. Helper: inferir trip_item_tipo a partir de descrição livre
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_infer_trip_item_tipo(p_description TEXT)
RETURNS trip_item_tipo
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_description IS NULL OR p_description = '' THEN 'texto'::trip_item_tipo
    WHEN p_description ~* '(di[aá]ria|hospeda|hotel|resort|pousada|albergue|su[ií]te|acomoda[cç][ãa]o)' THEN 'hotel'::trip_item_tipo
    WHEN p_description ~* '(v[oô]o|a[eé]reo|passagem|companhia a[eé]rea)' THEN 'voo'::trip_item_tipo
    WHEN p_description ~* '(traslado|transfer|transporte priv|transporte compartilh)' THEN 'transfer'::trip_item_tipo
    WHEN p_description ~* '(passeio|tour|excurs[ãa]o|ingresso|atra[cç][ãa]o|visita guiada|city tour)' THEN 'passeio'::trip_item_tipo
    WHEN p_description ~* '(refei[cç][ãa]o|jantar|almo[cç]o|caf[eé] da manh[ãa]|brunch|gastron[oô])' THEN 'refeicao'::trip_item_tipo
    WHEN p_description ~* '(seguro viagem|seguro)' THEN 'seguro'::trip_item_tipo
    ELSE 'texto'::trip_item_tipo
  END;
$fn$;

COMMENT ON FUNCTION public.fn_infer_trip_item_tipo(TEXT) IS
  'Heurística por palavra-chave para mapear card_financial_items.description → trip_item_tipo. Retorna "texto" como fallback.';

-- ────────────────────────────────────────────────────────────
-- 5. hidratar_viagem_de_financeiro — copia card_financial_items → trip_items
-- ────────────────────────────────────────────────────────────
-- Regras:
-- - Item já hidratado (mesmo source_id) → NÃO recria (preserva edições do PV)
-- - Item novo do Monde → cria como trip_item com source_type='financeiro', status='operacional'
-- - Tipo inferido por fn_infer_trip_item_tipo(description)
-- - Ordem continua do max atual
-- Retorna: número de itens novos criados.
CREATE OR REPLACE FUNCTION public.hidratar_viagem_de_financeiro(p_viagem_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_financial RECORD;
  v_max_ordem INT;
  v_criados INT := 0;
  v_ja_existentes INT := 0;
BEGIN
  -- Buscar viagem
  SELECT id, card_id, org_id
  INTO v_viagem
  FROM public.viagens
  WHERE id = p_viagem_id;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem % não encontrada', p_viagem_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Sem card, nada a hidratar
  IF v_viagem.card_id IS NULL THEN
    RETURN jsonb_build_object('criados', 0, 'ja_existentes', 0, 'motivo', 'viagem_sem_card');
  END IF;

  -- Max ordem atual (itens ativos)
  SELECT COALESCE(MAX(ordem), -1)
  INTO v_max_ordem
  FROM public.trip_items
  WHERE viagem_id = p_viagem_id
    AND deleted_at IS NULL;

  -- Iterar card_financial_items do card
  FOR v_financial IN
    SELECT id, description, sale_value, fornecedor, representante,
           documento, data_inicio, data_fim, observacoes, supplier_cost, is_ready
    FROM public.card_financial_items
    WHERE card_id = v_viagem.card_id
    ORDER BY created_at
  LOOP
    -- Se já existe trip_item com essa origem, pula (não sobrescreve edição do PV)
    IF EXISTS (
      SELECT 1 FROM public.trip_items
      WHERE viagem_id = p_viagem_id
        AND source_type = 'financeiro'
        AND source_id = v_financial.id
    ) THEN
      v_ja_existentes := v_ja_existentes + 1;
      CONTINUE;
    END IF;

    v_max_ordem := v_max_ordem + 1;

    INSERT INTO public.trip_items (
      viagem_id, org_id, tipo, status, ordem,
      comercial, operacional, alternativas,
      source_type, source_id,
      criado_por_papel
    ) VALUES (
      p_viagem_id,
      v_viagem.org_id,
      fn_infer_trip_item_tipo(v_financial.description),
      'operacional',  -- já foi fechado no Produto-Vendas
      v_max_ordem,
      jsonb_build_object(
        'titulo', COALESCE(v_financial.description, 'Item'),
        'preco', v_financial.sale_value,
        'descricao', v_financial.observacoes
      ),
      jsonb_build_object(
        'fornecedor', v_financial.fornecedor,
        'representante', v_financial.representante,
        'numero_reserva', v_financial.documento,
        'data_inicio', v_financial.data_inicio,
        'data_fim', v_financial.data_fim,
        'observacoes', v_financial.observacoes,
        'supplier_cost', v_financial.supplier_cost,
        'is_ready', v_financial.is_ready
      ),
      '[]'::jsonb,
      'financeiro',
      v_financial.id,
      'pv'
    );

    v_criados := v_criados + 1;
  END LOOP;

  -- Evento
  IF v_criados > 0 THEN
    INSERT INTO public.trip_events (viagem_id, org_id, tipo, payload)
    VALUES (p_viagem_id, v_viagem.org_id, 'hidratada_de_financeiro',
      jsonb_build_object('criados', v_criados, 'ja_existentes', v_ja_existentes));
  END IF;

  RETURN jsonb_build_object(
    'criados', v_criados,
    'ja_existentes', v_ja_existentes
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.hidratar_viagem_de_financeiro(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. criar_viagem — cria viagem (com ou sem card) e hidrata se pedido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_viagem(
  p_card_id   UUID    DEFAULT NULL,
  p_titulo    TEXT    DEFAULT NULL,
  p_subtitulo TEXT    DEFAULT NULL,
  p_hidratar  BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id         UUID;
  v_token      TEXT;
  v_hidratacao JSONB := NULL;
BEGIN
  -- Se p_card_id fornecido, valida que não existe viagem pra ele ainda (UNIQUE)
  IF p_card_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.viagens WHERE card_id = p_card_id) THEN
      RAISE EXCEPTION 'Card % já tem uma viagem associada', p_card_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.viagens (card_id, titulo, subtitulo)
  VALUES (p_card_id, p_titulo, p_subtitulo)
  RETURNING id, public_token
  INTO v_id, v_token;

  -- Hidratar se tem card e foi pedido
  IF p_card_id IS NOT NULL AND p_hidratar THEN
    v_hidratacao := public.hidratar_viagem_de_financeiro(v_id);
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'public_token', v_token,
    'card_id', p_card_id,
    'hidratacao', v_hidratacao
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.criar_viagem(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. atrelar_viagem_a_card — liga viagem solta a um card + hidrata
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atrelar_viagem_a_card(
  p_viagem_id UUID,
  p_card_id   UUID,
  p_hidratar  BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem    RECORD;
  v_card_org  UUID;
  v_hidratacao JSONB := NULL;
BEGIN
  SELECT id, card_id, org_id
  INTO v_viagem
  FROM public.viagens
  WHERE id = p_viagem_id;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem % não encontrada', p_viagem_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_viagem.card_id IS NOT NULL THEN
    RAISE EXCEPTION 'Viagem % já está atrelada ao card %', p_viagem_id, v_viagem.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Card existe e é da mesma org
  SELECT org_id INTO v_card_org
  FROM public.cards
  WHERE id = p_card_id;

  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'Card % não encontrado', p_card_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_card_org <> v_viagem.org_id THEN
    RAISE EXCEPTION 'Viagem (org %) e card (org %) são de organizações diferentes',
      v_viagem.org_id, v_card_org
      USING ERRCODE = 'check_violation';
  END IF;

  -- Card já tem viagem?
  IF EXISTS (SELECT 1 FROM public.viagens WHERE card_id = p_card_id) THEN
    RAISE EXCEPTION 'Card % já tem uma viagem associada', p_card_id
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.viagens
  SET card_id = p_card_id
  WHERE id = p_viagem_id;

  IF p_hidratar THEN
    v_hidratacao := public.hidratar_viagem_de_financeiro(p_viagem_id);
  END IF;

  RETURN jsonb_build_object(
    'viagem_id', p_viagem_id,
    'card_id', p_card_id,
    'hidratacao', v_hidratacao
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.atrelar_viagem_a_card(UUID, UUID, BOOLEAN) TO authenticated;
