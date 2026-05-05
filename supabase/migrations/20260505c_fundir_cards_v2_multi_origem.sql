-- ============================================================================
-- MIGRATION: fundir_cards_v2 — agrupa N origens em 1 destino com toggles
-- Date: 2026-05-05
--
-- Por que:
--   Vitor pediu: poder agrupar mais de um card em 1, escolher destino,
--   escolher se puxa tarefas e se puxa números de venda Monde.
--
-- O que fundir_cards_v2 faz:
--   - Aceita array de origens (1+) → 1 destino
--   - Sempre move: card_financial_items + financial_item_passengers,
--                  cards_contatos, card_team_members, card_attachments,
--                  activities (histórico)
--   - Opcional (toggle): tarefas (tabela `tarefas`)
--   - Opcional (toggle): números de venda Monde (produto_data.numero_venda_monde
--                        + histórico, via _merge_venda_monde_into_destino)
--   - Recalcula valor_final + receita do destino
--   - Arquiva todos os origens (archived_at + merge_metadata)
--
-- Notas:
--   - O fundir_cards original (1:1) continua existindo e é mantido pra retrocompat.
--   - Validações: org igual entre todos, destino não pode estar em origens,
--     todos os cards devem existir e não estar deletados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fundir_cards_v2(
  p_origens UUID[],
  p_destino UUID,
  p_migrate_tasks BOOLEAN DEFAULT TRUE,
  p_migrate_venda_monde BOOLEAN DEFAULT TRUE,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_destino_org UUID;
  v_destino_titulo TEXT;
  v_origem UUID;
  v_origem_org UUID;
  v_origem_titulo TEXT;
  v_total_items INTEGER := 0;
  v_total_passengers INTEGER := 0;
  v_total_contatos INTEGER := 0;
  v_total_activities INTEGER := 0;
  v_total_team INTEGER := 0;
  v_total_attachments INTEGER := 0;
  v_total_tasks INTEGER := 0;
  v_origens_processadas INTEGER := 0;
  v_origens_titulos TEXT[] := ARRAY[]::TEXT[];
  v_total_venda NUMERIC;
  v_total_custo NUMERIC;
  v_item_count INTEGER;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();

  IF p_destino IS NULL THEN
    RAISE EXCEPTION 'Destino é obrigatório';
  END IF;
  IF p_origens IS NULL OR array_length(p_origens, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos uma origem é obrigatória';
  END IF;
  IF p_destino = ANY(p_origens) THEN
    RAISE EXCEPTION 'Destino não pode estar entre as origens';
  END IF;

  -- Validar destino
  SELECT org_id, titulo INTO v_destino_org, v_destino_titulo
  FROM cards WHERE id = p_destino AND deleted_at IS NULL;
  IF v_destino_org IS NULL THEN
    RAISE EXCEPTION 'Card destino não encontrado';
  END IF;
  IF v_org_id IS NOT NULL AND v_destino_org <> v_org_id THEN
    RAISE EXCEPTION 'Card destino não pertence à sua organização';
  END IF;

  -- Iterar origens
  FOREACH v_origem IN ARRAY p_origens LOOP
    SELECT org_id, titulo INTO v_origem_org, v_origem_titulo
    FROM cards WHERE id = v_origem AND deleted_at IS NULL;
    IF v_origem_org IS NULL THEN
      RAISE EXCEPTION 'Card origem % não encontrado', v_origem;
    END IF;
    IF v_origem_org <> v_destino_org THEN
      RAISE EXCEPTION 'Card origem % está em org diferente do destino', v_origem;
    END IF;

    -- 1. Mover card_financial_items
    DECLARE v_n INTEGER; BEGIN
      WITH moved AS (
        UPDATE card_financial_items
           SET card_id = p_destino, updated_at = NOW()
         WHERE card_id = v_origem
        RETURNING id
      )
      SELECT COUNT(*)::INTEGER INTO v_n FROM moved;
      v_total_items := v_total_items + v_n;
    END;

    -- 2. Mover financial_item_passengers (coluna card_id própria)
    UPDATE financial_item_passengers SET card_id = p_destino WHERE card_id = v_origem;
    GET DIAGNOSTICS v_total_passengers = ROW_COUNT;

    -- 3. Mover cards_contatos (sem duplicar)
    DECLARE v_n INTEGER; BEGIN
      INSERT INTO cards_contatos (card_id, contato_id, papel, created_at)
      SELECT p_destino, contato_id, papel, NOW()
        FROM cards_contatos cc
       WHERE cc.card_id = v_origem
         AND NOT EXISTS (
           SELECT 1 FROM cards_contatos cc2
            WHERE cc2.card_id = p_destino AND cc2.contato_id = cc.contato_id
         );
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_contatos := v_total_contatos + v_n;
      DELETE FROM cards_contatos WHERE card_id = v_origem;
    END;

    -- 4. Mover activities (histórico)
    UPDATE activities SET card_id = p_destino WHERE card_id = v_origem;
    DECLARE v_n INTEGER; BEGIN
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_activities := v_total_activities + v_n;
    END;

    -- 5. Mover tarefas (se opt-in) — caso contrário, soft-delete pra não deixar órfãs
    IF p_migrate_tasks THEN
      DECLARE v_n INTEGER; BEGIN
        WITH moved AS (
          UPDATE tarefas SET card_id = p_destino WHERE card_id = v_origem AND deleted_at IS NULL
          RETURNING id
        )
        SELECT COUNT(*)::INTEGER INTO v_n FROM moved;
        v_total_tasks := v_total_tasks + v_n;
      END;
    ELSE
      -- Não migrar = marcar como deletadas pra não ficarem órfãs no card arquivado
      UPDATE tarefas
         SET deleted_at = NOW(),
             metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
               'auto_deleted_reason', 'card_origem_arquivado_em_fusao',
               'merged_from_card_id', v_origem
             )
       WHERE card_id = v_origem AND deleted_at IS NULL;
    END IF;

    -- 6. Mover card_team_members (sem duplicar)
    DECLARE v_n INTEGER; BEGIN
      INSERT INTO card_team_members (card_id, profile_id, role, created_by, created_at)
      SELECT p_destino, ctm.profile_id, ctm.role, ctm.created_by, NOW()
        FROM card_team_members ctm
       WHERE ctm.card_id = v_origem
         AND NOT EXISTS (
           SELECT 1 FROM card_team_members ctm2
            WHERE ctm2.card_id = p_destino
              AND ctm2.profile_id = ctm.profile_id
              AND ctm2.role = ctm.role
         );
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_team := v_total_team + v_n;
      DELETE FROM card_team_members WHERE card_id = v_origem;
    END;

    -- 7. Mover card_attachments (se a tabela existir)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'card_attachments'
    ) THEN
      DECLARE v_n INTEGER; BEGIN
        EXECUTE format(
          'UPDATE card_attachments SET card_id = %L WHERE card_id = %L',
          p_destino, v_origem
        );
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total_attachments := v_total_attachments + v_n;
      END;
    END IF;

    -- 8. Migrar venda Monde (se opt-in)
    IF p_migrate_venda_monde THEN
      PERFORM _merge_venda_monde_into_destino(v_origem, p_destino, TRUE);
    END IF;

    -- 9. Arquivar a origem
    UPDATE cards
       SET archived_at = NOW(),
           updated_at = NOW(),
           merge_metadata = COALESCE(merge_metadata, '{}'::JSONB) || jsonb_build_object(
             'merged_into_card_id', p_destino,
             'merged_into_titulo', v_destino_titulo,
             'merged_at', NOW(),
             'merged_by', v_user_id,
             'motivo', p_motivo,
             'migrate_tasks', p_migrate_tasks,
             'migrate_venda_monde', p_migrate_venda_monde,
             'merge_v', 2
           ),
           sub_card_status = CASE
             WHEN card_type = 'sub_card' THEN 'merged'
             ELSE sub_card_status
           END
     WHERE id = v_origem;

    v_origens_processadas := v_origens_processadas + 1;
    v_origens_titulos := array_append(v_origens_titulos, v_origem_titulo);
  END LOOP;

  -- Recalcular valor + receita do destino com base nos itens consolidados
  SELECT
    COALESCE(SUM(sale_value), 0),
    COALESCE(SUM(supplier_cost), 0),
    COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items
   WHERE card_id = p_destino;

  IF v_item_count > 0 THEN
    UPDATE cards
       SET valor_final = v_total_venda,
           receita = (v_total_venda - v_total_custo),
           receita_source = 'calculated',
           updated_at = NOW()
     WHERE id = p_destino;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'card_destino_id', p_destino,
    'card_destino_titulo', v_destino_titulo,
    'origens_processadas', v_origens_processadas,
    'origens_titulos', to_jsonb(v_origens_titulos),
    'items_moved', v_total_items,
    'passengers_moved', v_total_passengers,
    'contatos_moved', v_total_contatos,
    'activities_moved', v_total_activities,
    'tasks_moved', v_total_tasks,
    'team_moved', v_total_team,
    'attachments_moved', v_total_attachments,
    'destino_valor_final', v_total_venda,
    'destino_receita', CASE WHEN v_item_count > 0 THEN (v_total_venda - v_total_custo) ELSE NULL END,
    'migrate_tasks', p_migrate_tasks,
    'migrate_venda_monde', p_migrate_venda_monde
  );
END;
$$;

COMMENT ON FUNCTION fundir_cards_v2 IS
  'Funde N cards origens em 1 destino. Sempre move itens, contatos, equipe, anexos, histórico. Toggles para tarefas e nº de venda Monde. Arquiva todas as origens.';

GRANT EXECUTE ON FUNCTION fundir_cards_v2(UUID[], UUID, BOOLEAN, BOOLEAN, TEXT) TO authenticated;

COMMIT;
