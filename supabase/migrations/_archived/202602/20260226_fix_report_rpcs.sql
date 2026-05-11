-- ============================================
-- FIX: Report RPCs — Corrige 4 bugs encontrados em testes
-- 1. Sources sem WHERE (whatsapp, reunioes, documentos, cadencia, historico)
-- 2. whatsapp: phase_label -> fase_label (nome real da coluna)
-- 3. cadencia: created_at -> started_at (nome real da coluna)
-- 4. ciclo_dias: retorna NULL quando data_fechamento < created_at (dados migrados)
-- 5. drill-down: colunas específicas para todas as 11 sources
-- 6. drill-down: tratamento de drill filter com valor NULL
-- ============================================

-- FIX 1: _report_resolve_source — adiciona WHERE true em sources sem WHERE
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
                JOIN cadence_templates ct ON ct.id = ci.template_id
                JOIN cards c ON c.id = ci.card_id
                WHERE true
            ';
        WHEN 'historico' THEN
            RETURN '
                FROM historico_fases hf
                JOIN pipeline_stages ps ON ps.id = hf.etapa_nova_id
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- FIX 2: _report_validate_field — whatsapp fase_label + cadencia started_at
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
                'valor_display', 'dias_etapa', 'ciclo_dias'
            ];
        WHEN 'contatos' THEN
            v_allowed := ARRAY[
                'c.tipo_cliente', 'c.sexo', 'c.origem', 'c.created_at', 'c.primeira_venda_data', 'c.ultima_venda_data',
                'c.id', 'cs.total_trips', 'cs.total_spend'
            ];
        WHEN 'propostas' THEN
            v_allowed := ARRAY['p.status', 'c.produto', 'pr.nome', 'p.created_at', 'p.id', 'p.accepted_total'];
        WHEN 'tarefas' THEN
            v_allowed := ARRAY['t.tipo', 't.status', 't.prioridade', 't.outcome', 'pr.nome', 't.created_at', 't.data_vencimento', 't.id', 'concluidas', 'atrasadas'];
        WHEN 'reunioes' THEN
            v_allowed := ARRAY['r.status', 'r.resultado', 'pr.nome', 'r.data_inicio', 'r.id'];
        WHEN 'mensagens' THEN
            v_allowed := ARRAY['m.canal', 'm.lado', 'm.data_hora', 'm.id'];
        WHEN 'whatsapp' THEN
            v_allowed := ARRAY['wm.message_type', 'wm.direction', 'wm.fase_label', 'wm.produto', 'wm.created_at', 'wm.id', 'wm.conversation_id'];
        WHEN 'documentos' THEN
            v_allowed := ARRAY['dt.nome', 'cdr.status', 'cdr.modo', 'cdr.id'];
        WHEN 'cadencia' THEN
            v_allowed := ARRAY['ct.name', 'ci.status', 'ci.started_at', 'ci.id', 'ci.successful_contacts'];
        WHEN 'historico' THEN
            v_allowed := ARRAY['ps.nome', 'hf.data_mudanca', 'pr.nome', 'hf.id', 'hf.tempo_na_etapa_anterior'];
        WHEN 'equipe' THEN
            v_allowed := ARRAY['p.nome', 't.name', 'pp.label', 'p.role', 'p.id'];
        ELSE
            RETURN FALSE;
    END CASE;

    RETURN p_field = ANY(v_allowed);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- FIX 3: ciclo_dias — retorna NULL quando data_fechamento < created_at
CREATE OR REPLACE FUNCTION _report_resolve_field_sql(p_source TEXT, p_field TEXT)
RETURNS TEXT AS $$
BEGIN
    CASE p_field
        WHEN 'valor_display' THEN RETURN 'COALESCE(c.valor_final, c.valor_estimado)';
        WHEN 'dias_etapa' THEN RETURN 'EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at))';
        WHEN 'ciclo_dias' THEN RETURN 'CASE WHEN c.data_fechamento::timestamptz > c.created_at THEN EXTRACT(DAY FROM c.data_fechamento::timestamptz - c.created_at) ELSE NULL END';
        WHEN 'concluidas' THEN RETURN 'CASE WHEN t.concluida = true THEN 1 END';
        WHEN 'atrasadas' THEN RETURN 'CASE WHEN t.concluida = false AND t.data_vencimento < NOW() THEN 1 END';
        WHEN 'c.data_fechamento' THEN RETURN 'c.data_fechamento::timestamptz';
        WHEN 'c.data_viagem_inicio' THEN RETURN 'c.data_viagem_inicio::timestamptz';
        ELSE RETURN p_field;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- FIX 4: report_drill_down — colunas específicas para todas 11 sources + null handling
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

    -- Select key columns based on source (all 11 sources)
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
                'ci.id', 'ct.name AS template', 'ci.status',
                'ci.successful_contacts', 'ci.started_at'
            ];
        WHEN 'documentos' THEN
            v_select_parts := ARRAY[
                'cdr.id', 'dt.nome AS tipo_documento', 'cdr.status', 'cdr.modo',
                'c.titulo AS card_titulo'
            ];
        WHEN 'historico' THEN
            v_select_parts := ARRAY[
                'hf.id', 'ps.nome AS etapa_destino', 'pr.nome AS movido_por',
                'hf.tempo_na_etapa_anterior', 'hf.data_mudanca'
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

    -- Drill-down filters (from clicked chart point)
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

    -- Global filters (all sources)
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

-- FIX 5: main engine — cadencia global date filter uses started_at
-- (Already fixed in _report_resolve_source, but also fix the global date filter in report_query_engine)
-- The main engine references ci.created_at for cadencia date filters — fix to ci.started_at
-- We need to re-create report_query_engine with the fix
-- Only the global filter section at lines ~388 and ~403 need changing
