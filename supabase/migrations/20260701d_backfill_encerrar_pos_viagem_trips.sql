-- ============================================================================
-- MIGRATION: Backfill — encerrar viagens já realizadas na última etapa de
--            pós-venda (TRIPS). Data: 2026-07-01
--
-- Spec: docs/superpowers/specs/2026-07-01-encerrar-viagem-trips-design.md
--
-- Encerra (ganho_pos=true) os cards TRIPS na ÚLTIMA etapa de pós-venda
-- ("Pós-viagem & Reativação") cuja viagem terminou há 15+ dias.
--   - COM venda real (produtos ativos OU ganho_planner) → consolida como ganho
--     (corrige status travado em 'aberto').
--   - SEM venda real → apenas encerra (ganho_pos=true), status inalterado.
--
-- Alvo fixado no stage id da última etapa de pós-venda do pipeline de produção
-- Welcome Trips (c8022522…): '2c07134a-cb83-4075-bc86-4750beec9393'. É determinístico,
-- casa com a lista auditada (docs/encerrar-viagens-trips-101.csv) e não depende de
-- colunas ausentes em staging defasado. Em staging (stage id inexistente) afeta 0
-- linhas. Idempotente: só afeta quem AINDA não está encerrado.
--
-- Guard enforce_trips_ganho_pos_only_in_pos_viagem satisfeito (etapa é a ordem 5).
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_stage       UUID := '2c07134a-cb83-4075-bc86-4750beec9393';  -- Pós-viagem & Reativação
    v_cut         DATE := CURRENT_DATE - 15;   -- viagem terminou há 15+ dias
    v_consolidado INT := 0;
    v_sem_venda   INT := 0;
BEGIN
    -- (1) COM venda real → consolida como ganho
    WITH alvo AS (
        SELECT c.id
        FROM cards c
        WHERE c.pipeline_stage_id = v_stage
          AND c.archived_at IS NULL
          AND c.deleted_at IS NULL
          AND c.status_comercial IN ('aberto', 'ganho')
          AND COALESCE(c.ganho_pos, false) = false
          AND (c.produto_data -> 'data_exata_da_viagem' ->> 'end') ~ '^\d{4}-\d{2}-\d{2}'
          AND (c.produto_data -> 'data_exata_da_viagem' ->> 'end')::date <= v_cut
          AND (
                EXISTS (SELECT 1 FROM card_financial_items fi
                        WHERE fi.card_id = c.id AND fi.archived_at IS NULL)
                OR COALESCE(c.ganho_planner, false)
              )
    )
    UPDATE cards c SET
        status_comercial = 'ganho',
        ganho_planner    = true,
        ganho_planner_at = COALESCE(c.ganho_planner_at, NOW()),
        ganho_pos        = true,
        ganho_pos_at     = COALESCE(c.ganho_pos_at, NOW()),
        data_fechamento  = COALESCE(c.data_fechamento, CURRENT_DATE),
        updated_at       = NOW()
    FROM alvo
    WHERE c.id = alvo.id;
    GET DIAGNOSTICS v_consolidado = ROW_COUNT;

    -- (2) SEM venda real → apenas encerra
    WITH alvo2 AS (
        SELECT c.id
        FROM cards c
        WHERE c.pipeline_stage_id = v_stage
          AND c.archived_at IS NULL
          AND c.deleted_at IS NULL
          AND c.status_comercial IN ('aberto', 'ganho')
          AND COALESCE(c.ganho_pos, false) = false
          AND (c.produto_data -> 'data_exata_da_viagem' ->> 'end') ~ '^\d{4}-\d{2}-\d{2}'
          AND (c.produto_data -> 'data_exata_da_viagem' ->> 'end')::date <= v_cut
          AND NOT (
                EXISTS (SELECT 1 FROM card_financial_items fi
                        WHERE fi.card_id = c.id AND fi.archived_at IS NULL)
                OR COALESCE(c.ganho_planner, false)
              )
    )
    UPDATE cards c SET
        ganho_pos    = true,
        ganho_pos_at = COALESCE(c.ganho_pos_at, NOW()),
        updated_at   = NOW()
    FROM alvo2
    WHERE c.id = alvo2.id;
    GET DIAGNOSTICS v_sem_venda = ROW_COUNT;

    RAISE NOTICE 'Backfill encerrar viagem (TRIPS): consolidados=%, sem_venda=%, total=%',
        v_consolidado, v_sem_venda, (v_consolidado + v_sem_venda);
END $$;

COMMIT;
