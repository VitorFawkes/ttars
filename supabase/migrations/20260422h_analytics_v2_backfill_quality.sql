-- Analytics v2 — Fase 0 (Backfill: quality_score_pct)
-- Plano: Bloco 8.
--
-- Recalcula quality_score_pct para cards existentes usando a MESMA formula do trigger
-- public.update_quality_score() criado em 20260422g. Triggers nao-Analytics sao
-- desabilitados durante o backfill (session_replication_role=replica) para evitar
-- disparos de webhooks externos, audit_logs excessivos e recalculo de stats de
-- contato por cada linha tocada. O proprio trigger trg_update_quality_score tambem
-- fica desabilitado aqui, mas recalculamos o valor no UPDATE SET — logo o resultado
-- final e identico.
--
-- Volume esperado: ~5K-10K rows. Runtime estimado <5s.

BEGIN;

-- Pula todos os triggers nao-system (inclui webhooks outbound, audit, cadence, etc)
SET LOCAL session_replication_role = 'replica';

UPDATE public.cards c
SET quality_score_pct = (
    CASE WHEN c.pessoa_principal_id IS NOT NULL THEN 20 ELSE 0 END +
    CASE WHEN c.origem IS NOT NULL AND c.origem <> '' THEN 10 ELSE 0 END +
    CASE WHEN (c.valor_final    IS NOT NULL AND c.valor_final    > 0)
           OR (c.valor_estimado IS NOT NULL AND c.valor_estimado > 0) THEN 20 ELSE 0 END +
    CASE WHEN c.data_viagem_inicio IS NOT NULL
           OR c.epoca_ano          IS NOT NULL
           OR c.epoca_tipo         IS NOT NULL THEN 15 ELSE 0 END +
    CASE WHEN jsonb_typeof(c.produto_data->'destinos') = 'array'
          AND jsonb_array_length(c.produto_data->'destinos') > 0 THEN 15 ELSE 0 END +
    CASE WHEN (c.briefing_inicial IS NOT NULL
                AND c.briefing_inicial <> '{}'::jsonb
                AND c.briefing_inicial <> 'null'::jsonb)
           OR (c.produto_data->>'observacoes_criticas' IS NOT NULL
                AND length(trim(c.produto_data->>'observacoes_criticas')) > 50) THEN 10 ELSE 0 END +
    CASE WHEN c.dono_atual_id IS NOT NULL THEN 10 ELSE 0 END
)
WHERE c.deleted_at IS NULL
  AND c.quality_score_pct IS NULL;

-- Sanity: nenhum card ativo pode ter quality_score NULL
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT count(*) INTO v_null_count
    FROM public.cards
   WHERE deleted_at IS NULL AND quality_score_pct IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % cards ativos com quality_score_pct NULL', v_null_count;
  END IF;
END $$;

COMMIT;
