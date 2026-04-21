-- ============================================================
-- MIGRATION: Substituir wm.fase_label por wm.phase_id nas funções de report
-- Date: 2026-04-19
--
-- A migration anterior (20260419_remove_fase_label.sql) dropou a coluna
-- whatsapp_messages.fase_label. Duas funções do subsistema de reports
-- ainda citavam 'wm.fase_label' no SELECT dinâmico e no allow-list —
-- se alguém invocasse report_drill_down com source='whatsapp' + filtro
-- nesse campo, a query falharia com erro 42703.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._report_validate_field(p_source text, p_field text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
            v_allowed := ARRAY['wm.message_type', 'wm.direction', 'wm.phase_id', 'wm.produto', 'wm.created_at', 'wm.id', 'wm.conversation_id'];
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
$function$;

CREATE OR REPLACE FUNCTION public.report_drill_down(p_config jsonb, p_drill_filters jsonb, p_date_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_product text DEFAULT NULL::text, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                'wm.id', 'wm.direction', 'wm.message_type', 'wm.phase_id',
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
$function$;

COMMIT;
