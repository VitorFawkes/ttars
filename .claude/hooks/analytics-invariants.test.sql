-- ============================================================================
-- ANALYTICS-WEDDINGS INVARIANTS TEST SUITE
--
-- Testa 4 invariantes críticas que pegam ~70% dos bugs já vistos:
--   1. Monotonicidade do funil   (ganho <= fez_closer <= marcou_closer <= fez_sdr <= marcou_sdr)
--   2. Isolamento TRIPS/WEDDING  (cards WEDDING em orgs WW, não TRIPS, e vice-versa)
--   3. Paridade entre RPCs       (overview/journey/drift cohort 12m batem)
--   4. Cobertura mínima sdr_canal (>= 80% dos ganhos têm canal SDR preenchido)
--
-- Roda em transação BEGIN/ROLLBACK (read-only). Roda contra produção sem efeito.
-- Se algum teste falhar, RAISE EXCEPTION aborta a transação e o runner
-- detecta via parsing da resposta.
--
-- Uso: bash .claude/hooks/test-analytics-invariants.sh [prod|staging]
-- ============================================================================

BEGIN;

DO $body$
DECLARE
    -- Invariant 1: Monotonicidade
    v_mono_violations INT;
    v_mono_detail TEXT;

    -- Invariant 2: Isolamento TRIPS x WEDDING
    v_isol_wedding_in_trips INT;
    v_isol_trips_in_wedding INT;

    -- Invariant 3: Paridade RPCs (cohort 12m)
    v_ww_org_id UUID;
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
    v_overview_leads INT; v_overview_fech INT;
    v_funil_entrou INT; v_funil_ganho INT;
    v_journey_entrou INT; v_journey_ganho INT;
    v_drift_leads INT; v_drift_fech INT;

    -- Invariant 4: Cobertura mínima sdr_canal nos ganhos
    v_total_ganhos INT;
    v_ganhos_com_canal INT;
    v_cobertura_pct NUMERIC;
    v_failures TEXT[] := ARRAY[]::TEXT[];
BEGIN

    -- ── INVARIANT 1: Monotonicidade do funil (TENDÊNCIA, não regra estrita) ───
    -- IMPORTANTE: alguns casos quebram a monotonicidade por motivos LEGÍTIMOS:
    --   - Casal ganhou sem closer marcar "Como foi feita Reunião Closer" (field 299 da AC
    --     é opcional e foi adicionado depois de muitos casamentos terem ganhado)
    --   - Lead foi DIRETO pro Closer sem passar pelo SDR (caso comum quando vem qualificado
    --     via indicação ou conversa com Welcome Group)
    -- Baseline atual (~maio/2026): ~304 violações em 2258 deals = 13%.
    -- Threshold definido pra pegar REGRESSÃO (salto brusco), não baseline operacional.
    SELECT
        SUM(CASE WHEN (ganho AND NOT fez_closer)
                  OR (fez_closer AND NOT marcou_closer)
                  OR (marcou_closer AND NOT fez_sdr)
                  OR (fez_sdr AND NOT marcou_sdr) THEN 1 ELSE 0 END)
    INTO v_mono_violations
    FROM vw_ww_funnel_base;

    -- Threshold = 500 (~65% acima do baseline 304). Acima disso indica regressão:
    -- - Sync quebrou e parou de preencher fez_sdr
    -- - Campo da AC mudou de formato
    -- - Pipeline migrou e novos deals não estão sendo classificados certo
    IF v_mono_violations > 500 THEN
        v_failures := v_failures || format(
            'INVARIANT 1 (monotonicidade): %s violacoes (baseline ~304, limite 500). Salto brusco indica regressao no funil.',
            v_mono_violations
        );
    END IF;

    -- ── INVARIANT 2: Isolamento TRIPS x WEDDING ───────────────────────────────
    -- Cards com produto=WEDDING não podem estar em orgs Trips, e vice-versa.
    -- Welcome Trips slug = 'welcome-trips', Welcome Weddings slug = 'welcome-weddings'.
    SELECT COUNT(*) INTO v_isol_wedding_in_trips
      FROM cards c
      JOIN organizations o ON o.id = c.org_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING'
       AND o.slug = 'welcome-trips';

    SELECT COUNT(*) INTO v_isol_trips_in_wedding
      FROM cards c
      JOIN organizations o ON o.id = c.org_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'TRIPS'
       AND o.slug = 'welcome-weddings';

    IF v_isol_wedding_in_trips > 0 THEN
        v_failures := v_failures || format(
            'INVARIANT 2a (isolamento): %s cards WEDDING em org welcome-trips. Vazamento entre produtos!',
            v_isol_wedding_in_trips
        );
    END IF;

    IF v_isol_trips_in_wedding > 0 THEN
        v_failures := v_failures || format(
            'INVARIANT 2b (isolamento): %s cards TRIPS em org welcome-weddings. Vazamento entre produtos!',
            v_isol_trips_in_wedding
        );
    END IF;

    -- ── INVARIANT 3: Paridade entre RPCs (cohort 12m fechado) ─────────────────
    -- v2 (20260612a): a Visão geral passou a contar por CASAL (ww_funil_casal, mesma régua
    -- do drill ww_drill_casais — "número clicado = lista aberta", pedido do Vitor 12/06).
    -- Logo a paridade agora é em DOIS universos:
    --   a) overview ≡ ww_funil_conversao_v1 (casal): leads/fechados batem com o funil.
    --   b) journey ≡ drift_venda (deal/vw): seguem deal-level e batem entre si.
    SELECT id INTO v_ww_org_id FROM organizations WHERE slug = 'welcome-weddings' LIMIT 1;
    IF v_ww_org_id IS NULL THEN
        v_failures := v_failures || 'INVARIANT 3 (paridade): org welcome-weddings nao encontrada — setup quebrado.';
    ELSE
        v_period_start := '2025-05-28'::timestamptz;
        v_period_end := '2026-05-28 23:59:59'::timestamptz;

        SELECT (((ww2_overview(v_period_start, v_period_end, 'cohort', v_ww_org_id, NULL,NULL,NULL,NULL,NULL))::jsonb)->'kpis'->>'leads')::int,
               (((ww2_overview(v_period_start, v_period_end, 'cohort', v_ww_org_id, NULL,NULL,NULL,NULL,NULL))::jsonb)->'kpis'->>'fechados')::int
          INTO v_overview_leads, v_overview_fech;

        -- (a) universo CASAL: funil v1 tem que bater com o overview
        SELECT (((ww_funil_conversao_v1(v_period_start, v_period_end, 'cohort', v_ww_org_id))::jsonb)->'baseline'->>'entrou')::int,
               (((ww_funil_conversao_v1(v_period_start, v_period_end, 'cohort', v_ww_org_id))::jsonb)->'baseline'->>'ganho')::int
          INTO v_funil_entrou, v_funil_ganho;

        IF ABS(v_overview_leads - v_funil_entrou) > 1
           OR ABS(v_overview_fech - v_funil_ganho) > 1 THEN
            v_failures := v_failures || format(
                'INVARIANT 3a (paridade CASAL cohort 12m): overview leads=%s/fech=%s vs funil v1 entrou=%s/ganho=%s. Overview e funil/drill divergiram — verificar ww_funil_casal.',
                v_overview_leads, v_overview_fech, v_funil_entrou, v_funil_ganho
            );
        END IF;

        -- (b) universo DEAL: journey e drift continuam batendo entre si
        SELECT (((ww2_journey(v_period_start, v_period_end, 'cohort', v_ww_org_id, NULL,NULL,NULL,NULL,NULL))::jsonb)->'funil_real'->0->>'cards')::int,
               (((ww2_journey(v_period_start, v_period_end, 'cohort', v_ww_org_id, NULL,NULL,NULL,NULL,NULL))::jsonb)->'funil_real'->5->>'cards')::int
          INTO v_journey_entrou, v_journey_ganho;

        SELECT (((ww_v2_drift_venda(v_period_start, v_period_end, v_ww_org_id, NULL, 'cohort', NULL))::jsonb)->>'total_leads')::int,
               (((ww_v2_drift_venda(v_period_start, v_period_end, v_ww_org_id, NULL, 'cohort', NULL))::jsonb)->>'total_fechados')::int
          INTO v_drift_leads, v_drift_fech;

        IF ABS(v_journey_entrou - v_drift_leads) > 1
           OR ABS(v_journey_ganho - v_drift_fech) > 1 THEN
            v_failures := v_failures || format(
                'INVARIANT 3b (paridade DEAL cohort 12m): journey entrou=%s/ganho=%s vs drift leads=%s/fech=%s. Universos deal-level divergentes — verificar vw_ww_funnel_base.',
                v_journey_entrou, v_journey_ganho, v_drift_leads, v_drift_fech
            );
        END IF;
    END IF;

    -- ── INVARIANT 4: Cobertura mínima sdr_canal nos ganhos ────────────────────
    -- Se sdr_canal está vazio em >20% dos ganhos, sync provavelmente está
    -- quebrado ou um campo da AC mudou de formato.
    SELECT
        COUNT(*) FILTER (WHERE ganho_at IS NOT NULL),
        COUNT(*) FILTER (WHERE ganho_at IS NOT NULL AND sdr_canal IS NOT NULL AND array_length(sdr_canal, 1) > 0)
    INTO v_total_ganhos, v_ganhos_com_canal
    FROM ww_ac_deal_funnel_cache
    WHERE is_ww;

    IF v_total_ganhos > 0 THEN
        v_cobertura_pct := 100.0 * v_ganhos_com_canal / v_total_ganhos;
        IF v_cobertura_pct < 80.0 THEN
            v_failures := v_failures || format(
                'INVARIANT 4 (cobertura sdr_canal): %s%% dos ganhos têm canal SDR (limite 80%%). Possível regressão no sync (%s de %s).',
                ROUND(v_cobertura_pct, 1), v_ganhos_com_canal, v_total_ganhos
            );
        END IF;
    END IF;

    -- ── REPORT ────────────────────────────────────────────────────────────────
    IF array_length(v_failures, 1) > 0 THEN
        RAISE EXCEPTION 'ANALYTICS_INVARIANTS_FAILED: % | %',
            array_length(v_failures, 1),
            array_to_string(v_failures, ' || ');
    END IF;

    RAISE NOTICE 'Analytics invariantes OK: monotonicidade=%; isolamento WW=%s TRIPS=%s; paridade leads=%s fech=%s; cobertura sdr_canal=%s%%',
        v_mono_violations,
        v_isol_wedding_in_trips,
        v_isol_trips_in_wedding,
        COALESCE(v_overview_leads::text, 'n/a'),
        COALESCE(v_overview_fech::text, 'n/a'),
        COALESCE(ROUND(v_cobertura_pct, 1)::text, 'n/a');
END $body$;

ROLLBACK;
