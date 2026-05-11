-- ============================================================
-- Report Query Engine — Tag Filter Support
--
-- Adiciona suporte a filtros por tag_id no report_query_engine.
-- tag_id é um campo virtual que mapeia para card_tag_assignments
-- (tabela M:N), exigindo EXISTS subquery no filtro.
--
-- Operadores suportados: in, not_in, is_null, is_not_null
-- Depende de: card_tag_assignments (20260303_card_tags_system.sql)
-- ============================================================

-- ── 1. Atualiza whitelist — adiciona tag_id para cards ────────
CREATE OR REPLACE FUNCTION _report_validate_field(p_source TEXT, p_field TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_allowed TEXT[];
BEGIN
    CASE p_source
        WHEN 'cards' THEN
            v_allowed := ARRAY[
                'ps.nome', 'pp.label', 'c.produto', 'c.status_comercial', 'c.prioridade', 'mp.nome',
                'c.origem', 'c.origem_lead',
                'pr_dono.nome', 'pr_sdr.nome', 'pr_vendas.nome', 'pr_pos.nome',
                'c.moeda', 'c.forma_pagamento',
                'c.is_group_parent', 'c.cliente_recorrente',
                'c.utm_source', 'c.utm_medium', 'c.utm_campaign',
                'c.created_at', 'c.data_fechamento', 'c.data_viagem_inicio', 'c.stage_entered_at',
                'c.id', 'c.valor_estimado', 'c.valor_final', 'c.receita', 'c.taxa_valor',
                'valor_display', 'dias_etapa', 'ciclo_dias',
                'c.epoca_tipo', 'c.estado_operacional', 'c.data_viagem_fim',
                'c.group_total_pax', 'c.group_capacity', 'c.group_total_revenue', 'duracao_viagem',
                'tag_id'
            ];
        WHEN 'contatos' THEN
            v_allowed := ARRAY[
                'c.tipo_cliente', 'c.sexo', 'c.origem', 'c.created_at', 'c.primeira_venda_data', 'c.ultima_venda_data',
                'c.id', 'cs.total_trips', 'cs.total_spend'
            ];
        WHEN 'propostas' THEN
            v_allowed := ARRAY['p.status', 'c.produto', 'pr.nome', 'p.created_at', 'p.accepted_at', 'p.id', 'p.accepted_total', 'p.version'];
        WHEN 'tarefas' THEN
            v_allowed := ARRAY['t.tipo', 't.status', 't.prioridade', 't.outcome', 'pr.nome', 't.created_at', 't.data_vencimento', 't.concluida_em', 't.id', 'concluidas', 'atrasadas'];
        WHEN 'reunioes' THEN
            v_allowed := ARRAY['r.status', 'r.resultado', 'pr.nome', 'r.data_inicio', 'r.id'];
        WHEN 'mensagens' THEN
            v_allowed := ARRAY['m.canal', 'm.lado', 'm.data_hora', 'm.id'];
        WHEN 'whatsapp' THEN
            v_allowed := ARRAY['wm.message_type', 'wm.direction', 'wm.fase_label', 'wm.produto', 'wm.created_at', 'wm.id', 'wm.conversation_id'];
        WHEN 'documentos' THEN
            v_allowed := ARRAY['dt.nome', 'cdr.status', 'cdr.modo', 'cdr.id'];
        WHEN 'cadencia' THEN
            v_allowed := ARRAY['cdt.name', 'ci.status', 'ci.started_at', 'ci.completed_at', 'ci.id', 'ci.successful_contacts', 'ci.total_contacts_attempted'];
        WHEN 'historico' THEN
            v_allowed := ARRAY['ps.nome', 'ps_anterior.nome', 'c.produto', 'c.status_comercial', 'hf.data_mudanca', 'pr.nome', 'hf.id', 'hf.tempo_na_etapa_anterior', 'tempo_etapa_dias'];
        WHEN 'equipe' THEN
            v_allowed := ARRAY['p.nome', 't.name', 'pp.label', 'p.role', 'p.id'];
        ELSE
            RETURN FALSE;
    END CASE;

    RETURN p_field = ANY(v_allowed);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── 2. Atualiza report_query_engine — adiciona handler tag_id ─
CREATE OR REPLACE FUNCTION report_query_engine(
    p_config JSONB,
    p_date_start TIMESTAMPTZ DEFAULT NULL,
    p_date_end TIMESTAMPTZ DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source TEXT;
    v_base TEXT;
    v_select_parts TEXT[] := '{}';
    v_group_parts TEXT[] := '{}';
    v_where_parts TEXT[] := '{}';
    v_params TEXT[] := '{}';
    v_param_idx INT := 0;
    v_order_part TEXT := '';
    v_limit_part TEXT := '';
    v_query TEXT;
    v_result JSONB;
    v_dim JSONB;
    v_mea JSONB;
    v_comp JSONB;
    v_flt JSONB;
    v_field TEXT;
    v_field_sql TEXT;
    v_agg TEXT;
    v_alias TEXT;
    v_date_grouping TEXT;
    v_operator TEXT;
    v_value TEXT;
    v_idx INT;
    v_has_timeseries BOOLEAN := FALSE;
    v_ts_granularity TEXT;
    v_ts_field_sql TEXT;
BEGIN
    -- 1. Validate source
    v_source := p_config->>'source';
    IF v_source IS NULL OR v_source NOT IN (
        'cards','contatos','propostas','tarefas','reunioes',
        'mensagens','whatsapp','documentos','cadencia','historico','equipe'
    ) THEN
        RAISE EXCEPTION 'Invalid or missing source: %', v_source;
    END IF;

    -- 2. Resolve base query
    v_base := _report_resolve_source(v_source);

    -- 3. Process dimensions
    v_idx := 0;
    FOR v_dim IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'dimensions', '[]'::jsonb))
    LOOP
        v_field := v_dim->>'field';
        v_date_grouping := v_dim->>'dateGrouping';
        v_alias := COALESCE(v_dim->>'alias', 'dim_' || v_idx);

        IF NOT _report_validate_field(v_source, v_field) THEN
            RAISE EXCEPTION 'Invalid dimension field: % for source %', v_field, v_source;
        END IF;

        -- tag_id cannot be used as a dimension (M:N relationship)
        IF v_field = 'tag_id' THEN
            RAISE EXCEPTION 'tag_id can only be used as a filter, not a dimension';
        END IF;

        v_field_sql := _report_resolve_field_sql(v_source, v_field);

        IF v_date_grouping IS NOT NULL AND v_date_grouping IN ('day','week','month','quarter','year') THEN
            v_select_parts := array_append(v_select_parts,
                format('DATE_TRUNC(%L, %s) AS %I', v_date_grouping, v_field_sql, v_alias));
            v_group_parts := array_append(v_group_parts,
                format('DATE_TRUNC(%L, %s)', v_date_grouping, v_field_sql));
            v_has_timeseries := TRUE;
            v_ts_granularity := v_date_grouping;
            v_ts_field_sql := v_field_sql;
        ELSE
            v_select_parts := array_append(v_select_parts,
                format('%s AS %I', v_field_sql, v_alias));
            v_group_parts := array_append(v_group_parts, v_field_sql);
        END IF;

        v_idx := v_idx + 1;
    END LOOP;

    -- 4. Process breakdownBy (optional extra dimension)
    IF p_config->'breakdownBy' IS NOT NULL AND p_config->>'breakdownBy' != 'null' THEN
        v_dim := p_config->'breakdownBy';
        v_field := v_dim->>'field';
        v_alias := COALESCE(v_dim->>'alias', 'breakdown');

        IF _report_validate_field(v_source, v_field) AND v_field != 'tag_id' THEN
            v_field_sql := _report_resolve_field_sql(v_source, v_field);
            v_select_parts := array_append(v_select_parts, format('%s AS %I', v_field_sql, v_alias));
            v_group_parts := array_append(v_group_parts, v_field_sql);
        END IF;
    END IF;

    -- 5. Process measures
    v_idx := 0;
    FOR v_mea IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'measures', '[]'::jsonb))
    LOOP
        v_field := v_mea->>'field';
        v_agg := v_mea->>'aggregation';
        v_alias := COALESCE(v_mea->>'alias', 'mea_' || v_idx);

        IF NOT _report_validate_field(v_source, v_field) THEN
            RAISE EXCEPTION 'Invalid measure field: % for source %', v_field, v_source;
        END IF;

        v_field_sql := _report_resolve_field_sql(v_source, v_field);

        CASE v_agg
            WHEN 'count' THEN
                v_select_parts := array_append(v_select_parts, format('COUNT(%s) AS %I', v_field_sql, v_alias));
            WHEN 'count_distinct' THEN
                v_select_parts := array_append(v_select_parts, format('COUNT(DISTINCT %s) AS %I', v_field_sql, v_alias));
            WHEN 'sum' THEN
                v_select_parts := array_append(v_select_parts, format('COALESCE(SUM(%s), 0) AS %I', v_field_sql, v_alias));
            WHEN 'avg' THEN
                v_select_parts := array_append(v_select_parts, format('ROUND(COALESCE(AVG(%s), 0)::numeric, 1) AS %I', v_field_sql, v_alias));
            WHEN 'min' THEN
                v_select_parts := array_append(v_select_parts, format('MIN(%s) AS %I', v_field_sql, v_alias));
            WHEN 'max' THEN
                v_select_parts := array_append(v_select_parts, format('MAX(%s) AS %I', v_field_sql, v_alias));
            ELSE
                RAISE EXCEPTION 'Invalid aggregation: %', v_agg;
        END CASE;

        v_idx := v_idx + 1;
    END LOOP;

    -- 6. Process computed measures
    FOR v_comp IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'computedMeasures', '[]'::jsonb))
    LOOP
        v_field := v_comp->>'key';
        v_alias := COALESCE(v_comp->>'alias', v_field);
        v_select_parts := array_append(v_select_parts,
            format('%s AS %I', _report_computed_measure_sql(v_source, v_field), v_alias));
    END LOOP;

    -- 7. Process filters
    FOR v_flt IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters', '[]'::jsonb))
    LOOP
        v_field := v_flt->>'field';
        v_operator := v_flt->>'operator';
        v_value := v_flt->>'value';

        IF NOT _report_validate_field(v_source, v_field) THEN
            RAISE EXCEPTION 'Invalid filter field: % for source %', v_field, v_source;
        END IF;

        -- Special handling for tag_id (M:N junction table via card_tag_assignments)
        IF v_field = 'tag_id' AND v_source = 'cards' THEN
            CASE v_operator
                WHEN 'in' THEN
                    v_where_parts := array_append(v_where_parts,
                        format('EXISTS (SELECT 1 FROM card_tag_assignments _cta WHERE _cta.card_id = c.id AND _cta.tag_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))))', v_value));
                WHEN 'not_in' THEN
                    v_where_parts := array_append(v_where_parts,
                        format('NOT EXISTS (SELECT 1 FROM card_tag_assignments _cta WHERE _cta.card_id = c.id AND _cta.tag_id::text = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))))', v_value));
                WHEN 'is_null' THEN
                    v_where_parts := array_append(v_where_parts,
                        'NOT EXISTS (SELECT 1 FROM card_tag_assignments _cta WHERE _cta.card_id = c.id)');
                WHEN 'is_not_null' THEN
                    v_where_parts := array_append(v_where_parts,
                        'EXISTS (SELECT 1 FROM card_tag_assignments _cta WHERE _cta.card_id = c.id)');
                ELSE
                    RAISE EXCEPTION 'Unsupported operator for tag_id: %. Use in, not_in, is_null, or is_not_null.', v_operator;
            END CASE;
            CONTINUE;
        END IF;

        v_field_sql := _report_resolve_field_sql(v_source, v_field);

        CASE v_operator
            WHEN 'eq' THEN
                v_where_parts := array_append(v_where_parts, format('%s = %L', v_field_sql, v_value));
            WHEN 'neq' THEN
                v_where_parts := array_append(v_where_parts, format('%s != %L', v_field_sql, v_value));
            WHEN 'gt' THEN
                v_where_parts := array_append(v_where_parts, format('%s > %L', v_field_sql, v_value));
            WHEN 'gte' THEN
                v_where_parts := array_append(v_where_parts, format('%s >= %L', v_field_sql, v_value));
            WHEN 'lt' THEN
                v_where_parts := array_append(v_where_parts, format('%s < %L', v_field_sql, v_value));
            WHEN 'lte' THEN
                v_where_parts := array_append(v_where_parts, format('%s <= %L', v_field_sql, v_value));
            WHEN 'in' THEN
                v_where_parts := array_append(v_where_parts,
                    format('%s = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_field_sql, v_value));
            WHEN 'not_in' THEN
                v_where_parts := array_append(v_where_parts,
                    format('NOT (%s = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))))', v_field_sql, v_value));
            WHEN 'like' THEN
                v_where_parts := array_append(v_where_parts, format('%s ILIKE %L', v_field_sql, '%' || v_value || '%'));
            WHEN 'is_null' THEN
                v_where_parts := array_append(v_where_parts, format('%s IS NULL', v_field_sql));
            WHEN 'is_not_null' THEN
                v_where_parts := array_append(v_where_parts, format('%s IS NOT NULL', v_field_sql));
            WHEN 'between' THEN
                -- value expected as JSON array: ["2026-01-01", "2026-03-01"]
                v_where_parts := array_append(v_where_parts,
                    format('%s BETWEEN %L AND %L',
                        v_field_sql,
                        (v_value::jsonb)->>0,
                        (v_value::jsonb)->>1
                    ));
            ELSE
                RAISE EXCEPTION 'Invalid operator: %', v_operator;
        END CASE;
    END LOOP;

    -- 8. Global filters (from dashboard or report runner)
    IF p_date_start IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.created_at >= %L', p_date_start));
            WHEN 'contatos' THEN v_where_parts := array_append(v_where_parts, format('c.created_at >= %L', p_date_start));
            WHEN 'propostas' THEN v_where_parts := array_append(v_where_parts, format('p.created_at >= %L', p_date_start));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('t.created_at >= %L', p_date_start));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('r.data_inicio >= %L', p_date_start));
            WHEN 'mensagens' THEN v_where_parts := array_append(v_where_parts, format('m.data_hora >= %L', p_date_start));
            WHEN 'whatsapp' THEN v_where_parts := array_append(v_where_parts, format('wm.created_at >= %L', p_date_start));
            WHEN 'cadencia' THEN v_where_parts := array_append(v_where_parts, format('ci.started_at >= %L', p_date_start));
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('hf.data_mudanca >= %L', p_date_start));
            ELSE NULL; -- documentos, equipe: no date filter
        END CASE;
    END IF;

    IF p_date_end IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.created_at < %L', p_date_end));
            WHEN 'contatos' THEN v_where_parts := array_append(v_where_parts, format('c.created_at < %L', p_date_end));
            WHEN 'propostas' THEN v_where_parts := array_append(v_where_parts, format('p.created_at < %L', p_date_end));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('t.created_at < %L', p_date_end));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('r.data_inicio < %L', p_date_end));
            WHEN 'mensagens' THEN v_where_parts := array_append(v_where_parts, format('m.data_hora < %L', p_date_end));
            WHEN 'whatsapp' THEN v_where_parts := array_append(v_where_parts, format('wm.created_at < %L', p_date_end));
            WHEN 'cadencia' THEN v_where_parts := array_append(v_where_parts, format('ci.started_at < %L', p_date_end));
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('hf.data_mudanca < %L', p_date_end));
            ELSE NULL;
        END CASE;
    END IF;

    IF p_product IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'propostas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'whatsapp' THEN v_where_parts := array_append(v_where_parts, format('wm.produto = %L', p_product));
            ELSE NULL;
        END CASE;
    END IF;

    IF p_owner_id IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.dono_atual_id = %L', p_owner_id));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('t.responsavel_id = %L', p_owner_id));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('r.responsavel_id = %L', p_owner_id));
            ELSE NULL;
        END CASE;
    END IF;

    -- 9. Order by
    IF p_config->'orderBy' IS NOT NULL AND p_config->>'orderBy' != 'null' THEN
        v_field := p_config->'orderBy'->>'field';
        v_order_part := format('ORDER BY %I %s', v_field,
            CASE WHEN (p_config->'orderBy'->>'direction') = 'asc' THEN 'ASC' ELSE 'DESC' END);
    END IF;

    -- 10. Limit (max 5000, default 50)
    v_limit_part := format('LIMIT %s',
        LEAST(COALESCE((p_config->>'limit')::int, 50), 5000));

    -- 11. Assemble query
    IF array_length(v_select_parts, 1) IS NULL OR array_length(v_select_parts, 1) = 0 THEN
        RAISE EXCEPTION 'No fields selected';
    END IF;

    v_query := 'SELECT ' || array_to_string(v_select_parts, ', ');
    v_query := v_query || ' ' || v_base;

    IF array_length(v_where_parts, 1) > 0 THEN
        -- Base query already has WHERE, so use AND
        v_query := v_query || ' AND ' || array_to_string(v_where_parts, ' AND ');
    END IF;

    IF array_length(v_group_parts, 1) > 0 THEN
        v_query := v_query || ' GROUP BY ' || array_to_string(v_group_parts, ', ');
    END IF;

    v_query := v_query || ' ' || v_order_part || ' ' || v_limit_part;

    -- 12. Wrap with gap-filling for timeseries
    IF v_has_timeseries AND p_date_start IS NOT NULL AND p_date_end IS NOT NULL THEN
        v_query := format('
            WITH date_series AS (
                SELECT generate_series(
                    DATE_TRUNC(%L, %L::timestamptz),
                    DATE_TRUNC(%L, %L::timestamptz),
                    (%L)::interval
                )::timestamptz AS period
            ),
            report_data AS (%s)
            SELECT ds.period AS dim_0, %s
            FROM date_series ds
            LEFT JOIN report_data rd ON rd.dim_0 = ds.period
            ORDER BY ds.period
        ',
            v_ts_granularity, p_date_start,
            v_ts_granularity, p_date_end,
            '1 ' || v_ts_granularity,
            v_query,
            -- COALESCE all measure columns to 0
            (SELECT string_agg(format('COALESCE(rd.%I, 0) AS %I', s, s), ', ')
             FROM unnest(v_select_parts) WITH ORDINALITY AS t(expr, ord)
             CROSS JOIN LATERAL (SELECT regexp_replace(expr, '.* AS ', '') AS s) sub
             WHERE ord > (SELECT COUNT(*) FROM unnest(v_group_parts)))
        );
    END IF;

    -- 13. Execute and return
    EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t', v_query)
    INTO v_result;

    RETURN v_result;
END;
$$;
