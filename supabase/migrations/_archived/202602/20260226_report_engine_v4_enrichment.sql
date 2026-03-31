-- ============================================
-- Report Engine v4 — Field Enrichment & Historico Deep
-- ============================================
-- Fixes:
-- 1. CARDS: Adiciona 7 campos ao whitelist (viagem, grupo, duração)
-- 2. PROPOSTAS: Adiciona accepted_at, version ao whitelist
-- 3. TAREFAS: Adiciona concluida_em ao whitelist
-- 4. CADENCIA: Adiciona completed_at, total_contacts_attempted ao whitelist
-- 5. HISTORICO: JOIN etapa anterior (ps_anterior) + 4 novos campos
-- 6. HISTORICO: tempo_na_etapa_anterior convertido de interval para segundos
-- 7. HISTORICO: Computed measures (tempo_medio_dias)
-- 8. PROPOSTAS/CONTATOS/CADENCIA: computed measures atualizados
-- 9. HISTORICO: Filtros globais (product, owner) via cards join
-- ============================================

-- 1. Source: historico agora faz JOIN com etapa anterior
CREATE OR REPLACE FUNCTION _report_resolve_source(p_source TEXT)
RETURNS TEXT AS $$
BEGIN
    CASE p_source
        WHEN 'cards' THEN
            RETURN '
                FROM cards c
                LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
                LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
                LEFT JOIN profiles pr_dono ON pr_dono.id = c.dono_atual_id
                LEFT JOIN profiles pr_sdr ON pr_sdr.id = c.sdr_owner_id
                LEFT JOIN profiles pr_vendas ON pr_vendas.id = c.vendas_owner_id
                LEFT JOIN profiles pr_pos ON pr_pos.id = c.pos_owner_id
                LEFT JOIN contatos ct ON ct.id = c.pessoa_principal_id
                LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
                WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
            ';
        WHEN 'contatos' THEN
            RETURN '
                FROM contatos c
                LEFT JOIN contact_stats cs ON cs.contact_id = c.id
                WHERE c.deleted_at IS NULL
            ';
        WHEN 'propostas' THEN
            RETURN '
                FROM proposals p
                JOIN cards c ON c.id = p.card_id
                LEFT JOIN profiles pr ON pr.id = p.created_by
                WHERE c.deleted_at IS NULL
            ';
        WHEN 'tarefas' THEN
            RETURN '
                FROM tarefas t
                JOIN cards c ON c.id = t.card_id
                LEFT JOIN profiles pr ON pr.id = t.responsavel_id
                WHERE t.deleted_at IS NULL
            ';
        WHEN 'reunioes' THEN
            RETURN '
                FROM reunioes r
                JOIN cards c ON c.id = r.card_id
                LEFT JOIN profiles pr ON pr.id = r.responsavel_id
                WHERE true
            ';
        WHEN 'mensagens' THEN
            RETURN '
                FROM mensagens m
                JOIN cards c ON c.id = m.card_id
                WHERE true
            ';
        WHEN 'whatsapp' THEN
            RETURN '
                FROM whatsapp_messages wm
                LEFT JOIN contatos ct ON ct.id = wm.contact_id
                WHERE true
            ';
        WHEN 'documentos' THEN
            RETURN '
                FROM card_document_requirements cdr
                JOIN document_types dt ON dt.id = cdr.document_type_id
                JOIN cards c ON c.id = cdr.card_id
                WHERE true
            ';
        WHEN 'cadencia' THEN
            RETURN '
                FROM cadence_instances ci
                JOIN cadence_templates cdt ON cdt.id = ci.template_id
                JOIN cards c ON c.id = ci.card_id
                WHERE true
            ';
        WHEN 'historico' THEN
            -- v4: JOIN etapa anterior para dimensão de origem
            RETURN '
                FROM historico_fases hf
                JOIN pipeline_stages ps ON ps.id = hf.etapa_nova_id
                LEFT JOIN pipeline_stages ps_anterior ON ps_anterior.id = hf.etapa_anterior_id
                JOIN cards c ON c.id = hf.card_id
                LEFT JOIN profiles pr ON pr.id = hf.mudado_por
                WHERE true
            ';
        WHEN 'equipe' THEN
            RETURN '
                FROM profiles p
                LEFT JOIN teams t ON t.id = p.team_id
                LEFT JOIN pipeline_phases pp ON pp.id = t.phase_id
                WHERE p.active = true
            ';
        ELSE
            RAISE EXCEPTION 'Invalid source: %', p_source;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Whitelist atualizado com TODOS os campos do frontend
CREATE OR REPLACE FUNCTION _report_validate_field(p_source TEXT, p_field TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_allowed TEXT[];
BEGIN
    CASE p_source
        WHEN 'cards' THEN
            v_allowed := ARRAY[
                -- Dimensões Pipeline
                'ps.nome', 'pp.label', 'c.produto', 'c.status_comercial', 'c.prioridade', 'mp.nome',
                -- Dimensões Lead
                'c.origem', 'c.origem_lead',
                -- Dimensões Equipe
                'pr_dono.nome', 'pr_sdr.nome', 'pr_vendas.nome', 'pr_pos.nome',
                -- Dimensões Financeiro
                'c.moeda', 'c.forma_pagamento',
                -- Dimensões Tipo
                'c.is_group_parent', 'c.cliente_recorrente',
                -- Dimensões Marketing
                'c.utm_source', 'c.utm_medium', 'c.utm_campaign',
                -- Dimensões Tempo
                'c.created_at', 'c.data_fechamento', 'c.data_viagem_inicio', 'c.stage_entered_at',
                -- v4: Dimensões Viagem
                'c.epoca_tipo', 'c.estado_operacional', 'c.data_viagem_fim',
                -- Medidas
                'c.id', 'c.valor_estimado', 'c.valor_final', 'c.receita', 'c.taxa_valor',
                'valor_display', 'dias_etapa', 'ciclo_dias',
                -- v4: Medidas Viagem/Grupo
                'c.group_total_pax', 'c.group_capacity', 'c.group_total_revenue', 'duracao_viagem'
            ];
        WHEN 'contatos' THEN
            v_allowed := ARRAY[
                'c.tipo_cliente', 'c.sexo', 'c.origem', 'c.created_at', 'c.primeira_venda_data', 'c.ultima_venda_data',
                'c.id', 'cs.total_trips', 'cs.total_spend'
            ];
        WHEN 'propostas' THEN
            v_allowed := ARRAY[
                'p.status', 'c.produto', 'pr.nome', 'p.created_at',
                -- v4: accepted_at, version
                'p.accepted_at', 'p.version',
                'p.id', 'p.accepted_total'
            ];
        WHEN 'tarefas' THEN
            v_allowed := ARRAY[
                't.tipo', 't.status', 't.prioridade', 't.outcome', 'pr.nome',
                't.created_at', 't.data_vencimento',
                -- v4: concluida_em
                't.concluida_em',
                't.id', 'concluidas', 'atrasadas'
            ];
        WHEN 'reunioes' THEN
            v_allowed := ARRAY['r.status', 'r.resultado', 'pr.nome', 'r.data_inicio', 'r.id'];
        WHEN 'mensagens' THEN
            v_allowed := ARRAY['m.canal', 'm.lado', 'm.data_hora', 'm.id'];
        WHEN 'whatsapp' THEN
            v_allowed := ARRAY['wm.message_type', 'wm.direction', 'wm.fase_label', 'wm.produto', 'wm.created_at', 'wm.id', 'wm.conversation_id'];
        WHEN 'documentos' THEN
            v_allowed := ARRAY['dt.nome', 'cdr.status', 'cdr.modo', 'cdr.id'];
        WHEN 'cadencia' THEN
            v_allowed := ARRAY[
                'cdt.name', 'ci.status', 'ci.started_at',
                -- v4: completed_at, total_contacts_attempted
                'ci.completed_at', 'ci.total_contacts_attempted',
                'ci.id', 'ci.successful_contacts'
            ];
        WHEN 'historico' THEN
            v_allowed := ARRAY[
                'ps.nome', 'hf.data_mudanca', 'pr.nome', 'hf.id', 'hf.tempo_na_etapa_anterior',
                -- v4: etapa anterior, produto do card, status comercial
                'ps_anterior.nome', 'c.produto', 'c.status_comercial',
                -- v4: tempo em dias (virtual)
                'tempo_etapa_dias'
            ];
        WHEN 'equipe' THEN
            v_allowed := ARRAY['p.nome', 't.name', 'pp.label', 'p.role', 'p.id'];
        ELSE
            RETURN FALSE;
    END CASE;

    RETURN p_field = ANY(v_allowed);
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Virtual fields atualizados
CREATE OR REPLACE FUNCTION _report_resolve_field_sql(p_source TEXT, p_field TEXT)
RETURNS TEXT AS $$
BEGIN
    CASE p_field
        -- Cards virtual fields
        WHEN 'valor_display' THEN RETURN 'COALESCE(c.valor_final, c.valor_estimado)';
        WHEN 'dias_etapa' THEN RETURN 'GREATEST(0, EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at)))';
        WHEN 'ciclo_dias' THEN RETURN 'CASE WHEN c.data_fechamento::timestamptz > c.created_at THEN EXTRACT(DAY FROM c.data_fechamento::timestamptz - c.created_at) ELSE NULL END';
        -- v4: Duração viagem
        WHEN 'duracao_viagem' THEN RETURN 'CASE WHEN c.data_viagem_fim IS NOT NULL AND c.data_viagem_inicio IS NOT NULL THEN EXTRACT(DAY FROM c.data_viagem_fim::timestamptz - c.data_viagem_inicio::timestamptz) ELSE NULL END';
        -- Date casts
        WHEN 'c.data_fechamento' THEN RETURN 'c.data_fechamento::timestamptz';
        WHEN 'c.data_viagem_inicio' THEN RETURN 'c.data_viagem_inicio::timestamptz';
        WHEN 'c.data_viagem_fim' THEN RETURN 'c.data_viagem_fim::timestamptz';
        WHEN 'p.accepted_at' THEN RETURN 'p.accepted_at::timestamptz';
        WHEN 't.concluida_em' THEN RETURN 't.concluida_em::timestamptz';
        WHEN 'ci.completed_at' THEN RETURN 'ci.completed_at::timestamptz';
        -- Tarefas virtual
        WHEN 'concluidas' THEN RETURN 'CASE WHEN t.concluida = true THEN 1 END';
        WHEN 'atrasadas' THEN RETURN 'CASE WHEN t.concluida = false AND t.data_vencimento < NOW() THEN 1 END';
        -- v4: Historico — tempo_na_etapa_anterior é INTERVAL, converter para segundos
        WHEN 'hf.tempo_na_etapa_anterior' THEN RETURN 'EXTRACT(EPOCH FROM hf.tempo_na_etapa_anterior)';
        -- v4: Historico — tempo em dias (virtual)
        WHEN 'tempo_etapa_dias' THEN RETURN 'EXTRACT(EPOCH FROM hf.tempo_na_etapa_anterior) / 86400.0';
        ELSE RETURN p_field;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Computed measures — agora para mais sources
CREATE OR REPLACE FUNCTION _report_computed_measure_sql(p_source TEXT, p_key TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_source = 'cards' THEN
        CASE p_key
            WHEN 'taxa_conversao' THEN
                RETURN 'ROUND(COUNT(CASE WHEN c.status_comercial=''ganho'' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            WHEN 'ticket_medio' THEN
                RETURN 'ROUND(SUM(CASE WHEN c.status_comercial=''ganho'' THEN c.valor_final ELSE 0 END) / NULLIF(COUNT(CASE WHEN c.status_comercial=''ganho'' THEN 1 END), 0), 0)';
            WHEN 'margem_pct' THEN
                RETURN 'ROUND(SUM(CASE WHEN c.status_comercial=''ganho'' THEN c.receita ELSE 0 END) / NULLIF(SUM(CASE WHEN c.status_comercial=''ganho'' THEN c.valor_final ELSE 0 END), 0) * 100, 1)';
            WHEN 'taxa_perda' THEN
                RETURN 'ROUND(COUNT(CASE WHEN c.status_comercial=''perdido'' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'contatos' THEN
        CASE p_key
            WHEN 'taxa_recorrencia' THEN
                RETURN 'ROUND(COUNT(CASE WHEN cs.total_trips > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'propostas' THEN
        CASE p_key
            WHEN 'taxa_aceitacao' THEN
                RETURN 'ROUND(COUNT(CASE WHEN p.status = ''accepted'' THEN 1 END)::numeric / NULLIF(COUNT(CASE WHEN p.status NOT IN (''draft'') THEN 1 END), 0) * 100, 1)';
            WHEN 'valor_medio_proposta' THEN
                RETURN 'ROUND(SUM(CASE WHEN p.status = ''accepted'' THEN p.accepted_total ELSE 0 END) / NULLIF(COUNT(CASE WHEN p.status = ''accepted'' THEN 1 END), 0), 0)';
            WHEN 'taxa_rejeicao' THEN
                RETURN 'ROUND(COUNT(CASE WHEN p.status = ''rejected'' THEN 1 END)::numeric / NULLIF(COUNT(CASE WHEN p.status NOT IN (''draft'') THEN 1 END), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'tarefas' THEN
        CASE p_key
            WHEN 'taxa_conclusao' THEN
                RETURN 'ROUND(COUNT(CASE WHEN t.concluida = true THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            WHEN 'taxa_atraso' THEN
                RETURN 'ROUND(COUNT(CASE WHEN t.concluida = false AND t.data_vencimento < NOW() THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'reunioes' THEN
        CASE p_key
            WHEN 'taxa_realizacao' THEN
                RETURN 'ROUND(COUNT(CASE WHEN r.status = ''realizada'' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'documentos' THEN
        CASE p_key
            WHEN 'taxa_coleta' THEN
                RETURN 'ROUND(COUNT(CASE WHEN cdr.status = ''received'' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'cadencia' THEN
        CASE p_key
            WHEN 'taxa_sucesso' THEN
                RETURN 'ROUND(COUNT(CASE WHEN ci.status = ''completed'' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)';
            WHEN 'media_contatos_sucesso' THEN
                RETURN 'ROUND(SUM(ci.successful_contacts)::numeric / NULLIF(COUNT(*), 0), 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSIF p_source = 'historico' THEN
        -- v4: Computed measures para histórico
        CASE p_key
            WHEN 'tempo_medio_dias' THEN
                RETURN 'ROUND(AVG(EXTRACT(EPOCH FROM hf.tempo_na_etapa_anterior) / 86400.0)::numeric, 1)';
            ELSE
                RAISE EXCEPTION 'Unknown computed measure: % for source %', p_key, p_source;
        END CASE;
    ELSE
        RAISE EXCEPTION 'No computed measures for source: %', p_source;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Historico: global product filter agora funciona via cards join
-- (Já incluso no main engine via CASE v_source WHEN 'historico')
-- Precisa adicionar ao report_query_engine e report_drill_down

-- Atualizar o engine principal para suportar product/owner filter em historico
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_source TEXT;
    v_base TEXT;
    v_select_parts TEXT[] := '{}';
    v_group_parts TEXT[] := '{}';
    v_where_parts TEXT[] := '{}';
    v_order_part TEXT := '';
    v_limit_part TEXT := '';
    v_limit_num INT;
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
    v_has_stage_dim BOOLEAN := FALSE;
    v_has_explicit_order BOOLEAN := FALSE;
    -- v4: map field keys to aliases for ORDER BY resolution
    v_field_alias_map JSONB := '{}'::jsonb;
    v_order_alias TEXT;
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

        v_field_sql := _report_resolve_field_sql(v_source, v_field);

        -- Detect stage dimension for funnel ordering
        IF (v_source = 'cards' AND v_field = 'ps.nome') OR (v_source = 'historico' AND v_field = 'ps.nome') THEN
            v_has_stage_dim := TRUE;
        END IF;

        -- v4: track field→alias for ORDER BY resolution
        v_field_alias_map := v_field_alias_map || jsonb_build_object(v_field, v_alias);

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

    -- 4. Process breakdownBy
    IF p_config->'breakdownBy' IS NOT NULL AND p_config->>'breakdownBy' != 'null' THEN
        v_dim := p_config->'breakdownBy';
        v_field := v_dim->>'field';
        v_alias := COALESCE(v_dim->>'alias', 'breakdown');

        IF _report_validate_field(v_source, v_field) THEN
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

        -- v4: track field→alias for ORDER BY resolution
        v_field_alias_map := v_field_alias_map || jsonb_build_object(v_field, v_alias);

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

    -- 8. Global filters
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
            -- v4: documentos filtra por data de criação
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('cdr.created_at >= %L', p_date_start));
            ELSE NULL;
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
            -- v4: documentos filtra por data de criação
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('cdr.created_at < %L', p_date_end));
            ELSE NULL;
        END CASE;
    END IF;

    IF p_product IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'propostas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'whatsapp' THEN v_where_parts := array_append(v_where_parts, format('wm.produto = %L', p_product));
            -- v4: historico filtra por produto do card
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            -- v4: documentos e cadencia filtram via cards
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'cadencia' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'mensagens' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            ELSE NULL;
        END CASE;
    END IF;

    IF p_owner_id IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.dono_atual_id = %L', p_owner_id));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('t.responsavel_id = %L', p_owner_id));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('r.responsavel_id = %L', p_owner_id));
            -- v4: historico filtra por quem moveu
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('hf.mudado_por = %L', p_owner_id));
            ELSE NULL;
        END CASE;
    END IF;

    -- 9. Order by — v4: use alias map to resolve field→alias (fixes %I quoting bug)
    v_has_explicit_order := (p_config->'orderBy' IS NOT NULL AND p_config->>'orderBy' != 'null');

    IF v_has_explicit_order THEN
        v_field := p_config->'orderBy'->>'field';
        -- Look up the alias for this field (set during dim/measure processing)
        v_order_alias := v_field_alias_map->>v_field;
        IF v_order_alias IS NOT NULL THEN
            v_order_part := format('ORDER BY %I %s', v_order_alias,
                CASE WHEN (p_config->'orderBy'->>'direction') = 'asc' THEN 'ASC' ELSE 'DESC' END);
        END IF;
        -- If alias not found, skip ORDER BY (field not in select — can't order by it)
    ELSIF v_has_stage_dim THEN
        -- Funnel ordering — ps.nome ordena por posição do pipeline
        v_order_part := 'ORDER BY MIN(pp.order_index) ASC, MIN(ps.ordem) ASC';
    END IF;

    -- 10. Limit
    v_limit_num := LEAST(COALESCE((p_config->>'limit')::int, 50), 5000);
    v_limit_part := format('LIMIT %s', v_limit_num);

    -- 11. Assemble query
    IF array_length(v_select_parts, 1) IS NULL OR array_length(v_select_parts, 1) = 0 THEN
        RAISE EXCEPTION 'No fields selected';
    END IF;

    v_query := 'SELECT ' || array_to_string(v_select_parts, ', ');
    v_query := v_query || ' ' || v_base;

    IF array_length(v_where_parts, 1) > 0 THEN
        v_query := v_query || ' AND ' || array_to_string(v_where_parts, ' AND ');
    END IF;

    IF array_length(v_group_parts, 1) > 0 THEN
        v_query := v_query || ' GROUP BY ' || array_to_string(v_group_parts, ', ');
    END IF;

    v_query := v_query || ' ' || v_order_part;

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
            LIMIT %s
        ',
            v_ts_granularity, p_date_start,
            v_ts_granularity, p_date_end,
            '1 ' || v_ts_granularity,
            v_query,
            (SELECT string_agg(format('COALESCE(rd.%I, 0) AS %I', s, s), ', ')
             FROM unnest(v_select_parts) WITH ORDINALITY AS t(expr, ord)
             CROSS JOIN LATERAL (SELECT regexp_replace(expr, '.* AS ', '') AS s) sub
             WHERE ord > (SELECT COUNT(*) FROM unnest(v_group_parts))),
            v_limit_num
        );
    ELSE
        v_query := v_query || ' ' || v_limit_part;
    END IF;

    -- 13. Execute and return
    EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t', v_query)
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================
-- DRILL DOWN v4 — com historico enriquecido
-- ============================================
CREATE OR REPLACE FUNCTION report_drill_down(
    p_config JSONB,
    p_drill_filters JSONB,
    p_date_start TIMESTAMPTZ DEFAULT NULL,
    p_date_end TIMESTAMPTZ DEFAULT NULL,
    p_product TEXT DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_source TEXT;
    v_base TEXT;
    v_select_parts TEXT[] := '{}';
    v_where_parts TEXT[] := '{}';
    v_query TEXT;
    v_result JSONB;
    v_flt JSONB;
    v_field TEXT;
    v_field_sql TEXT;
    v_value TEXT;
BEGIN
    v_source := p_config->>'source';
    v_base := _report_resolve_source(v_source);

    -- Select key columns based on source
    CASE v_source
        WHEN 'cards' THEN
            v_select_parts := ARRAY[
                'c.id', 'c.titulo', 'c.produto::text', 'c.status_comercial',
                'ps.nome AS etapa', 'pr_dono.nome AS responsavel',
                'c.valor_estimado', 'c.valor_final', 'c.receita',
                'c.created_at', 'c.data_fechamento'
            ];
        WHEN 'contatos' THEN
            v_select_parts := ARRAY[
                'c.id', 'c.nome', 'c.sobrenome', 'c.email', 'c.telefone',
                'c.tipo_cliente', 'c.origem', 'c.created_at'
            ];
        WHEN 'propostas' THEN
            v_select_parts := ARRAY[
                'p.id', 'c.titulo AS card_titulo', 'p.status',
                'p.accepted_total', 'pr.nome AS consultor', 'p.created_at'
            ];
        WHEN 'tarefas' THEN
            v_select_parts := ARRAY[
                't.id', 't.titulo', 't.tipo', 't.status', 't.prioridade',
                'pr.nome AS responsavel', 't.data_vencimento', 't.created_at'
            ];
        WHEN 'reunioes' THEN
            v_select_parts := ARRAY[
                'r.id', 'r.titulo', 'r.status', 'r.resultado',
                'pr.nome AS responsavel', 'r.data_inicio'
            ];
        WHEN 'whatsapp' THEN
            v_select_parts := ARRAY[
                'wm.id', 'wm.direction', 'wm.message_type', 'wm.fase_label',
                'wm.produto', 'ct.nome AS contato_nome', 'wm.created_at'
            ];
        WHEN 'cadencia' THEN
            v_select_parts := ARRAY[
                'ci.id', 'cdt.name AS template', 'ci.status',
                'ci.successful_contacts', 'ci.started_at'
            ];
        WHEN 'documentos' THEN
            v_select_parts := ARRAY[
                'cdr.id', 'dt.nome AS tipo_documento', 'cdr.status', 'cdr.modo',
                'c.titulo AS card_titulo'
            ];
        WHEN 'historico' THEN
            -- v4: inclui etapa anterior e produto
            v_select_parts := ARRAY[
                'hf.id', 'ps.nome AS etapa_destino', 'ps_anterior.nome AS etapa_origem',
                'c.titulo AS card_titulo', 'c.produto::text AS produto',
                'pr.nome AS movido_por',
                'ROUND(EXTRACT(EPOCH FROM hf.tempo_na_etapa_anterior) / 86400.0, 1) AS dias_na_etapa_anterior',
                'hf.data_mudanca'
            ];
        WHEN 'mensagens' THEN
            v_select_parts := ARRAY[
                'm.id', 'm.canal', 'm.lado', 'm.data_hora'
            ];
        WHEN 'equipe' THEN
            v_select_parts := ARRAY[
                'p.id', 'p.nome', 't.name AS time', 'pp.label AS fase', 'p.role'
            ];
    END CASE;

    -- Drill-down filters
    FOR v_flt IN SELECT * FROM jsonb_array_elements(COALESCE(p_drill_filters, '[]'::jsonb))
    LOOP
        v_field := v_flt->>'field';
        v_value := v_flt->>'value';
        IF _report_validate_field(v_source, v_field) THEN
            v_field_sql := _report_resolve_field_sql(v_source, v_field);
            IF v_value IS NULL THEN
                v_where_parts := array_append(v_where_parts, format('%s IS NULL', v_field_sql));
            ELSE
                v_where_parts := array_append(v_where_parts, format('%s = %L', v_field_sql, v_value));
            END IF;
        END IF;
    END LOOP;

    -- Report-level filters
    FOR v_flt IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'filters', '[]'::jsonb))
    LOOP
        v_field := v_flt->>'field';
        v_value := v_flt->>'value';
        IF _report_validate_field(v_source, v_field) THEN
            v_field_sql := _report_resolve_field_sql(v_source, v_field);
            CASE v_flt->>'operator'
                WHEN 'eq' THEN v_where_parts := array_append(v_where_parts, format('%s = %L', v_field_sql, v_value));
                WHEN 'neq' THEN v_where_parts := array_append(v_where_parts, format('%s != %L', v_field_sql, v_value));
                WHEN 'in' THEN v_where_parts := array_append(v_where_parts,
                    format('%s = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_field_sql, v_value));
                WHEN 'is_null' THEN v_where_parts := array_append(v_where_parts, format('%s IS NULL', v_field_sql));
                WHEN 'is_not_null' THEN v_where_parts := array_append(v_where_parts, format('%s IS NOT NULL', v_field_sql));
                ELSE NULL;
            END CASE;
        END IF;
    END LOOP;

    -- Global filters
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
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('cdr.created_at >= %L', p_date_start));
            ELSE NULL;
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
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('cdr.created_at < %L', p_date_end));
            ELSE NULL;
        END CASE;
    END IF;
    IF p_product IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'propostas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'whatsapp' THEN v_where_parts := array_append(v_where_parts, format('wm.produto = %L', p_product));
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'documentos' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'cadencia' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            WHEN 'mensagens' THEN v_where_parts := array_append(v_where_parts, format('c.produto::text = %L', p_product));
            ELSE NULL;
        END CASE;
    END IF;
    IF p_owner_id IS NOT NULL THEN
        CASE v_source
            WHEN 'cards' THEN v_where_parts := array_append(v_where_parts, format('c.dono_atual_id = %L', p_owner_id));
            WHEN 'tarefas' THEN v_where_parts := array_append(v_where_parts, format('t.responsavel_id = %L', p_owner_id));
            WHEN 'reunioes' THEN v_where_parts := array_append(v_where_parts, format('r.responsavel_id = %L', p_owner_id));
            WHEN 'historico' THEN v_where_parts := array_append(v_where_parts, format('hf.mudado_por = %L', p_owner_id));
            ELSE NULL;
        END CASE;
    END IF;

    -- Assemble
    v_query := 'SELECT ' || array_to_string(v_select_parts, ', ');
    v_query := v_query || ' ' || v_base;
    IF array_length(v_where_parts, 1) > 0 THEN
        v_query := v_query || ' AND ' || array_to_string(v_where_parts, ' AND ');
    END IF;
    v_query := v_query || ' ORDER BY 1 DESC LIMIT 500';

    EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (%s) t', v_query)
    INTO v_result;

    RETURN v_result;
END;
$fn$;
