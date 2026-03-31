-- Analytics Drill-Down: lista de cards individuais por contexto de drill-down
-- Serve TODAS as views de analytics com uma única RPC genérica

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
             WHERE proname = 'analytics_drill_down_cards' AND pronamespace = 'public'::regnamespace
    LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION analytics_drill_down_cards(
    -- Filtros globais (mesmos de todos os RPCs analytics)
    p_date_start   TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end     TIMESTAMPTZ DEFAULT NOW(),
    p_product      TEXT DEFAULT NULL,
    p_mode         TEXT DEFAULT 'entries',
    p_global_stage_id UUID DEFAULT NULL,
    p_global_owner_id UUID DEFAULT NULL,
    -- Contexto do drill-down (o que foi clicado)
    p_drill_stage_id    UUID DEFAULT NULL,
    p_drill_owner_id    UUID DEFAULT NULL,
    p_drill_loss_reason TEXT DEFAULT NULL,
    p_drill_status      TEXT DEFAULT NULL,
    p_drill_phase       TEXT DEFAULT NULL,
    p_drill_period_start TIMESTAMPTZ DEFAULT NULL,
    p_drill_period_end   TIMESTAMPTZ DEFAULT NULL,
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
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_query TEXT;
    v_where TEXT := '';
    v_order TEXT;
BEGIN
    -- =======================================================
    -- Filtros globais (mesma lógica de todos RPCs analytics)
    -- =======================================================

    -- Filtro de produto
    IF p_product IS NOT NULL THEN
        v_where := v_where || format(' AND c.produto::TEXT = %L', p_product);
    END IF;

    -- Filtro de owner global
    IF p_global_owner_id IS NOT NULL THEN
        v_where := v_where || format(' AND c.dono_atual_id = %L', p_global_owner_id);
    END IF;

    -- Filtro de data baseado no mode
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
        -- entries / cohort / default
        v_where := v_where || format(
            ' AND c.created_at >= %L AND c.created_at < %L',
            p_date_start, p_date_end
        );
    END IF;

    -- =======================================================
    -- Filtros de drill-down (contexto do clique)
    -- =======================================================

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

    -- =======================================================
    -- Sort (whitelist para segurança)
    -- =======================================================
    v_order := CASE p_sort_by
        WHEN 'titulo'          THEN 'c.titulo'
        WHEN 'valor_display'   THEN 'COALESCE(c.valor_final, c.valor_estimado)'
        WHEN 'etapa_nome'      THEN 'ps.nome'
        WHEN 'data_fechamento' THEN 'c.data_fechamento'
        WHEN 'receita'         THEN 'c.receita'
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
            COUNT(*) OVER() AS total_count
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
