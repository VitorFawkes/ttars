-- ============================================================
-- Fase 2: RPCs especializadas para análise de funil
-- ============================================================
-- report_funnel_flow: Visão completa do funil com conversão
-- report_stage_cohort: Cohort de uma etapa específica
-- ============================================================

-- ============================================================
-- 2.1 report_funnel_flow
-- ============================================================
CREATE OR REPLACE FUNCTION report_funnel_flow(
    p_date_start  TIMESTAMPTZ,
    p_date_end    TIMESTAMPTZ,
    p_product     TEXT DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stages JSONB := '[]'::jsonb;
    v_summary JSONB;
    v_loss_reasons JSONB;
    v_stage RECORD;
    v_stage_data JSONB;
    v_entries BIGINT;
    v_exits_to JSONB;
    v_still_here BIGINT;
    v_advanced BIGINT;
    v_lost BIGINT;
    v_avg_days NUMERIC;
    v_total_first_stage BIGINT := 0;
    v_total_won BIGINT := 0;
    v_total_lost BIGINT := 0;
    v_total_still BIGINT := 0;
    v_is_first_stage BOOLEAN;
    v_stage_idx INT := 0;
BEGIN
    -- Iterar por todas as etapas ativas, ordenadas por fase + ordem
    FOR v_stage IN
        SELECT
            ps.id AS stage_id,
            ps.nome AS stage_name,
            pp.label AS phase_name,
            pp.slug AS phase_slug,
            pp.order_index,
            ps.ordem,
            ps.is_won,
            ps.is_lost
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.ativo = true
          AND pp.active = true
          AND ps.is_lost = false  -- Excluir "Fechado - Perdido" das barras do funil
        ORDER BY pp.order_index ASC, ps.ordem ASC
    LOOP
        v_stage_idx := v_stage_idx + 1;
        v_is_first_stage := (v_stage_idx = 1);

        -- Contar ENTRADAS no período:
        -- 1. Cards que chegaram via movimentação (historico_fases)
        -- 2. Para primeira etapa: incluir cards CRIADOS diretamente no período
        SELECT COUNT(DISTINCT sub.card_id) INTO v_entries
        FROM (
            -- Cards movidos PARA esta etapa no período
            SELECT hf.card_id
            FROM historico_fases hf
            JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
            WHERE hf.etapa_nova_id = v_stage.stage_id
              AND hf.data_mudanca >= p_date_start
              AND hf.data_mudanca < p_date_end
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)

            UNION

            -- Cards CRIADOS diretamente nesta etapa no período (só primeira etapa)
            SELECT c.id AS card_id
            FROM cards c
            WHERE v_is_first_stage
              AND c.pipeline_stage_id = v_stage.stage_id
              AND c.created_at >= p_date_start
              AND c.created_at < p_date_end
              AND c.deleted_at IS NULL
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
              -- Excluir cards que têm historico de entrada (já contados acima)
              AND NOT EXISTS (
                  SELECT 1 FROM historico_fases hf2
                  WHERE hf2.card_id = c.id
                    AND hf2.etapa_nova_id = v_stage.stage_id
                    AND hf2.data_mudanca >= p_date_start
                    AND hf2.data_mudanca < p_date_end
              )
        ) sub;

        -- Para cada card que ENTROU, determinar destino:
        -- Buscar o PRÓXIMO registro em historico_fases após a entrada
        WITH entered_cards AS (
            SELECT hf.card_id, hf.data_mudanca AS entry_date
            FROM historico_fases hf
            JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
            WHERE hf.etapa_nova_id = v_stage.stage_id
              AND hf.data_mudanca >= p_date_start
              AND hf.data_mudanca < p_date_end
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)

            UNION

            SELECT c.id AS card_id, c.created_at AS entry_date
            FROM cards c
            WHERE v_is_first_stage
              AND c.pipeline_stage_id = v_stage.stage_id
              AND c.created_at >= p_date_start
              AND c.created_at < p_date_end
              AND c.deleted_at IS NULL
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
              AND NOT EXISTS (
                  SELECT 1 FROM historico_fases hf2
                  WHERE hf2.card_id = c.id
                    AND hf2.etapa_nova_id = v_stage.stage_id
                    AND hf2.data_mudanca >= p_date_start
                    AND hf2.data_mudanca < p_date_end
              )
        ),
        next_moves AS (
            SELECT DISTINCT ON (ec.card_id)
                ec.card_id,
                ec.entry_date,
                hf_next.etapa_nova_id AS next_stage_id,
                hf_next.data_mudanca AS exit_date,
                ps_next.nome AS next_stage_name,
                ps_next.is_lost AS next_is_lost
            FROM entered_cards ec
            LEFT JOIN LATERAL (
                SELECT hf2.etapa_nova_id, hf2.data_mudanca
                FROM historico_fases hf2
                WHERE hf2.card_id = ec.card_id
                  AND hf2.etapa_anterior_id = v_stage.stage_id
                  AND hf2.data_mudanca > ec.entry_date
                ORDER BY hf2.data_mudanca ASC
                LIMIT 1
            ) hf_next ON true
            LEFT JOIN pipeline_stages ps_next ON ps_next.id = hf_next.etapa_nova_id
        )
        SELECT
            COALESCE(SUM(CASE WHEN nm.next_stage_id IS NULL AND c.pipeline_stage_id = v_stage.stage_id THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN nm.next_stage_id IS NOT NULL AND nm.next_is_lost = false THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE
                WHEN nm.next_is_lost = true THEN 1
                WHEN nm.next_stage_id IS NULL AND c.status_comercial = 'perdido' THEN 1
                ELSE 0
            END), 0)
        INTO v_still_here, v_advanced, v_lost
        FROM next_moves nm
        JOIN cards c ON c.id = nm.card_id;

        -- Exits breakdown (para onde foram)
        WITH entered_cards AS (
            SELECT hf.card_id, hf.data_mudanca AS entry_date
            FROM historico_fases hf
            JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
            WHERE hf.etapa_nova_id = v_stage.stage_id
              AND hf.data_mudanca >= p_date_start
              AND hf.data_mudanca < p_date_end
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)

            UNION

            SELECT c.id AS card_id, c.created_at AS entry_date
            FROM cards c
            WHERE v_is_first_stage
              AND c.pipeline_stage_id = v_stage.stage_id
              AND c.created_at >= p_date_start
              AND c.created_at < p_date_end
              AND c.deleted_at IS NULL
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
              AND NOT EXISTS (
                  SELECT 1 FROM historico_fases hf2
                  WHERE hf2.card_id = c.id
                    AND hf2.etapa_nova_id = v_stage.stage_id
                    AND hf2.data_mudanca >= p_date_start
                    AND hf2.data_mudanca < p_date_end
              )
        ),
        exits AS (
            SELECT DISTINCT ON (ec.card_id)
                ps_next.nome AS stage_name,
                ps_next.is_lost
            FROM entered_cards ec
            JOIN LATERAL (
                SELECT hf2.etapa_nova_id, hf2.data_mudanca
                FROM historico_fases hf2
                WHERE hf2.card_id = ec.card_id
                  AND hf2.etapa_anterior_id = v_stage.stage_id
                  AND hf2.data_mudanca > ec.entry_date
                ORDER BY hf2.data_mudanca ASC
                LIMIT 1
            ) hf_next ON true
            JOIN pipeline_stages ps_next ON ps_next.id = hf_next.etapa_nova_id
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'stage_name', sub.stage_name,
            'count', sub.cnt
        ) ORDER BY sub.cnt DESC), '[]'::jsonb)
        INTO v_exits_to
        FROM (
            SELECT stage_name, COUNT(*) AS cnt
            FROM exits
            GROUP BY stage_name
        ) sub;

        -- Tempo médio na etapa (dias)
        SELECT ROUND(AVG(
            EXTRACT(EPOCH FROM (hf_next.data_mudanca - ec_inner.entry_date)) / 86400.0
        )::numeric, 1)
        INTO v_avg_days
        FROM (
            SELECT hf.card_id, hf.data_mudanca AS entry_date
            FROM historico_fases hf
            JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
            WHERE hf.etapa_nova_id = v_stage.stage_id
              AND hf.data_mudanca >= p_date_start
              AND hf.data_mudanca < p_date_end
              AND (p_product IS NULL OR c.produto::text = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ) ec_inner
        JOIN LATERAL (
            SELECT hf2.data_mudanca
            FROM historico_fases hf2
            WHERE hf2.card_id = ec_inner.card_id
              AND hf2.etapa_anterior_id = v_stage.stage_id
              AND hf2.data_mudanca > ec_inner.entry_date
            ORDER BY hf2.data_mudanca ASC
            LIMIT 1
        ) hf_next ON true;

        -- Acumular totais
        IF v_is_first_stage THEN
            v_total_first_stage := v_entries;
        END IF;
        IF v_stage.is_won THEN
            v_total_won := v_total_won + v_entries;
        END IF;
        v_total_lost := v_total_lost + v_lost;
        v_total_still := v_total_still + v_still_here;

        -- Montar JSON da etapa
        v_stage_data := jsonb_build_object(
            'stage_id', v_stage.stage_id,
            'stage_name', v_stage.stage_name,
            'phase_name', v_stage.phase_name,
            'phase_slug', v_stage.phase_slug,
            'order_global', v_stage_idx,
            'entries', v_entries,
            'still_here', v_still_here,
            'advanced', v_advanced,
            'lost', v_lost,
            'conversion_pct', CASE WHEN v_entries > 0
                THEN ROUND((v_advanced::numeric / v_entries) * 100, 1)
                ELSE 0 END,
            'avg_days', COALESCE(v_avg_days, 0),
            'exits_to', v_exits_to
        );

        v_stages := v_stages || v_stage_data;
    END LOOP;

    -- Motivos de perda globais no período
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'reason', sub.reason,
        'count', sub.cnt
    ) ORDER BY sub.cnt DESC), '[]'::jsonb)
    INTO v_loss_reasons
    FROM (
        SELECT
            COALESCE(mp.nome, 'Não informado') AS reason,
            COUNT(*) AS cnt
        FROM historico_fases hf
        JOIN pipeline_stages ps_lost ON ps_lost.id = hf.etapa_nova_id AND ps_lost.is_lost = true
        JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
        LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
        WHERE hf.data_mudanca >= p_date_start
          AND hf.data_mudanca < p_date_end
          AND (p_product IS NULL OR c.produto::text = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        GROUP BY COALESCE(mp.nome, 'Não informado')
    ) sub;

    -- Summary
    v_summary := jsonb_build_object(
        'total_entries_first_stage', v_total_first_stage,
        'total_won', v_total_won,
        'total_lost', v_total_lost,
        'still_in_pipeline', v_total_still,
        'overall_conversion_pct', CASE WHEN v_total_first_stage > 0
            THEN ROUND((v_total_won::numeric / v_total_first_stage) * 100, 1)
            ELSE 0 END
    );

    RETURN jsonb_build_object(
        'stages', v_stages,
        'summary', v_summary,
        'loss_reasons', v_loss_reasons
    );
END;
$$;

-- ============================================================
-- 2.2 report_stage_cohort
-- ============================================================
CREATE OR REPLACE FUNCTION report_stage_cohort(
    p_stage_id    UUID,
    p_date_start  TIMESTAMPTZ,
    p_date_end    TIMESTAMPTZ,
    p_product     TEXT DEFAULT NULL,
    p_owner_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stage_name TEXT;
    v_phase_name TEXT;
    v_total_entered BIGINT;
    v_still_here BIGINT;
    v_advanced_total BIGINT;
    v_lost_total BIGINT;
    v_advanced_to JSONB;
    v_lost_reasons JSONB;
    v_time_stats JSONB;
BEGIN
    -- Pegar nome da etapa
    SELECT ps.nome, pp.label
    INTO v_stage_name, v_phase_name
    FROM pipeline_stages ps
    LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
    WHERE ps.id = p_stage_id;

    IF v_stage_name IS NULL THEN
        RETURN jsonb_build_object('error', 'Etapa não encontrada');
    END IF;

    -- Cards que ENTRARAM nesta etapa no período
    CREATE TEMP TABLE _cohort_cards ON COMMIT DROP AS
    SELECT DISTINCT ON (sub.card_id) sub.card_id, sub.entry_date
    FROM (
        -- Via historico_fases
        SELECT hf.card_id, hf.data_mudanca AS entry_date
        FROM historico_fases hf
        JOIN cards c ON c.id = hf.card_id AND c.deleted_at IS NULL
        WHERE hf.etapa_nova_id = p_stage_id
          AND hf.data_mudanca >= p_date_start
          AND hf.data_mudanca < p_date_end
          AND (p_product IS NULL OR c.produto::text = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)

        UNION ALL

        -- Cards criados diretamente nesta etapa (sem historico de entrada)
        SELECT c.id, c.created_at
        FROM cards c
        WHERE c.pipeline_stage_id = p_stage_id
          AND c.created_at >= p_date_start
          AND c.created_at < p_date_end
          AND c.deleted_at IS NULL
          AND (p_product IS NULL OR c.produto::text = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
          AND NOT EXISTS (
              SELECT 1 FROM historico_fases hf2
              WHERE hf2.card_id = c.id
                AND hf2.etapa_nova_id = p_stage_id
                AND hf2.data_mudanca >= p_date_start
                AND hf2.data_mudanca < p_date_end
          )
    ) sub
    ORDER BY sub.card_id, sub.entry_date ASC;

    SELECT COUNT(*) INTO v_total_entered FROM _cohort_cards;

    -- Para cada card, buscar próximo destino
    CREATE TEMP TABLE _cohort_outcomes ON COMMIT DROP AS
    SELECT
        cc.card_id,
        cc.entry_date,
        hf_next.etapa_nova_id AS next_stage_id,
        hf_next.data_mudanca AS exit_date,
        ps_next.nome AS next_stage_name,
        ps_next.is_lost AS next_is_lost,
        c.pipeline_stage_id AS current_stage_id,
        c.status_comercial,
        c.motivo_perda_id
    FROM _cohort_cards cc
    LEFT JOIN LATERAL (
        SELECT hf2.etapa_nova_id, hf2.data_mudanca
        FROM historico_fases hf2
        WHERE hf2.card_id = cc.card_id
          AND hf2.etapa_anterior_id = p_stage_id
          AND hf2.data_mudanca > cc.entry_date
        ORDER BY hf2.data_mudanca ASC
        LIMIT 1
    ) hf_next ON true
    LEFT JOIN pipeline_stages ps_next ON ps_next.id = hf_next.etapa_nova_id
    JOIN cards c ON c.id = cc.card_id;

    -- Contar status
    SELECT
        COUNT(*) FILTER (WHERE next_stage_id IS NULL AND current_stage_id = p_stage_id AND status_comercial != 'perdido'),
        COUNT(*) FILTER (WHERE next_stage_id IS NOT NULL AND next_is_lost = false),
        COUNT(*) FILTER (WHERE next_is_lost = true OR (next_stage_id IS NULL AND status_comercial = 'perdido'))
    INTO v_still_here, v_advanced_total, v_lost_total
    FROM _cohort_outcomes;

    -- Avançaram para (breakdown)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'stage_name', sub.next_stage_name,
        'count', sub.cnt,
        'pct', ROUND((sub.cnt::numeric / NULLIF(v_total_entered, 0)) * 100, 1),
        'avg_days_to_advance', sub.avg_days
    ) ORDER BY sub.cnt DESC), '[]'::jsonb)
    INTO v_advanced_to
    FROM (
        SELECT
            co.next_stage_name,
            COUNT(*) AS cnt,
            ROUND(AVG(EXTRACT(EPOCH FROM (co.exit_date - co.entry_date)) / 86400.0)::numeric, 1) AS avg_days
        FROM _cohort_outcomes co
        WHERE co.next_stage_id IS NOT NULL
          AND co.next_is_lost = false
        GROUP BY co.next_stage_name
    ) sub;

    -- Motivos de perda
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'reason', sub.reason,
        'count', sub.cnt
    ) ORDER BY sub.cnt DESC), '[]'::jsonb)
    INTO v_lost_reasons
    FROM (
        SELECT
            COALESCE(mp.nome, 'Não informado') AS reason,
            COUNT(*) AS cnt
        FROM _cohort_outcomes co
        LEFT JOIN motivos_perda mp ON mp.id = co.motivo_perda_id
        WHERE co.next_is_lost = true
           OR (co.next_stage_id IS NULL AND co.status_comercial = 'perdido')
        GROUP BY COALESCE(mp.nome, 'Não informado')
    ) sub;

    -- Distribuição de tempo
    SELECT jsonb_build_object(
        'avg_days', COALESCE(ROUND(AVG(days)::numeric, 1), 0),
        'median_days', COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days)::numeric, 1), 0),
        'p90_days', COALESCE(ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY days)::numeric, 1), 0)
    )
    INTO v_time_stats
    FROM (
        SELECT EXTRACT(EPOCH FROM (co.exit_date - co.entry_date)) / 86400.0 AS days
        FROM _cohort_outcomes co
        WHERE co.exit_date IS NOT NULL
    ) sub;

    RETURN jsonb_build_object(
        'stage_name', v_stage_name,
        'phase_name', v_phase_name,
        'total_entered', v_total_entered,
        'current_status', jsonb_build_object(
            'still_here', v_still_here,
            'advanced_total', v_advanced_total,
            'lost_total', v_lost_total
        ),
        'advanced_to', v_advanced_to,
        'lost_from_here', v_lost_reasons,
        'time_in_stage', COALESCE(v_time_stats, '{"avg_days":0,"median_days":0,"p90_days":0}'::jsonb)
    );
END;
$$;
