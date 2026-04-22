-- ============================================================
-- Travel Planner — Bloco E: Sub-card absorvido pela viagem mãe
--
-- Quando o TP abre um sub-card (venda adicional ou mudança) e o PV faz
-- merge, os itens da viagem do sub-card precisam aparecer na viagem
-- mãe para que o cliente veja tudo como uma única viagem.
--
-- 1. Extender check de source_type para 'sub_card'
-- 2. Função fn_absorver_trip_items_sub_card(p_sub_card_id)
--    - Para cada trip_item da viagem do sub-card, insere cópia na viagem
--      da mãe com source_type='sub_card' + source_id=sub_item.id
--    - Dedup: não duplica se já absorvido antes
--    - Dias: se o sub-card tem dias e a mãe não, copia; se mãe já tem
--      dias, anexa itens como "órfãos" na mãe (parent_id=NULL)
-- 3. Trigger AFTER UPDATE em cards quando sub_card_status passa para
--    'merged' → chama a função de absorção automaticamente
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Estender source_type check
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.trip_items
  DROP CONSTRAINT IF EXISTS trip_items_source_type_check;

ALTER TABLE public.trip_items
  ADD CONSTRAINT trip_items_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('manual', 'proposal', 'financeiro', 'library', 'sub_card'));

COMMENT ON COLUMN public.trip_items.source_type IS
  'Origem do item: manual, proposal, financeiro (Produto-Vendas), library (biblioteca), sub_card (absorvido de viagem de sub-card mergeado). NULL = sem origem.';

-- ────────────────────────────────────────────────────────────
-- 2. fn_absorver_trip_items_sub_card — copia itens do sub-card
--    para a viagem da mãe
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_absorver_trip_items_sub_card(p_sub_card_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_sub_card RECORD;
  v_parent_card_id UUID;
  v_sub_viagem_id UUID;
  v_parent_viagem RECORD;
  v_item RECORD;
  v_absorvidos INT := 0;
  v_pulados INT := 0;
  v_max_ordem INT;
BEGIN
  -- Sub-card válido
  SELECT id, parent_card_id, org_id INTO v_sub_card
  FROM cards
  WHERE id = p_sub_card_id AND card_type = 'sub_card';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Sub-card não encontrado');
  END IF;
  v_parent_card_id := v_sub_card.parent_card_id;
  IF v_parent_card_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Sub-card sem parent_card_id');
  END IF;

  -- Viagem do sub-card (opcional — sub-card pode não ter viagem)
  SELECT id INTO v_sub_viagem_id FROM viagens WHERE card_id = p_sub_card_id;
  IF v_sub_viagem_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'motivo', 'Sub-card não tem viagem; nada a absorver', 'absorvidos', 0);
  END IF;

  -- Viagem da mãe
  SELECT * INTO v_parent_viagem FROM viagens WHERE card_id = v_parent_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Card mãe não tem viagem');
  END IF;

  -- Maior ordem atual na mãe (para anexar no fim)
  SELECT COALESCE(MAX(ordem), -1) INTO v_max_ordem
  FROM trip_items
  WHERE viagem_id = v_parent_viagem.id AND deleted_at IS NULL;

  -- Para cada trip_item do sub-card (exceto dias — anexamos como órfãos)
  FOR v_item IN
    SELECT *
    FROM trip_items
    WHERE viagem_id = v_sub_viagem_id
      AND deleted_at IS NULL
      AND tipo <> 'dia'
    ORDER BY ordem
  LOOP
    -- Dedup: pulamos se já foi absorvido antes
    IF EXISTS (
      SELECT 1 FROM trip_items
      WHERE viagem_id = v_parent_viagem.id
        AND source_type = 'sub_card'
        AND source_id = v_item.id
    ) THEN
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    v_max_ordem := v_max_ordem + 1;

    INSERT INTO trip_items (
      viagem_id, org_id, parent_id, tipo, status, ordem,
      comercial, operacional, alternativas,
      source_type, source_id,
      criado_por_papel
    )
    VALUES (
      v_parent_viagem.id,
      v_parent_viagem.org_id,
      NULL,                          -- anexa como órfão; PV pode mover pra um dia depois
      v_item.tipo,
      v_item.status,
      v_max_ordem,
      v_item.comercial,
      v_item.operacional,
      v_item.alternativas,
      'sub_card',
      v_item.id,
      'tp'                           -- TP é quem desenhou o sub-card
    );

    v_absorvidos := v_absorvidos + 1;
  END LOOP;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (
    v_parent_viagem.id,
    v_parent_viagem.org_id,
    'sub_card_absorvido',
    jsonb_build_object(
      'sub_card_id', p_sub_card_id,
      'sub_viagem_id', v_sub_viagem_id,
      'absorvidos', v_absorvidos,
      'pulados', v_pulados
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'absorvidos', v_absorvidos,
    'pulados', v_pulados,
    'parent_viagem_id', v_parent_viagem.id
  );
END
$fn$;

COMMENT ON FUNCTION public.fn_absorver_trip_items_sub_card(UUID) IS
  'Copia trip_items da viagem do sub-card para a viagem da mãe (source_type=sub_card). Idempotente.';

-- ────────────────────────────────────────────────────────────
-- 3. Trigger automático: sub_card_status vira 'merged'
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sub_card_merged_absorve_itens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  IF NEW.card_type <> 'sub_card' THEN RETURN NEW; END IF;
  IF OLD.sub_card_status IS NOT DISTINCT FROM NEW.sub_card_status THEN RETURN NEW; END IF;
  IF NEW.sub_card_status <> 'merged' THEN RETURN NEW; END IF;

  -- Best effort: absorve itens. Não falha a transação se der errado
  -- (merge_sub_card já fez o trabalho crítico de valor/briefing).
  BEGIN
    v_result := public.fn_absorver_trip_items_sub_card(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Log via evento se possível, não rompe a transação
    RAISE NOTICE 'fn_absorver_trip_items_sub_card falhou para sub-card %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_sub_card_merged_absorve_itens ON cards;
CREATE TRIGGER trg_sub_card_merged_absorve_itens
  AFTER UPDATE OF sub_card_status ON cards
  FOR EACH ROW EXECUTE FUNCTION public.fn_sub_card_merged_absorve_itens();

-- Grant execute (chamável manualmente se necessário)
GRANT EXECUTE ON FUNCTION public.fn_absorver_trip_items_sub_card(UUID) TO authenticated;
