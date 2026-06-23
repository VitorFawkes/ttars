-- 20260623d_ww_qualidade_lead_auditoria.sql
-- ============================================================================
-- Auditoria da aba "Qualidade do Lead" (Analytics 1 = AC / Analytics 2 = native).
-- Rebaseado das defs VIVAS (pg_get_functiondef / pg_get_viewdef) em 2026-06-23.
--
-- 1) view ww_funil_casal_native: ganho passa a EXCLUIR cards em etapa is_lost
--    (Cancelado) e status_comercial='perdido'. Remove 39 falsos-ganhos
--    (ganhos all-time 92 -> 53). Afeta TODAS as abas native (correcao global).
-- 2) ww_qualidade_lead_native (Analytics 2): universo ALINHADO ao AC
--    (so leads que agendaram reuniao SDR/Closer ou ganharam) + modo throughput
--    descontinuado (forca cohort) + balde "Não informado" nas 3 tabelas.
-- 3) ww_qualidade_lead (Analytics 1 / AC): modo throughput descontinuado
--    (forca cohort) + balde "Não informado" nas 3 tabelas.
--
-- Sem mudanca de assinatura (CREATE OR REPLACE): p_event_stage_id e p_date_mode
-- continuam na assinatura por compat, mas sao ignorados (sempre cohort).
-- ============================================================================

CREATE OR REPLACE VIEW public.ww_funil_casal_native AS
 WITH stage_entry AS (
         SELECT a.card_id,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Reunião Agendada'::text) AS sdr_agendada_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Reunião Realizada'::text) AS sdr_realizada_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = '1ª Reunião'::text) AS closer_1a_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Em contato'::text) AS closer_contato_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Contrato enviado'::text) AS closer_contrato_at,
            min(a.created_at) FILTER (WHERE (a.metadata ->> 'new_stage_name'::text) = 'Em negociação'::text) AS closer_negociacao_at
           FROM activities a
          WHERE a.tipo = 'stage_changed'::text AND a.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
          GROUP BY a.card_id
        ), base AS (
         SELECT c.id,
            c.titulo,
            c.produto,
            c.pessoa_principal_id,
            c.sdr_owner_id,
            c.vendas_owner_id,
            c.pos_owner_id,
            c.concierge_owner_id,
            c.dono_atual_id,
            c.pipeline_stage_id,
            c.status_comercial,
            c.motivo_perda_id,
            c.estado_operacional,
            c.valor_estimado,
            c.valor_final,
            c.moeda,
            c.created_at,
            c.updated_at,
            c.created_by,
            c.updated_by,
            c.codigo_cliente_erp,
            c.codigo_projeto_erp,
            c.forma_pagamento,
            c.condicoes_pagamento,
            c.pronto_para_contrato,
            c.pronto_para_erp,
            c.data_pronto_erp,
            c.taxa_ativa,
            c.taxa_valor,
            c.taxa_status,
            c.taxa_data_status,
            c.taxa_meio_pagamento,
            c.taxa_codigo_transacao,
            c.taxa_alterado_por,
            c.prioridade,
            c.data_viagem_inicio,
            c.pipeline_id,
            c.produto_data,
            c.cliente_recorrente,
            c.origem,
            c.external_id,
            c.external_source,
            c.campaign_id,
            c.briefing_inicial,
            c.data_viagem_fim,
            c.stage_entered_at,
            c.parent_card_id,
            c.is_group_parent,
            c.group_capacity,
            c.group_total_revenue,
            c.group_total_pax,
            c.marketing_data,
            c.deleted_at,
            c.deleted_by,
            c.motivo_perda_comentario,
            c.data_fechamento,
            c.origem_lead,
            c.utm_source,
            c.utm_medium,
            c.utm_campaign,
            c.utm_content,
            c.utm_term,
            c.mkt_buscando_para_viagem,
            c.epoca_mes_inicio,
            c.epoca_mes_fim,
            c.epoca_ano,
            c.epoca_tipo,
            c.duracao_dias_min,
            c.duracao_dias_max,
            c.ganho_sdr,
            c.ganho_sdr_at,
            c.ganho_planner,
            c.ganho_planner_at,
            c.ganho_pos,
            c.ganho_pos_at,
            c.card_type,
            c.sub_card_mode,
            c.sub_card_status,
            c.merged_at,
            c.merged_by,
            c.merge_metadata,
            c.locked_fields,
            c.archived_at,
            c.archived_by,
            c.receita,
            c.receita_source,
            c.ai_resumo,
            c.ai_contexto,
            c.ai_responsavel,
            c.indicado_por_id,
            c.merge_config,
            c.valor_proprio,
            c.sub_card_agregado_em,
            c.sub_card_category,
            c.org_id,
            c.stage_changed_at,
            c.quality_score_pct,
            c.lead_entry_path,
            c.first_response_at,
            c.ai_pause_config,
            c.is_critical,
            c.skip_pos_venda,
            c.titulo_locked_at,
            c.sdr_qualification_score_latest,
            c.test_agent_id,
            se.sdr_agendada_at,
            se.sdr_realizada_at,
            se.closer_1a_at,
            se.closer_contato_at,
            se.closer_contrato_at,
            se.closer_negociacao_at,
            ps.is_lost AS stage_is_lost,
            COALESCE(c.vendas_owner_id, c.sdr_owner_id, c.dono_atual_id) AS v_consultor_id,
                CASE
                    WHEN COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) ~~* '%elopement%'::text OR COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) ~~* '%elopment%'::text THEN 'Elopement'::text
                    WHEN COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) = ''::text AND c.titulo ~~* 'elopement%'::text THEN 'Elopement'::text
                    ELSE 'DW'::text
                END AS v_tipo,
            _ww_native_ts(c.produto_data ->> 'ww_sdr_data_reuniao'::text) AS f_sdr_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_sdr_como_reuniao'::text), ''::text) AS f_sdr_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_reuniao'::text) AS f_closer_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_closer_como_reuniao'::text), ''::text) AS f_closer_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_ganho'::text) AS f_ganho_data
           FROM cards c
             LEFT JOIN stage_entry se ON se.card_id = c.id
             LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
          WHERE c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid AND c.produto = 'WEDDING'::app_product AND c.deleted_at IS NULL AND c.test_agent_id IS NULL AND c.titulo !~~* '%teste%'::text AND NOT (c.external_id IS NULL AND (c.titulo ~~* '%(via sofia)%'::text OR lower(btrim(c.titulo)) = 'mcqueen'::text))
        )
 SELECT b.org_id,
    b.id::text AS contact_id,
    b.titulo AS deal_title,
    b.v_tipo AS tipo,
    b.v_tipo = 'Elopement'::text AS is_elopement,
    b.created_at AS lead_created_at,
    b.closer_1a_at AS entrou_closer_at,
    b.closer_1a_at AS entrou_1a_reuniao_at,
    b.closer_contrato_at AS entrou_contrato_enviado_at,
    b.closer_negociacao_at AS entrou_negociacao_at,
    NULL::timestamp with time zone AS entrou_op_futura_at,
    NULL::timestamp with time zone AS entrou_planejamento_at,
    NULL::timestamp with time zone AS entrou_producao_at,
    NULL::timestamp with time zone AS entrou_controle_at,
    NULL::timestamp with time zone AS elopement_assinatura_at,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) AS sdr_agendou_at,
    _ww_norm_canal_strict(b.produto_data ->> 'ww_sdr_como_reuniao'::text) AS sdr_canal,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) AS closer_agendou_at,
    _ww_norm_canal_strict(b.produto_data ->> 'ww_closer_como_reuniao'::text) AS closer_canal,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) IS NOT NULL AS agendou_sdr,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at) AS agendou_sdr_at,
    b.f_sdr_como IS NOT NULL OR b.sdr_realizada_at IS NOT NULL AS fez_sdr,
    COALESCE(
        CASE
            WHEN b.f_sdr_como IS NOT NULL THEN b.f_sdr_data
            ELSE NULL::timestamp with time zone
        END, b.sdr_realizada_at, b.f_sdr_data) AS fez_sdr_at,
        CASE
            WHEN b.f_sdr_como IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars_stage_log'::text
        END AS fez_sdr_fonte,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) IS NOT NULL AS agendou_closer,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) AS agendou_closer_at,
        CASE
            WHEN b.f_closer_data IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars'::text
        END AS agendou_closer_fonte,
    b.f_closer_como IS NOT NULL OR b.closer_contato_at IS NOT NULL AS fez_closer,
    COALESCE(
        CASE
            WHEN b.f_closer_como IS NOT NULL THEN b.f_closer_data
            ELSE NULL::timestamp with time zone
        END, b.closer_contato_at) AS fez_closer_at,
        CASE
            WHEN b.f_closer_como IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars'::text
        END AS fez_closer_fonte,
    (b.f_ganho_data IS NOT NULL OR b.status_comercial = 'ganho'::text) AND NOT COALESCE(b.stage_is_lost, false) AND b.status_comercial IS DISTINCT FROM 'perdido'::text AS ganho,
    COALESCE(b.f_ganho_data,
        CASE
            WHEN b.status_comercial = 'ganho'::text THEN COALESCE(b.data_fechamento, b.ganho_planner_at, b.updated_at)
            ELSE NULL::timestamp with time zone
        END) AS ganho_at,
        CASE
            WHEN b.f_ganho_data IS NOT NULL THEN 'campo_analytics'::text
            ELSE 'ttars_status'::text
        END AS ganho_fonte,
    b.status_comercial = 'perdido'::text AS is_perdido,
    now() AS refreshed_at,
    _ww2_norm_faixa_strict(COALESCE(b.produto_data ->> 'ww_orcamento_faixa'::text, b.produto_data ->> 'ww_mkt_orcamento_form'::text)) AS faixa,
    _ww2_norm_conv_strict(COALESCE(b.produto_data ->> 'ww_num_convidados'::text, b.produto_data ->> 'ww_mkt_convidados_form'::text, b.produto_data ->> 'ww_convidados_refinado'::text)) AS convidados,
    _ww2_norm_dest_strict(COALESCE(b.produto_data ->> 'ww_destino'::text, b.produto_data ->> 'ww_mkt_destino_form'::text, b.produto_data ->> 'ww_onde_casar_refinado'::text)) AS destino,
    _ww_native_norm_origem(COALESCE(NULLIF(b.produto_data ->> 'ww_sdr_como_conheceu'::text, ''::text), NULLIF(b.utm_source, ''::text))) AS origem,
    b.v_consultor_id AS consultor_id,
    p.nome AS consultor_nome,
    b.v_tipo <> 'Elopement'::text AS entrou_sdr,
    b.v_tipo = 'Elopement'::text AS entrou_elopement,
    b.v_tipo AS tipo_entrada,
    true AS entrou_valido,
    b.valor_final
   FROM base b
     LEFT JOIN profiles p ON p.id = b.v_consultor_id;;

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead_native(p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_date_mode text DEFAULT 'cohort'::text, p_event_stage_id uuid DEFAULT NULL::uuid, p_tipos text[] DEFAULT NULL::text[], p_min_amostra integer DEFAULT 3, p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_of JSON; v_od JSON; v_oc JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_heatmap JSON; v_cruz JSON; v_evolucao JSON; v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT n.contact_id,
           n.lead_created_at AS entrada_at,
           n.ganho_at,
           n.faixa,
           n.convidados AS conv_bucket,
           n.destino,
           n.origem,
           n.tipo,
           n.sdr_canal    AS canal_sdr,
           n.closer_canal AS canal_closer,
           n.ganho        AS fechou,
           n.valor_final  AS valor_pac
    FROM ww_funil_casal_native n
    WHERE n.entrou_valido
      -- ALINHAMENTO COM ANALYTICS 1 (AC): universo = leads que agendaram reuniao SDR/Closer ou ganharam
      AND (n.sdr_agendou_at IS NOT NULL OR n.closer_agendou_at IS NOT NULL OR n.ganho)
      AND (p_org_id IS NULL OR n.org_id = p_org_id)
      -- Qualidade do lead e SEMPRE por safra (cohort), ancorada na criacao do lead.
      -- Modo throughput descontinuado (colapsava para 100%); p_event_stage_id ignorado.
      AND n.lead_created_at BETWEEN p_date_start AND p_date_end
      -- status do CASAL (uma definição de perdido pra tudo — nativo: ganho/is_perdido na view)
      AND (p_status_lead IS NULL
           OR (p_status_lead = 'perdido' AND COALESCE(n.is_perdido, FALSE))
           OR (p_status_lead = 'aberto'  AND NOT COALESCE(n.ganho, FALSE) AND NOT COALESCE(n.is_perdido, FALSE)));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', COUNT(*) FILTER (WHERE destino IS NOT NULL),
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa (ordem canônica; pequenos → outros) ──
    WITH g AS (
        SELECT faixa AS cat,
               CASE faixa WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 2
                          WHEN 'R$80-100 mil' THEN 3 WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5
                          WHEN '+R$500 mil' THEN 6 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_faixa, v_of FROM g;
    -- balde "Não informado" (faixa IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE faixa IS NULL) > 0
                THEN (v_por_faixa::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE faixa IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE faixa IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE faixa IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE faixa IS NULL AND fechou) / COUNT(*) FILTER (WHERE faixa IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_faixa END
      INTO v_por_faixa
      FROM _ww_ql;

    -- ── por_destino ──
    WITH g AS (
        SELECT destino AS cat, COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE destino IS NOT NULL GROUP BY destino
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_destino, v_od FROM g;
    -- balde "Não informado" (destino IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE destino IS NULL) > 0
                THEN (v_por_destino::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE destino IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE destino IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE destino IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE destino IS NULL AND fechou) / COUNT(*) FILTER (WHERE destino IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_destino END
      INTO v_por_destino
      FROM _ww_ql;

    -- ── por_convidados (ordem canônica) ──
    WITH g AS (
        SELECT conv_bucket AS cat,
               CASE conv_bucket WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                                WHEN '50-80' THEN 4 WHEN '50-100' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_convidados, v_oc FROM g;
    -- balde "Não informado" (conv_bucket IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE conv_bucket IS NULL) > 0
                THEN (v_por_convidados::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE conv_bucket IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE conv_bucket IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE conv_bucket IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE conv_bucket IS NULL AND fechou) / COUNT(*) FILTER (WHERE conv_bucket IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_convidados END
      INTO v_por_convidados
      FROM _ww_ql;

    -- ── conversão por tipo de reunião (universo = quem FEZ a reunião) ──
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_sdr
    FROM (SELECT canal_sdr AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_sdr IS NOT NULL GROUP BY canal_sdr) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_closer
    FROM (SELECT canal_closer AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_closer IS NOT NULL GROUP BY canal_closer) g;

    -- ── heatmap faixa × destino ──
    SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'destino', destino, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
        'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0)
    )), '[]'::json) INTO v_heatmap
    FROM (SELECT faixa, destino, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm
            FROM _ww_ql WHERE faixa IS NOT NULL AND destino IS NOT NULL
           GROUP BY faixa, destino HAVING COUNT(*) >= v_min) g;

    -- ── cruzamentos — {linha, coluna, entraram, fecharam, taxa_pct} ──
    SELECT json_build_object(
      'faixa_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND origem IS NOT NULL
               GROUP BY faixa, origem HAVING COUNT(*) >= v_min) a),
      'destino_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', destino, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT destino, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE destino IS NOT NULL AND origem IS NOT NULL
               GROUP BY destino, origem HAVING COUNT(*) >= v_min) a),
      'faixa_x_tipo', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', tipo, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, tipo, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND tipo IS NOT NULL
               GROUP BY faixa, tipo HAVING COUNT(*) >= v_min) a),
      'convidados_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', conv_bucket, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT conv_bucket, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE conv_bucket IS NOT NULL AND origem IS NOT NULL
               GROUP BY conv_bucket, origem HAVING COUNT(*) >= v_min) a)
    ) INTO v_cruz;

    -- ── evolução mensal por faixa ──
    SELECT COALESCE(json_agg(json_build_object(
        'mes', mes, 'categoria', faixa, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY mes), '[]'::json) INTO v_evolucao
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', entrada_at), 'YYYY-MM') AS mes, faixa,
                 COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa IS NOT NULL
           GROUP BY DATE_TRUNC('month', entrada_at), faixa) g;

    -- ── quem ENTRA × quem FECHA — % de entrada vs % dos fechamentos + lift ──
    WITH dims AS (
        SELECT 'faixa'::TEXT AS dim, faixa AS cat, fechou FROM _ww_ql WHERE faixa IS NOT NULL
        UNION ALL SELECT 'destino', destino, fechou FROM _ww_ql WHERE destino IS NOT NULL
        UNION ALL SELECT 'convidados', conv_bucket, fechou FROM _ww_ql WHERE conv_bucket IS NOT NULL
        UNION ALL SELECT 'origem', origem, fechou FROM _ww_ql WHERE origem IS NOT NULL
        UNION ALL SELECT 'tipo', tipo, fechou FROM _ww_ql WHERE tipo IS NOT NULL
    ),
    tot AS (SELECT dim, COUNT(*) AS t_e, COUNT(*) FILTER (WHERE fechou) AS t_f FROM dims GROUP BY dim),
    cat AS (SELECT dim, cat, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f FROM dims GROUP BY dim, cat),
    linhas AS (
        SELECT c.dim, c.cat, c.e, c.f,
               CASE WHEN t.t_e > 0 THEN ROUND(100.0 * c.e / t.t_e, 1) END AS e_pct,
               CASE WHEN t.t_f > 0 THEN ROUND(100.0 * c.f / t.t_f, 1) END AS f_pct
          FROM cat c JOIN tot t ON t.dim = c.dim
         WHERE c.e >= v_min
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::json) INTO v_comparacao
    FROM (
        SELECT dim, json_agg(json_build_object(
            'categoria', cat,
            'entrada_qtd', e, 'entrada_pct', e_pct,
            'fechou_qtd', f, 'fechou_pct', f_pct,
            'lift', CASE WHEN e_pct IS NULL OR e_pct = 0 OR f_pct IS NULL THEN NULL
                         ELSE ROUND((f_pct / e_pct)::numeric, 2) END
        ) ORDER BY e DESC) AS dados
          FROM linhas GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', 'cohort',
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', json_build_object('faixa', v_of, 'destino', v_od, 'convidados', v_oc),
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', v_heatmap,
        'cruzamentos', v_cruz,
        'evolucao_mensal_por_faixa', v_evolucao,
        'comparacao_entrada_vs_fechamento', v_comparacao,
        'fonte_marcos', 'ww_funil_casal_native (universo alinhado ao AC: leads que agendaram reuniao SDR/Closer ou ganharam; safra por data de criacao; tickets do valor_final dos fechados)'
    );
END $function$;

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead(p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_date_mode text DEFAULT 'cohort'::text, p_event_stage_id uuid DEFAULT NULL::uuid, p_tipos text[] DEFAULT NULL::text[], p_min_amostra integer DEFAULT 3, p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_of JSON; v_od JSON; v_oc JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_heatmap JSON; v_cruz JSON; v_evolucao JSON; v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww2_norm_faixa_strict(c.faixa_raw)      AS faixa,
           _ww2_norm_conv_strict(c.convidados_raw)  AS conv_bucket,
           _ww2_norm_dest_strict(c.destino_raw)     AS destino,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::text) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechou,
           c.real_orcamento_parsed AS valor_pac
    FROM ww_ac_deal_funnel_cache c
    LEFT JOIN ww_funil_casal cs ON cs.contact_id = c.contact_id
    WHERE c.is_ww
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
      -- Qualidade do lead e SEMPRE por safra (cohort). Modo throughput descontinuado
      -- (colapsava para 100%, universo virava so ganhos); p_event_stage_id ignorado.
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
      -- status do CASAL (uma definição de perdido pra tudo — 20260604b)
      AND (p_status_lead IS NULL
           OR (p_status_lead = 'perdido' AND COALESCE(cs.is_perdido, FALSE))
           OR (p_status_lead = 'aberto'  AND NOT COALESCE(cs.ganho, FALSE) AND NOT COALESCE(cs.is_perdido, FALSE)));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', COUNT(*) FILTER (WHERE destino IS NOT NULL),
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa (declarada strict; ordem canônica; pequenos → outros) ──
    WITH g AS (
        SELECT faixa AS cat,
               CASE faixa WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 2
                          WHEN 'R$80-100 mil' THEN 3 WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5
                          WHEN '+R$500 mil' THEN 6 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_faixa, v_of FROM g;
    -- balde "Não informado" (faixa IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE faixa IS NULL) > 0
                THEN (v_por_faixa::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE faixa IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE faixa IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE faixa IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE faixa IS NULL AND fechou) / COUNT(*) FILTER (WHERE faixa IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_faixa END
      INTO v_por_faixa
      FROM _ww_ql;

    -- ── por_destino (declarado strict) ──
    WITH g AS (
        SELECT destino AS cat, COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE destino IS NOT NULL GROUP BY destino
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_destino, v_od FROM g;
    -- balde "Não informado" (destino IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE destino IS NULL) > 0
                THEN (v_por_destino::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE destino IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE destino IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE destino IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE destino IS NULL AND fechou) / COUNT(*) FILTER (WHERE destino IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_destino END
      INTO v_por_destino
      FROM _ww_ql;

    -- ── por_convidados (declarado strict; ordem canônica) ──
    WITH g AS (
        SELECT conv_bucket AS cat,
               CASE conv_bucket WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                                WHEN '50-80' THEN 4 WHEN '50-100' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_convidados, v_oc FROM g;
    -- balde "Não informado" (conv_bucket IS NULL): categoria própria pra a tabela somar com o topo (auditoria 20260623d)
    SELECT CASE WHEN COUNT(*) FILTER (WHERE conv_bucket IS NULL) > 0
                THEN (v_por_convidados::jsonb || jsonb_build_array(jsonb_build_object(
                        'categoria','Não informado',
                        'entraram', COUNT(*) FILTER (WHERE conv_bucket IS NULL)::int,
                        'fecharam', COUNT(*) FILTER (WHERE conv_bucket IS NULL AND fechou)::int,
                        'taxa_pct', CASE WHEN COUNT(*) FILTER (WHERE conv_bucket IS NULL) > 0
                                         THEN ROUND(100.0 * COUNT(*) FILTER (WHERE conv_bucket IS NULL AND fechou) / COUNT(*) FILTER (WHERE conv_bucket IS NULL), 1) END,
                        'ticket_medio',0,'ticket_p25',0,'ticket_p75',0,'ticket_amostra',0)))::json
                ELSE v_por_convidados END
      INTO v_por_convidados
      FROM _ww_ql;

    -- ── conversão por tipo de reunião (universo = quem FEZ a reunião) ──
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_sdr
    FROM (SELECT canal_sdr AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_sdr IS NOT NULL GROUP BY canal_sdr) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_closer
    FROM (SELECT canal_closer AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_closer IS NOT NULL GROUP BY canal_closer) g;

    -- ── heatmap faixa × destino (era '[]' fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'destino', destino, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
        'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0)
    )), '[]'::json) INTO v_heatmap
    FROM (SELECT faixa, destino, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm
            FROM _ww_ql WHERE faixa IS NOT NULL AND destino IS NOT NULL
           GROUP BY faixa, destino HAVING COUNT(*) >= v_min) g;

    -- ── cruzamentos (eram NULL fixo) — {linha, coluna, entraram, fecharam, taxa_pct} ──
    SELECT json_build_object(
      'faixa_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND origem IS NOT NULL
               GROUP BY faixa, origem HAVING COUNT(*) >= v_min) a),
      'destino_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', destino, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT destino, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE destino IS NOT NULL AND origem IS NOT NULL
               GROUP BY destino, origem HAVING COUNT(*) >= v_min) a),
      'faixa_x_tipo', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', tipo, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, tipo, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND tipo IS NOT NULL
               GROUP BY faixa, tipo HAVING COUNT(*) >= v_min) a),
      'convidados_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', conv_bucket, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT conv_bucket, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE conv_bucket IS NOT NULL AND origem IS NOT NULL
               GROUP BY conv_bucket, origem HAVING COUNT(*) >= v_min) a)
    ) INTO v_cruz;

    -- ── evolução mensal por faixa (era NULL fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'mes', mes, 'categoria', faixa, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY mes), '[]'::json) INTO v_evolucao
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', entrada_at), 'YYYY-MM') AS mes, faixa,
                 COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa IS NOT NULL
           GROUP BY DATE_TRUNC('month', entrada_at), faixa) g;

    -- ── quem ENTRA × quem FECHA (era NULL fixo) — % de entrada vs % dos fechamentos + lift ──
    WITH dims AS (
        SELECT 'faixa'::TEXT AS dim, faixa AS cat, fechou FROM _ww_ql WHERE faixa IS NOT NULL
        UNION ALL SELECT 'destino', destino, fechou FROM _ww_ql WHERE destino IS NOT NULL
        UNION ALL SELECT 'convidados', conv_bucket, fechou FROM _ww_ql WHERE conv_bucket IS NOT NULL
        UNION ALL SELECT 'origem', origem, fechou FROM _ww_ql WHERE origem IS NOT NULL
        UNION ALL SELECT 'tipo', tipo, fechou FROM _ww_ql WHERE tipo IS NOT NULL
    ),
    tot AS (SELECT dim, COUNT(*) AS t_e, COUNT(*) FILTER (WHERE fechou) AS t_f FROM dims GROUP BY dim),
    cat AS (SELECT dim, cat, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f FROM dims GROUP BY dim, cat),
    linhas AS (
        SELECT c.dim, c.cat, c.e, c.f,
               CASE WHEN t.t_e > 0 THEN ROUND(100.0 * c.e / t.t_e, 1) END AS e_pct,
               CASE WHEN t.t_f > 0 THEN ROUND(100.0 * c.f / t.t_f, 1) END AS f_pct
          FROM cat c JOIN tot t ON t.dim = c.dim
         WHERE c.e >= v_min
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::json) INTO v_comparacao
    FROM (
        SELECT dim, json_agg(json_build_object(
            'categoria', cat,
            'entrada_qtd', e, 'entrada_pct', e_pct,
            'fechou_qtd', f, 'fechou_pct', f_pct,
            'lift', CASE WHEN e_pct IS NULL OR e_pct = 0 OR f_pct IS NULL THEN NULL
                         ELSE ROUND((f_pct / e_pct)::numeric, 2) END
        ) ORDER BY e DESC) AS dados
          FROM linhas GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', 'cohort',
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', json_build_object('faixa', v_of, 'destino', v_od, 'convidados', v_oc),
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', v_heatmap,
        'cruzamentos', v_cruz,
        'evolucao_mensal_por_faixa', v_evolucao,
        'comparacao_entrada_vs_fechamento', v_comparacao,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC; dimensões DECLARADAS strict; tickets do orçamento real dos fechados)'
    );
END $function$;


COMMENT ON FUNCTION public.ww_qualidade_lead(timestamp with time zone, timestamp with time zone, uuid, text[], text, uuid, text[], integer, text[], text[], text)
  IS 'Analytics 1 (AC) / aba Qualidade do Lead. ticket_medio = real_orcamento_parsed = ORCAMENTO DECLARADO pelo casal (Contact field 376), NAO valor de contrato. Sempre cohort (throughput descontinuado).';
