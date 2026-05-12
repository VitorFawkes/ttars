-- ============================================================================
-- Soft-delete duplicatas de reuniao do AC
-- ============================================================================
-- AC tem automacoes que criam 2 tasks identicas (mesmo deal, mesma data,
-- IDs diferentes ~0.5s apart). O fix no integration-process pula a segunda
-- daqui pra frente, mas as ja existentes ficam — backfill.
--
-- Regra: pra cada (card_id, tipo, data_vencimento) com 2+ tarefas AC,
-- mantemos a de menor external_id (criada antes no AC). As outras viram
-- soft-deleted com motivo 'duplicate_ac_meeting'.
-- ============================================================================

WITH duplicate_groups AS (
    SELECT
        card_id,
        tipo,
        data_vencimento,
        MIN(CAST(external_id AS INT)) AS keep_external_id
    FROM public.tarefas
    WHERE external_source = 'active_campaign'
      AND tipo IN ('reuniao','reuniao_video','reuniao_presencial','reuniao_telefone')
      AND deleted_at IS NULL
      AND data_vencimento IS NOT NULL
    GROUP BY card_id, tipo, data_vencimento
    HAVING COUNT(*) > 1
),
to_soft_delete AS (
    SELECT t.id
    FROM public.tarefas t
    JOIN duplicate_groups d
      ON t.card_id = d.card_id
     AND t.tipo = d.tipo
     AND t.data_vencimento = d.data_vencimento
    WHERE t.external_source = 'active_campaign'
      AND t.deleted_at IS NULL
      AND CAST(t.external_id AS INT) <> d.keep_external_id
)
UPDATE public.tarefas
SET deleted_at = NOW(),
    motivo_cancelamento = 'duplicate_ac_meeting'
WHERE id IN (SELECT id FROM to_soft_delete);
