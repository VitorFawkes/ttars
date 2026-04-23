-- ============================================================================
-- MIGRATION: converter_sub_card_em_principal
-- Date: 2026-04-23
--
-- Transforma um sub-card em card principal (standard) — usado quando alguém
-- criou sub-card por engano para uma viagem que ainda não está em Pós-venda.
--
-- Efeito:
--   - card_type = 'standard'
--   - parent_card_id = NULL
--   - limpa sub_card_* fields (mode, status, category, agregado_em, valor_proprio, merge_config)
--   - recalcula valor_final do ex-pai (removendo o valor que veio deste sub-card)
--   - registra activities no ex-sub-card e no ex-pai
--
-- Regras:
--   - Só funciona em card_type = 'sub_card'
--   - Só funciona em sub_card_status = 'active' (se já completed/merged/cancelled,
--     a operação semântica é diferente — não queremos corromper dados agregados)
-- ============================================================================

CREATE OR REPLACE FUNCTION converter_sub_card_em_principal(
  p_sub_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_card_org UUID;
  v_card_type TEXT;
  v_status TEXT;
  v_parent UUID;
  v_titulo TEXT;
  v_user_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();

  IF p_sub_card_id IS NULL THEN
    RAISE EXCEPTION 'ID do sub-card é obrigatório';
  END IF;

  SELECT org_id, card_type, sub_card_status, parent_card_id, titulo
    INTO v_card_org, v_card_type, v_status, v_parent, v_titulo
    FROM cards
   WHERE id = p_sub_card_id AND deleted_at IS NULL;

  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'Card não encontrado';
  END IF;

  IF v_org_id IS NOT NULL AND v_card_org <> v_org_id THEN
    RAISE EXCEPTION 'Card não pertence à sua organização';
  END IF;

  IF v_card_type IS DISTINCT FROM 'sub_card' THEN
    RAISE EXCEPTION 'Este card não é um sub-card (tipo atual: %)', COALESCE(v_card_type, 'standard');
  END IF;

  -- Bloquear se já foi agregado/finalizado — evita inconsistência
  IF v_status IS NOT NULL AND v_status <> 'active' THEN
    RAISE EXCEPTION 'Sub-card já está "%" — não pode ser convertido. Status esperado: active', v_status;
  END IF;

  -- 1. Limpar flags de sub-card
  UPDATE cards
     SET card_type = 'standard',
         parent_card_id = NULL,
         sub_card_mode = NULL,
         sub_card_status = NULL,
         sub_card_category = NULL,
         sub_card_agregado_em = NULL,
         valor_proprio = NULL,
         merge_config = NULL,
         updated_at = NOW()
   WHERE id = p_sub_card_id;

  -- 2. Forçar recálculo do ex-pai (o trigger trg_aggregate_sub_card_values
  --    não dispara após o UPDATE acima porque card_type agora é 'standard').
  --    Para sub-cards ainda-não-Pós-venda, sub_card_agregado_em era NULL e
  --    esse sub-card nem entrava na soma — então na prática nada muda no pai,
  --    mas recalculamos pra ficar consistente se um dia mudar a regra.
  IF v_parent IS NOT NULL THEN
    UPDATE cards
       SET valor_final = (
             COALESCE(valor_proprio, 0) + COALESCE((
               SELECT SUM(COALESCE(sc.valor_final, sc.valor_estimado, 0))
                 FROM cards sc
                WHERE sc.parent_card_id = v_parent
                  AND sc.card_type = 'sub_card'
                  AND sc.sub_card_status IN ('active', 'completed')
                  AND sc.sub_card_agregado_em IS NOT NULL
             ), 0)
           ),
           updated_at = NOW()
     WHERE id = v_parent
       AND (card_type IS NULL OR card_type <> 'sub_card');
  END IF;

  -- 3. Activity no próprio card promovido
  INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
  VALUES (
    p_sub_card_id,
    'sub_card_promoted',
    'Sub-card virou card principal',
    jsonb_build_object('former_parent_id', v_parent, 'former_status', v_status),
    v_user_id,
    NOW()
  );

  -- 4. Activity no ex-pai (avisa que perdeu este sub-card)
  IF v_parent IS NOT NULL THEN
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
      v_parent,
      'sub_card_detached',
      CONCAT('Sub-card "', COALESCE(v_titulo, 'sem título'), '" virou card principal'),
      jsonb_build_object('former_sub_card_id', p_sub_card_id),
      v_user_id,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_sub_card_id,
    'former_parent_id', v_parent,
    'titulo', v_titulo
  );
END;
$$;

COMMENT ON FUNCTION converter_sub_card_em_principal IS
  'Transforma sub-card ativo em card standard (desvincula do pai). Usado para corrigir sub-cards criados por engano antes de Pós-venda.';

GRANT EXECUTE ON FUNCTION converter_sub_card_em_principal(UUID) TO authenticated;
