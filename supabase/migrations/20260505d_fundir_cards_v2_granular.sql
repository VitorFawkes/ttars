-- ============================================================================
-- MIGRATION: fundir_cards_v2 com granularidade (escolher quais tarefas/Mondes)
-- Date: 2026-05-05
--
-- Adiciona dois parâmetros opcionais ao fundir_cards_v2:
--   - p_task_ids UUID[]            — quando NULL: migra todas as tarefas
--                                     pendentes; quando array: migra só essas
--                                     e cancela (soft-delete) o restante.
--   - p_venda_monde_numbers TEXT[] — quando NULL: migra todos os números
--                                     do origem; quando array: migra só esses;
--                                     o restante fica nas origens (que são
--                                     arquivadas).
--
-- Se p_migrate_tasks = false ignora p_task_ids (cancela tudo).
-- Se p_migrate_venda_monde = false ignora p_venda_monde_numbers.
--
-- Substitui a versão criada em 20260505c_fundir_cards_v2_multi_origem.sql.
-- ============================================================================

BEGIN;

-- Drop antigo: como mudamos a assinatura, precisa drop + create.
-- Procura todas as variantes possíveis (sem importar default values).
DROP FUNCTION IF EXISTS fundir_cards_v2(UUID[], UUID, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS fundir_cards_v2(UUID[], UUID, BOOLEAN, BOOLEAN, UUID[], TEXT[], TEXT);

CREATE OR REPLACE FUNCTION fundir_cards_v2(
  p_origens UUID[],
  p_destino UUID,
  p_migrate_tasks BOOLEAN DEFAULT TRUE,
  p_migrate_venda_monde BOOLEAN DEFAULT TRUE,
  p_task_ids UUID[] DEFAULT NULL,
  p_venda_monde_numbers TEXT[] DEFAULT NULL,
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
  v_total_tasks_moved INTEGER := 0;
  v_total_tasks_cancelled INTEGER := 0;
  v_total_monde_numbers INTEGER := 0;
  v_origens_processadas INTEGER := 0;
  v_origens_titulos TEXT[] := ARRAY[]::TEXT[];
  v_total_venda NUMERIC;
  v_total_custo NUMERIC;
  v_item_count INTEGER;
  v_origem_pd JSONB;
  v_destino_pd JSONB;
  v_destino_hist JSONB;
  v_destino_numero TEXT;
  v_origem_hist JSONB;
  v_origem_numero TEXT;
  v_seen_numbers TEXT[];
  v_combined_hist JSONB;
  v_entry JSONB;
  v_num TEXT;
  v_should_migrate BOOLEAN;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();

  IF p_destino IS NULL THEN RAISE EXCEPTION 'Destino é obrigatório'; END IF;
  IF p_origens IS NULL OR array_length(p_origens, 1) IS NULL THEN
    RAISE EXCEPTION 'Pelo menos uma origem é obrigatória';
  END IF;
  IF p_destino = ANY(p_origens) THEN
    RAISE EXCEPTION 'Destino não pode estar entre as origens';
  END IF;

  SELECT org_id, titulo INTO v_destino_org, v_destino_titulo
  FROM cards WHERE id = p_destino AND deleted_at IS NULL;
  IF v_destino_org IS NULL THEN RAISE EXCEPTION 'Card destino não encontrado'; END IF;
  IF v_org_id IS NOT NULL AND v_destino_org <> v_org_id THEN
    RAISE EXCEPTION 'Card destino não pertence à sua organização';
  END IF;

  FOREACH v_origem IN ARRAY p_origens LOOP
    SELECT org_id, titulo INTO v_origem_org, v_origem_titulo
    FROM cards WHERE id = v_origem AND deleted_at IS NULL;
    IF v_origem_org IS NULL THEN
      RAISE EXCEPTION 'Card origem % não encontrado', v_origem;
    END IF;
    IF v_origem_org <> v_destino_org THEN
      RAISE EXCEPTION 'Card origem % está em org diferente do destino', v_origem;
    END IF;

    -- 1. card_financial_items
    DECLARE v_n INTEGER; BEGIN
      WITH moved AS (
        UPDATE card_financial_items SET card_id = p_destino, updated_at = NOW()
         WHERE card_id = v_origem RETURNING id
      )
      SELECT COUNT(*)::INTEGER INTO v_n FROM moved;
      v_total_items := v_total_items + v_n;
    END;

    -- 2. financial_item_passengers
    UPDATE financial_item_passengers SET card_id = p_destino WHERE card_id = v_origem;
    GET DIAGNOSTICS v_total_passengers = ROW_COUNT;

    -- 3. cards_contatos
    DECLARE v_n INTEGER; BEGIN
      INSERT INTO cards_contatos (card_id, contato_id, papel, created_at)
      SELECT p_destino, contato_id, papel, NOW() FROM cards_contatos cc
       WHERE cc.card_id = v_origem
         AND NOT EXISTS (SELECT 1 FROM cards_contatos cc2
                          WHERE cc2.card_id = p_destino AND cc2.contato_id = cc.contato_id);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_contatos := v_total_contatos + v_n;
      DELETE FROM cards_contatos WHERE card_id = v_origem;
    END;

    -- 4. activities (histórico) sempre vai
    UPDATE activities SET card_id = p_destino WHERE card_id = v_origem;
    DECLARE v_n INTEGER; BEGIN
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_activities := v_total_activities + v_n;
    END;

    -- 5. tarefas — granular
    IF p_migrate_tasks THEN
      IF p_task_ids IS NULL THEN
        -- Migrar todas as pendentes (não concluídas, não deletadas)
        DECLARE v_n INTEGER; BEGIN
          WITH moved AS (
            UPDATE tarefas SET card_id = p_destino
             WHERE card_id = v_origem AND deleted_at IS NULL AND concluida = FALSE
            RETURNING id
          )
          SELECT COUNT(*)::INTEGER INTO v_n FROM moved;
          v_total_tasks_moved := v_total_tasks_moved + v_n;
        END;
        -- Tarefas já concluídas/deletadas: só atualizar card_id pra manter histórico
        UPDATE tarefas SET card_id = p_destino
         WHERE card_id = v_origem AND (deleted_at IS NOT NULL OR concluida = TRUE);
      ELSE
        -- Migrar só as do array
        DECLARE v_n INTEGER; BEGIN
          WITH moved AS (
            UPDATE tarefas SET card_id = p_destino
             WHERE card_id = v_origem AND id = ANY(p_task_ids)
            RETURNING id
          )
          SELECT COUNT(*)::INTEGER INTO v_n FROM moved;
          v_total_tasks_moved := v_total_tasks_moved + v_n;
        END;
        -- Pendentes não selecionadas: cancelar (soft-delete)
        DECLARE v_n INTEGER; BEGIN
          WITH cancelled AS (
            UPDATE tarefas
               SET deleted_at = NOW(),
                   metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
                     'auto_deleted_reason', 'nao_selecionada_em_fusao_v2',
                     'merged_from_card_id', v_origem
                   )
             WHERE card_id = v_origem AND deleted_at IS NULL AND concluida = FALSE
               AND NOT (id = ANY(p_task_ids))
            RETURNING id
          )
          SELECT COUNT(*)::INTEGER INTO v_n FROM cancelled;
          v_total_tasks_cancelled := v_total_tasks_cancelled + v_n;
        END;
        -- Concluídas/deletadas: ainda mover pra preservar histórico
        UPDATE tarefas SET card_id = p_destino
         WHERE card_id = v_origem AND (deleted_at IS NOT NULL OR concluida = TRUE);
      END IF;
    ELSE
      -- p_migrate_tasks = false: cancelar todas as pendentes
      DECLARE v_n INTEGER; BEGIN
        WITH cancelled AS (
          UPDATE tarefas
             SET deleted_at = NOW(),
                 metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
                   'auto_deleted_reason', 'nao_migrar_tarefas_em_fusao_v2',
                   'merged_from_card_id', v_origem
                 )
           WHERE card_id = v_origem AND deleted_at IS NULL AND concluida = FALSE
          RETURNING id
        )
        SELECT COUNT(*)::INTEGER INTO v_n FROM cancelled;
        v_total_tasks_cancelled := v_total_tasks_cancelled + v_n;
      END;
      -- Concluídas/deletadas: mover pra preservar histórico
      UPDATE tarefas SET card_id = p_destino
       WHERE card_id = v_origem AND (deleted_at IS NOT NULL OR concluida = TRUE);
    END IF;

    -- 6. card_team_members
    DECLARE v_n INTEGER; BEGIN
      INSERT INTO card_team_members (card_id, profile_id, role, created_by, created_at)
      SELECT p_destino, ctm.profile_id, ctm.role, ctm.created_by, NOW()
        FROM card_team_members ctm WHERE ctm.card_id = v_origem
         AND NOT EXISTS (SELECT 1 FROM card_team_members ctm2
                          WHERE ctm2.card_id = p_destino
                            AND ctm2.profile_id = ctm.profile_id
                            AND ctm2.role = ctm.role);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total_team := v_total_team + v_n;
      DELETE FROM card_team_members WHERE card_id = v_origem;
    END;

    -- 7. card_attachments (se existir)
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'card_attachments') THEN
      DECLARE v_n INTEGER; BEGIN
        EXECUTE format('UPDATE card_attachments SET card_id = %L WHERE card_id = %L',
                       p_destino, v_origem);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_total_attachments := v_total_attachments + v_n;
      END;
    END IF;

    -- 8. venda Monde — granular
    IF p_migrate_venda_monde THEN
      SELECT produto_data INTO v_origem_pd FROM cards WHERE id = v_origem;
      SELECT produto_data INTO v_destino_pd FROM cards WHERE id = p_destino;
      v_origem_pd := COALESCE(v_origem_pd, '{}'::JSONB);
      v_destino_pd := COALESCE(v_destino_pd, '{}'::JSONB);
      v_origem_numero := v_origem_pd->>'numero_venda_monde';
      v_destino_numero := v_destino_pd->>'numero_venda_monde';
      v_origem_hist := COALESCE(v_origem_pd->'numeros_venda_monde_historico', '[]'::JSONB);
      v_destino_hist := COALESCE(v_destino_pd->'numeros_venda_monde_historico', '[]'::JSONB);

      v_combined_hist := '[]'::JSONB;
      v_seen_numbers := ARRAY[]::TEXT[];

      -- Manter o que destino já tinha
      FOR v_entry IN SELECT * FROM jsonb_array_elements(v_destino_hist) LOOP
        v_num := v_entry->>'numero';
        IF v_num IS NOT NULL AND NOT (v_num = ANY(v_seen_numbers)) THEN
          v_combined_hist := v_combined_hist || v_entry;
          v_seen_numbers := array_append(v_seen_numbers, v_num);
        END IF;
      END LOOP;
      IF v_destino_numero IS NOT NULL AND NOT (v_destino_numero = ANY(v_seen_numbers)) THEN
        v_combined_hist := v_combined_hist || jsonb_build_object(
          'numero', v_destino_numero, 'origem', 'destino_original', 'movido_em', NOW()
        );
        v_seen_numbers := array_append(v_seen_numbers, v_destino_numero);
      END IF;

      -- Adicionar do origem (filtrando por p_venda_monde_numbers se fornecido)
      FOR v_entry IN SELECT * FROM jsonb_array_elements(v_origem_hist) LOOP
        v_num := v_entry->>'numero';
        IF v_num IS NULL OR (v_num = ANY(v_seen_numbers)) THEN CONTINUE; END IF;
        v_should_migrate := (p_venda_monde_numbers IS NULL) OR (v_num = ANY(p_venda_monde_numbers));
        IF v_should_migrate THEN
          v_combined_hist := v_combined_hist || v_entry;
          v_seen_numbers := array_append(v_seen_numbers, v_num);
          v_total_monde_numbers := v_total_monde_numbers + 1;
        END IF;
      END LOOP;

      -- Número atual do origem
      IF v_origem_numero IS NOT NULL AND NOT (v_origem_numero = ANY(v_seen_numbers)) THEN
        v_should_migrate := (p_venda_monde_numbers IS NULL) OR (v_origem_numero = ANY(p_venda_monde_numbers));
        IF v_should_migrate THEN
          v_combined_hist := v_combined_hist || jsonb_build_object(
            'numero', v_origem_numero,
            'origem', 'merged_from_card_' || v_origem::TEXT,
            'movido_em', NOW()
          );
          v_seen_numbers := array_append(v_seen_numbers, v_origem_numero);
          v_total_monde_numbers := v_total_monde_numbers + 1;
        END IF;
      END IF;

      -- Atualizar destino: número atual = preserva o que tinha; se NULL, pega o do origem (se foi migrado)
      IF v_destino_numero IS NULL AND v_origem_numero IS NOT NULL
         AND v_origem_numero = ANY(v_seen_numbers) THEN
        v_destino_pd := jsonb_set(v_destino_pd, '{numero_venda_monde}', to_jsonb(v_origem_numero));
      END IF;
      v_destino_pd := jsonb_set(v_destino_pd, '{numeros_venda_monde_historico}', v_combined_hist);
      UPDATE cards SET produto_data = v_destino_pd, updated_at = NOW() WHERE id = p_destino;
    END IF;

    -- 9. Arquivar origem
    UPDATE cards
       SET archived_at = NOW(), updated_at = NOW(),
           merge_metadata = COALESCE(merge_metadata, '{}'::JSONB) || jsonb_build_object(
             'merged_into_card_id', p_destino,
             'merged_into_titulo', v_destino_titulo,
             'merged_at', NOW(), 'merged_by', v_user_id, 'motivo', p_motivo,
             'migrate_tasks', p_migrate_tasks,
             'migrate_venda_monde', p_migrate_venda_monde,
             'task_ids_filter', to_jsonb(p_task_ids),
             'venda_monde_numbers_filter', to_jsonb(p_venda_monde_numbers),
             'merge_v', 2
           ),
           sub_card_status = CASE WHEN card_type = 'sub_card' THEN 'merged'
                                  ELSE sub_card_status END
     WHERE id = v_origem;

    v_origens_processadas := v_origens_processadas + 1;
    v_origens_titulos := array_append(v_origens_titulos, v_origem_titulo);
  END LOOP;

  -- Recalcular destino
  SELECT COALESCE(SUM(sale_value), 0), COALESCE(SUM(supplier_cost), 0), COUNT(*)
    INTO v_total_venda, v_total_custo, v_item_count
    FROM card_financial_items WHERE card_id = p_destino;

  IF v_item_count > 0 THEN
    UPDATE cards
       SET valor_final = v_total_venda,
           receita = (v_total_venda - v_total_custo),
           receita_source = 'calculated', updated_at = NOW()
     WHERE id = p_destino;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'card_destino_id', p_destino, 'card_destino_titulo', v_destino_titulo,
    'origens_processadas', v_origens_processadas,
    'origens_titulos', to_jsonb(v_origens_titulos),
    'items_moved', v_total_items, 'passengers_moved', v_total_passengers,
    'contatos_moved', v_total_contatos, 'activities_moved', v_total_activities,
    'tasks_moved', v_total_tasks_moved, 'tasks_cancelled', v_total_tasks_cancelled,
    'team_moved', v_total_team, 'attachments_moved', v_total_attachments,
    'venda_monde_numbers_moved', v_total_monde_numbers,
    'destino_valor_final', v_total_venda,
    'destino_receita', CASE WHEN v_item_count > 0 THEN (v_total_venda - v_total_custo) ELSE NULL END,
    'migrate_tasks', p_migrate_tasks, 'migrate_venda_monde', p_migrate_venda_monde
  );
END;
$$;

COMMENT ON FUNCTION fundir_cards_v2 IS
  'Funde N origens em 1 destino. Toggles para tarefas e nº Monde. Aceita arrays opcionais p_task_ids e p_venda_monde_numbers para granularidade. Arquiva origens.';

GRANT EXECUTE ON FUNCTION fundir_cards_v2(UUID[], UUID, BOOLEAN, BOOLEAN, UUID[], TEXT[], TEXT) TO authenticated;

COMMIT;
