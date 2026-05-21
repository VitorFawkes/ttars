-- ============================================================================
-- BACKFILL: rodar reconcile_card_monde_venda em todos os pares ativos
-- Date: 2026-05-19
--
-- Pré-requisito: migration 20260519c_reconcile_card_monde_venda.sql aplicada.
--
-- Universo (snapshot 2026-05-19): 573 pares (card_ativo, monde_venda_num)
-- envolvendo 378 cards e 544 vendas Monde distintas.
--
-- Resultado esperado:
--   - Pares idênticos arquivo ↔ banco: no-op (is_ready preservado)
--   - Pares com diff cadastral: UPDATE + desmarca is_ready + last_change_summary
--   - Pares com items fantasma (não estão no arquivo): ARCHIVE
--   - Pares com pending_sale ausente: skip (no_pending_sale) — preserva items
--
-- IMPORTANTE: a função reconcile_card_monde_venda já tem early return em card
-- arquivado, então mesmo que alguma linha legacy passe, é safe.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_pair RECORD;
  v_result JSONB;
  v_total_pairs INT := 0;
  v_total_inserted INT := 0;
  v_total_updated INT := 0;
  v_total_archived INT := 0;
  v_total_unchanged INT := 0;
  v_total_cancelled INT := 0;
  v_total_reactivated INT := 0;
  v_total_skipped INT := 0;
  v_skipped_reasons JSONB := '{}'::JSONB;
  v_reason TEXT;
BEGIN
  FOR v_pair IN
    SELECT DISTINCT cfi.card_id, cfi.monde_venda_num
    FROM card_financial_items cfi
    JOIN cards c ON c.id = cfi.card_id
    WHERE cfi.archived_at IS NULL
      AND cfi.monde_venda_num IS NOT NULL
      AND c.archived_at IS NULL
    ORDER BY cfi.card_id, cfi.monde_venda_num
  LOOP
    v_result := reconcile_card_monde_venda(v_pair.card_id, v_pair.monde_venda_num);
    v_total_pairs := v_total_pairs + 1;

    IF (v_result->>'success')::BOOLEAN THEN
      v_total_inserted    := v_total_inserted    + COALESCE((v_result->>'products_inserted')::INT, 0);
      v_total_updated     := v_total_updated     + COALESCE((v_result->>'products_updated')::INT, 0);
      v_total_archived    := v_total_archived    + COALESCE((v_result->>'products_archived')::INT, 0);
      v_total_unchanged   := v_total_unchanged   + COALESCE((v_result->>'products_unchanged')::INT, 0);
      v_total_cancelled   := v_total_cancelled   + COALESCE((v_result->>'products_cancelled')::INT, 0);
      v_total_reactivated := v_total_reactivated + COALESCE((v_result->>'products_reactivated')::INT, 0);
    ELSE
      v_total_skipped := v_total_skipped + 1;
      v_reason := COALESCE(v_result->>'skipped', 'unknown');
      v_skipped_reasons := v_skipped_reasons
        || jsonb_build_object(
             v_reason,
             COALESCE((v_skipped_reasons->>v_reason)::INT, 0) + 1
           );
    END IF;
  END LOOP;

  RAISE NOTICE
    '[backfill_reconcile] pairs=% inserted=% updated=% unchanged=% archived=% cancelled=% reactivated=% skipped=% skipped_reasons=%',
    v_total_pairs, v_total_inserted, v_total_updated, v_total_unchanged,
    v_total_archived, v_total_cancelled, v_total_reactivated,
    v_total_skipped, v_skipped_reasons;
END;
$$;

COMMIT;
