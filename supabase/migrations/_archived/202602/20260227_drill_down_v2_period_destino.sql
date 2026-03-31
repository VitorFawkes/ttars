-- ============================================================
-- Drill-Down v3: Global Mode/Population Filter + Phase-Aware Owner
--
-- Fixes:
-- 1. CRITICAL: Filtro de mode/população GLOBAL aplicado a TODOS
--    os sources. Antes, stage_entries/closed_deals/macro_funnel
--    NÃO aplicavam o filtro de coorte — clicando no funil com
--    "Coorte Aguardando Briefing" mostrava TODOS os cards, não
--    apenas os da coorte.
-- 2. Drill owner phase-aware: TeamView SDR usa sdr_owner_id,
--    Vendas usa vendas_owner_id, Pos-Venda usa dono_atual_id.
-- 3. Drill owner em TODOS os sources (faltava em current_stage,
--    lost_deals, macro_funnel).
-- 4. closed_deals: respeita drillPeriodStart/End para período.
-- 5. Destino filter via contact_stats.top_destinations.
-- ============================================================

-- ── 1. Drop all overloads ────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
             WHERE proname = 'analytics_drill_down_cards' AND pronamespace = 'public'::regnamespace
    LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $$;

-- ── 2. Recreate ──────────────────────────────────────────
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
    -- Source — qual lógica de agregação espelhar
    p_drill_source TEXT DEFAULT 'default',
    -- Paginação
    p_sort_by  TEXT DEFAULT 'created_at',
    p_sort_dir TEXT DEFAULT 'desc',
    p_limit    INT DEFAULT 50,
    p_offset   INT DEFAULT 0,
    -- Filtro por destino
    p_drill_destino TEXT DEFAULT NULL
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
    stage_entered_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_query TEXT;
    v_where TEXT := '';
    v_order TEXT;
    v_source TEXT := COALESCE(p_drill_source, 'default');
    v_period_start TIMESTAMPTZ;
    v_period_end   TIMESTAMPTZ;
    v_is_entries_mode BOOLEAN;
BEGIN
    -- Helper: entries mode check (entries ou stage_entry sem stage)
    v_is_entries_mode := (p_mode = 'entries' OR p_mode IS NULL
        OR (p_mode = 'stage_entry' AND p_global_stage_id IS NULL));

    -- =======================================================
    -- 1. FILTROS GLOBAIS (comuns a TODOS os sources)
    -- =======================================================

    -- Produto
    IF p_product IS NOT NULL THEN
        v_where := v_where || format(' AND c.produto::TEXT = %L', p_product);
    END IF;

    -- Owner global (filtro do header do analytics)
    IF p_global_owner_id IS NOT NULL THEN
        v_where := v_where || format(' AND c.dono_atual_id = %L', p_global_owner_id);
    END IF;

    -- Destino (contact_stats.top_destinations — JSONB array de strings)
    IF p_drill_destino IS NOT NULL THEN
        v_where := v_where || format(
            ' AND EXISTS (
                SELECT 1 FROM contact_stats cs2
                CROSS JOIN LATERAL jsonb_array_elements(cs2.top_destinations) AS d(elem)
                WHERE cs2.contact_id = c.pessoa_principal_id
                  AND cs2.top_destinations IS NOT NULL
                  AND jsonb_typeof(cs2.top_destinations) = ''array''
                  AND jsonb_array_length(cs2.top_destinations) > 0
                  AND (d.elem #>> ''{}'' = %L OR d.elem->>''name'' = %L)
            )',
            p_drill_destino, p_drill_destino
        );
    END IF;

    -- =======================================================
    -- 2. MODE / POPULATION FILTER — restringe o UNIVERSO
    --
    -- Para modos não-entries, isto garante que o drill-down
    -- mostra APENAS cards da coorte/população selecionada.
    -- Sem isso, um drill com "Coorte Aguardando Briefing"
    -- ignorava a coorte e mostrava todos os cards.
    -- =======================================================

    IF NOT v_is_entries_mode THEN
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
        END IF;
    END IF;

    -- =======================================================
    -- 3. LÓGICA POR SOURCE (cada source espelha uma view)
    -- =======================================================

    IF v_source = 'stage_entries' THEN
        -- ───────────────────────────────────────────────────
        -- STAGE ENTRIES: espelha analytics_funnel_live
        --
        -- entries mode: entries no PERÍODO (filtro temporal nas activities)
        -- coorte/ganho: entries a QUALQUER MOMENTO (pop já filtra universo)
        --   Isso espelha analytics_funnel_live que, em coorte/ganho mode,
        --   conta transition_entries SEM date filter nas activities.
        -- ───────────────────────────────────────────────────
        IF p_drill_stage_id IS NOT NULL AND v_is_entries_mode THEN
            -- Entries mode + stage específico: filtro temporal nas activities
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
        ELSIF p_drill_stage_id IS NOT NULL AND NOT v_is_entries_mode THEN
            -- Coorte/ganho mode + stage específico: SEM filtro temporal
            -- (população global já restringe; funnel conta entries a qualquer momento)
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id
                    FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id
                    FROM cards c3
                    WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID
                           FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id,
                p_drill_stage_id
            );
        ELSIF v_is_entries_mode THEN
            -- Sem drill stage + entries mode: date filter simples
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill owner (phase-aware para TeamView)
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'closed_deals' THEN
        -- ───────────────────────────────────────────────────
        -- CLOSED DEALS: espelha analytics_financial_breakdown
        -- Cards ganhos com data_fechamento no período
        -- ───────────────────────────────────────────────────
        v_where := v_where || ' AND c.status_comercial = ''ganho''';
        v_where := v_where || ' AND c.data_fechamento IS NOT NULL';

        -- Period: prefer drill-specific period over global
        -- IMPORTANT: aggregation RPCs (analytics_financial_breakdown) use DATE params
        -- with +1 day for inclusive end. Drill-down uses TIMESTAMPTZ, so when falling
        -- back to global p_date_end we must add 1 day to match.
        v_period_start := COALESCE(p_drill_period_start, p_date_start);
        v_period_end   := COALESCE(p_drill_period_end, p_date_end + interval '1 day');

        v_where := v_where || format(
            ' AND c.data_fechamento >= %L AND c.data_fechamento < %L',
            v_period_start, v_period_end
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
        -- SLA summary só conta stages ativos; alinhar aqui
        v_where := v_where || ' AND ps.ativo = true';

        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;

        -- Date filter para entries mode (non-entries handled by global population)
        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill owner (phase-aware)
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'lost_deals' THEN
        -- ───────────────────────────────────────────────────
        -- LOST DEALS: espelha analytics_loss_reasons
        -- Cards perdidos, filtrados por motivo de perda
        -- ───────────────────────────────────────────────────
        v_where := v_where || ' AND c.status_comercial = ''perdido''';

        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND COALESCE(mp.nome, ''Sem motivo informado'') = %L', p_drill_loss_reason);
        END IF;

        -- Date filter para entries mode (non-entries handled by global population)
        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill owner
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSIF v_source = 'macro_funnel' THEN
        -- ───────────────────────────────────────────────────
        -- MACRO FUNNEL: cards que ENTRARAM em qualquer etapa
        -- da fase. Entries mode → no período; coorte/ganho → qualquer momento.
        -- ───────────────────────────────────────────────────
        IF p_drill_phase IS NOT NULL AND v_is_entries_mode THEN
            -- Entries mode: filtro temporal nas activities
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
        ELSIF p_drill_phase IS NOT NULL AND NOT v_is_entries_mode THEN
            -- Coorte/ganho mode: SEM filtro temporal (pop global já restringe)
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
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid
                        FROM cards c3
                        WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
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
                p_drill_phase
            );
        ELSIF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill owner
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSE
        -- ───────────────────────────────────────────────────
        -- DEFAULT: lógica genérica (backward compatible)
        -- ───────────────────────────────────────────────────

        -- Date filter para entries mode (non-entries handled by global population)
        IF v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L',
                p_date_start, p_date_end
            );
        END IF;

        -- Drill context filters
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND mp.nome = %L', p_drill_loss_reason);
        END IF;
        IF p_drill_status IS NOT NULL THEN
            v_where := v_where || format(' AND c.status_comercial = %L', p_drill_status);
        END IF;
        IF p_drill_phase IS NOT NULL AND p_drill_owner_id IS NULL THEN
            -- Phase filter no default (sem owner = macro funnel context)
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

-- ============================================================
-- Fix: analytics_top_destinations — top_destinations é array
-- de strings ["Roma","Paris"], NÃO objetos [{"name":"Roma"}]
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
             WHERE proname = 'analytics_top_destinations' AND pronamespace = 'public'::regnamespace
    LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL, p_date_end DATE DEFAULT NULL,
    p_limit INT DEFAULT 10, p_mode TEXT DEFAULT 'entries',
    p_product TEXT DEFAULT NULL, p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL, p_owner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(destino TEXT, total_cards BIGINT, receita_total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id, c.receita, c.pessoa_principal_id
        FROM cards c
        WHERE c.status_comercial = 'ganho' AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, COALESCE(p_date_start, '2020-01-01'::DATE)::TIMESTAMPTZ,
                      COALESCE(p_date_end + 1, '2099-01-01'::DATE)::TIMESTAMPTZ, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true
                  AND (p_date_start IS NULL OR c.ganho_sdr_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_sdr_at < (p_date_end + 1)::TIMESTAMPTZ)
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true
                  AND (p_date_start IS NULL OR c.ganho_planner_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_planner_at < (p_date_end + 1)::TIMESTAMPTZ)
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true
                  AND (p_date_start IS NULL OR c.ganho_pos_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.ganho_pos_at < (p_date_end + 1)::TIMESTAMPTZ)
              ELSE
                  (p_date_start IS NULL OR c.created_at >= p_date_start::TIMESTAMPTZ)
                  AND (p_date_end IS NULL OR c.created_at < (p_date_end + 1)::TIMESTAMPTZ)
          END
    ),
    dest_expanded AS (
        SELECT
            COALESCE(d.elem #>> '{}', d.elem->>'name') AS dest_name,
            wc.id AS card_id,
            wc.receita
        FROM won_cards wc
        JOIN contact_stats cs ON cs.contact_id = wc.pessoa_principal_id
        CROSS JOIN LATERAL jsonb_array_elements(cs.top_destinations) AS d(elem)
        WHERE cs.top_destinations IS NOT NULL
          AND jsonb_typeof(cs.top_destinations) = 'array'
          AND jsonb_array_length(cs.top_destinations) > 0
    )
    SELECT de.dest_name, COUNT(DISTINCT de.card_id), COALESCE(SUM(de.receita), 0)
    FROM dest_expanded de
    WHERE de.dest_name IS NOT NULL AND de.dest_name != ''
    GROUP BY de.dest_name ORDER BY receita_total DESC LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_top_destinations TO authenticated;
