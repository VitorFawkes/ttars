-- ============================================================
-- Drill-Down Source-Aware: cada view usa a MESMA lógica de
-- filtragem do gráfico pai (como HubSpot/Salesforce).
--
-- Novo parâmetro: p_drill_source TEXT
-- Sources: default, stage_entries, closed_deals, current_stage,
--          lost_deals, macro_funnel
--
-- Também adiciona planner_id ao analytics_operations_summary.
-- ============================================================

-- ── 1. Drop all overloads of drill_down_cards ──────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
             WHERE proname = 'analytics_drill_down_cards' AND pronamespace = 'public'::regnamespace
    LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $$;

-- ── 2. Recreate with p_drill_source ────────────────────────
CREATE OR REPLACE FUNCTION analytics_drill_down_cards(
    -- Filtros globais
    p_date_start   TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end     TIMESTAMPTZ DEFAULT NOW(),
    p_product      TEXT DEFAULT NULL,
    p_mode         TEXT DEFAULT 'entries',
    p_global_stage_id UUID DEFAULT NULL,
    p_global_owner_id UUID DEFAULT NULL,
    -- Contexto do drill-down
    p_drill_stage_id    UUID DEFAULT NULL,
    p_drill_owner_id    UUID DEFAULT NULL,
    p_drill_loss_reason TEXT DEFAULT NULL,
    p_drill_status      TEXT DEFAULT NULL,
    p_drill_phase       TEXT DEFAULT NULL,
    p_drill_period_start TIMESTAMPTZ DEFAULT NULL,
    p_drill_period_end   TIMESTAMPTZ DEFAULT NULL,
    -- Source (NOVO) — qual lógica de agregação espelhar
    p_drill_source TEXT DEFAULT 'default',
    -- Paginação
    p_sort_by  TEXT DEFAULT 'created_at',
    p_sort_dir TEXT DEFAULT 'desc',
    p_limit    INT DEFAULT 50,
    p_offset   INT DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    titulo TEXT,
    produto TEXT,
    status_comercial TEXT,
    etapa_nome TEXT,
    fase TEXT,
    dono_atual_nome TEXT,
    valor_display NUMERIC,
    receita NUMERIC,
    created_at TIMESTAMPTZ,
    data_fechamento TIMESTAMPTZ,
    pessoa_nome TEXT,
    pessoa_telefone TEXT,
    total_count BIGINT,
    stage_entered_at TIMESTAMPTZ  -- NOVO: para SLA sorting
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_query TEXT;
    v_where TEXT := '';
    v_order TEXT;
    v_source TEXT := COALESCE(p_drill_source, 'default');
BEGIN
    -- =======================================================
    -- Filtros globais (comuns a todos os sources)
    -- =======================================================

    -- Produto
    IF p_product IS NOT NULL THEN
        v_where := v_where || format(' AND c.produto::TEXT = %L', p_product);
    END IF;

    -- Owner global (multi-select compat)
    IF p_global_owner_id IS NOT NULL THEN
        v_where := v_where || format(' AND c.dono_atual_id = %L', p_global_owner_id);
    END IF;

    -- =======================================================
    -- Lógica por SOURCE (cada source espelha uma view)
    -- =======================================================

    IF v_source = 'stage_entries' THEN
        -- ───────────────────────────────────────────────────
        -- STAGE ENTRIES: espelha analytics_funnel_live CTE
        -- Cards que ENTRARAM na etapa drill_stage_id no período
        -- via activities (stage_changed) OU criação
        -- ───────────────────────────────────────────────────
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id
                    FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND a.created_at >= %L AND a.created_at < %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id
                    FROM cards c3
                    WHERE c3.created_at >= %L AND c3.created_at < %L
                      AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID
                           FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id,
                p_date_start, p_date_end,
                p_date_start, p_date_end,
                p_drill_stage_id
            );
        ELSE
            -- Sem stage, usar date filter padrão entries
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Owner do drill (ex: stacked bar por owner)
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSIF v_source = 'closed_deals' THEN
        -- ───────────────────────────────────────────────────
        -- CLOSED DEALS: espelha analytics_financial_breakdown
        -- Cards ganhos com data_fechamento no período
        -- ───────────────────────────────────────────────────
        v_where := v_where || ' AND c.status_comercial = ''ganho''';
        v_where := v_where || ' AND c.data_fechamento IS NOT NULL';
        v_where := v_where || format(
            ' AND c.data_fechamento >= %L AND c.data_fechamento <= %L',
            p_date_start, p_date_end
        );

        -- Owner via vendas_owner_id (planners) OU dono_atual_id
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND (c.vendas_owner_id = %L OR c.dono_atual_id = %L)',
                p_drill_owner_id, p_drill_owner_id
            );
        END IF;

    ELSIF v_source = 'current_stage' THEN
        -- ───────────────────────────────────────────────────
        -- CURRENT STAGE: espelha analytics_sla_summary
        -- Cards ativos (não terminais) atualmente na etapa
        -- ───────────────────────────────────────────────────
        v_where := v_where || ' AND c.status_comercial NOT IN (''ganho'', ''perdido'')';

        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;

        -- Population filter por mode (mesma lógica dos outros RPCs)
        IF p_mode = 'stage_entry' AND p_global_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(%L, %L, %L, %L))',
                p_global_stage_id, p_date_start, p_date_end, p_product
            );
        ELSIF p_mode = 'ganho_sdr' THEN
            v_where := v_where || format(
                ' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_planner' THEN
            v_where := v_where || format(
                ' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_total' THEN
            v_where := v_where || format(
                ' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L',
                p_date_start, p_date_end
            );
        ELSE
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

    ELSIF v_source = 'lost_deals' THEN
        -- ───────────────────────────────────────────────────
        -- LOST DEALS: espelha analytics_loss_reasons
        -- Cards perdidos, filtrados por motivo de perda
        -- ───────────────────────────────────────────────────
        v_where := v_where || ' AND c.status_comercial = ''perdido''';

        -- Loss reason
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND COALESCE(mp.nome, ''Sem motivo informado'') = %L', p_drill_loss_reason);
        END IF;

        -- Date filter por mode (mesma lógica dos outros RPCs)
        IF p_mode = 'stage_entry' AND p_global_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(%L, %L, %L, %L))',
                p_global_stage_id, p_date_start, p_date_end, p_product
            );
        ELSIF p_mode = 'ganho_sdr' THEN
            v_where := v_where || format(
                ' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_planner' THEN
            v_where := v_where || format(
                ' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_total' THEN
            v_where := v_where || format(
                ' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L',
                p_date_start, p_date_end
            );
        ELSE
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

    ELSIF v_source = 'macro_funnel' THEN
        -- ───────────────────────────────────────────────────
        -- MACRO FUNNEL: cards que ENTRARAM em qualquer etapa
        -- da fase no período (espelha funnel_live entries)
        -- ───────────────────────────────────────────────────
        IF p_drill_phase IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT sub.cid FROM (
                        SELECT a.card_id AS cid
                        FROM activities a
                        JOIN cards c2 ON c2.id = a.card_id
                        WHERE a.tipo = ''stage_changed''
                          AND (a.metadata->>''new_stage_id'')::UUID IN (
                              SELECT ps2.id FROM pipeline_stages ps2
                              JOIN pipeline_phases pp2 ON pp2.id = ps2.phase_id
                              WHERE pp2.slug = %L
                          )
                          AND a.created_at >= %L AND a.created_at < %L
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid
                        FROM cards c3
                        WHERE c3.created_at >= %L AND c3.created_at < %L
                          AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                          AND COALESCE(
                              (SELECT (a2.metadata->>''old_stage_id'')::UUID
                               FROM activities a2 WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                               ORDER BY a2.created_at ASC LIMIT 1),
                              c3.pipeline_stage_id
                          ) IN (
                              SELECT ps3.id FROM pipeline_stages ps3
                              JOIN pipeline_phases pp3 ON pp3.id = ps3.phase_id
                              WHERE pp3.slug = %L
                          )
                    ) sub
                )',
                p_drill_phase,
                p_date_start, p_date_end,
                p_date_start, p_date_end,
                p_drill_phase
            );
        ELSE
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

    ELSE
        -- ───────────────────────────────────────────────────
        -- DEFAULT: lógica original (backward compatible)
        -- ───────────────────────────────────────────────────

        -- Date filter por mode
        IF p_mode = 'stage_entry' AND p_global_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(%L, %L, %L, %L))',
                p_global_stage_id, p_date_start, p_date_end, p_product
            );
        ELSIF p_mode = 'ganho_sdr' THEN
            v_where := v_where || format(
                ' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_planner' THEN
            v_where := v_where || format(
                ' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_mode = 'ganho_total' THEN
            v_where := v_where || format(
                ' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L',
                p_date_start, p_date_end
            );
        ELSE
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill context filters (original logic)
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND mp.nome = %L', p_drill_loss_reason);
        END IF;
        IF p_drill_status IS NOT NULL THEN
            v_where := v_where || format(' AND c.status_comercial = %L', p_drill_status);
        END IF;
        IF p_drill_phase IS NOT NULL THEN
            v_where := v_where || format(' AND pp.slug = %L', p_drill_phase);
        END IF;
        IF p_drill_period_start IS NOT NULL AND p_drill_period_end IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.data_fechamento >= %L AND c.data_fechamento < %L',
                p_drill_period_start, p_drill_period_end
            );
        END IF;
    END IF;

    -- =======================================================
    -- Sort (whitelist + smart defaults)
    -- =======================================================

    -- Smart default: se user não pediu sort específico, usar default do source
    IF p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN
        IF v_source = 'current_stage' THEN
            p_sort_by := 'stage_entered_at';
            p_sort_dir := 'asc';
        ELSIF v_source = 'closed_deals' THEN
            p_sort_by := 'data_fechamento';
            p_sort_dir := 'desc';
        END IF;
    END IF;

    v_order := CASE p_sort_by
        WHEN 'titulo'           THEN 'c.titulo'
        WHEN 'valor_display'    THEN 'COALESCE(c.valor_final, c.valor_estimado)'
        WHEN 'etapa_nome'       THEN 'ps.nome'
        WHEN 'data_fechamento'  THEN 'c.data_fechamento'
        WHEN 'receita'          THEN 'c.receita'
        WHEN 'stage_entered_at' THEN 'COALESCE(c.stage_entered_at, c.updated_at, c.created_at)'
        ELSE 'c.created_at'
    END;

    IF p_sort_dir = 'asc' THEN
        v_order := v_order || ' ASC NULLS LAST';
    ELSE
        v_order := v_order || ' DESC NULLS LAST';
    END IF;

    -- =======================================================
    -- Query principal
    -- =======================================================
    v_query := format(
        'SELECT
            c.id,
            c.titulo,
            c.produto::TEXT AS produto,
            c.status_comercial,
            ps.nome AS etapa_nome,
            pp.slug AS fase,
            pr.nome AS dono_atual_nome,
            COALESCE(c.valor_final, c.valor_estimado, 0)::NUMERIC AS valor_display,
            COALESCE(c.receita, 0)::NUMERIC AS receita,
            c.created_at,
            c.data_fechamento,
            ct.nome AS pessoa_nome,
            ct.telefone AS pessoa_telefone,
            COUNT(*) OVER() AS total_count,
            COALESCE(c.stage_entered_at, c.updated_at) AS stage_entered_at
        FROM cards c
        LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
        LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
        LEFT JOIN contatos ct ON ct.id = c.pessoa_principal_id
        LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
        WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
        %s
        ORDER BY %s
        LIMIT %s OFFSET %s',
        v_where, v_order, p_limit, p_offset
    );

    RETURN QUERY EXECUTE v_query;
END;
$$;

-- ── 3. Adicionar planner_id ao analytics_operations_summary ──
-- Drop all overloads first
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
             WHERE proname = 'analytics_operations_summary' AND pronamespace = 'public'::regnamespace
    LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, v_start::TIMESTAMPTZ, (v_end + 1)::TIMESTAMPTZ, p_product
                  ))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= v_start::TIMESTAMPTZ AND c.ganho_sdr_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= v_start::TIMESTAMPTZ AND c.ganho_planner_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= v_start::TIMESTAMPTZ AND c.ganho_pos_at < (v_end + 1)::TIMESTAMPTZ
              ELSE
                  c.created_at >= v_start::TIMESTAMPTZ AND c.created_at < (v_end + 1)::TIMESTAMPTZ
          END
    ),
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(valor_final), 0) AS valor_total,
            CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor_final), 0) / COUNT(*), 2) ELSE 0 END AS ticket_medio
        FROM won_cards
    ),
    sub_cards AS (
        SELECT sc.*
        FROM cards sc
        JOIN won_cards wc ON sc.parent_card_id = wc.id
        WHERE sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
    ),
    sub_stats AS (
        SELECT
            COUNT(*) AS total_sub_cards,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            CASE WHEN COUNT(DISTINCT parent_card_id) > 0
                 THEN ROUND(COUNT(*)::NUMERIC / COUNT(DISTINCT parent_card_id), 2) ELSE 0 END AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT p.nome AS planner_nome,
            wc.vendas_owner_id AS planner_id,
            COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
            CASE WHEN COUNT(DISTINCT wc.id) > 0
                 THEN ROUND(COUNT(sc.id)::NUMERIC / COUNT(DISTINCT wc.id), 2) ELSE 0 END AS mudancas_por_viagem,
            COALESCE(SUM(wc.valor_final), 0) AS receita
        FROM won_cards wc
        LEFT JOIN cards sc ON sc.parent_card_id = wc.id AND sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
        LEFT JOIN profiles p ON p.id = wc.vendas_owner_id
        WHERE wc.vendas_owner_id IS NOT NULL
        GROUP BY p.nome, wc.vendas_owner_id ORDER BY viagens DESC
    ),
    timeline AS (
        SELECT TO_CHAR(DATE_TRUNC('week', sc.created_at::TIMESTAMPTZ), 'YYYY-MM-DD') AS week, COUNT(*) AS count
        FROM sub_cards sc GROUP BY 1 ORDER BY 1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k) FROM kpis k),
        'sub_card_stats', (SELECT row_to_json(s) FROM sub_stats s),
        'per_planner', (SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb) FROM per_planner pp),
        'timeline', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM timeline t)
    ) INTO result;
    RETURN result;
END;
$$;
