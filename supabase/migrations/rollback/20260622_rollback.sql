-- ============================================================================
-- ROLLBACK SNAPSHOT — estado de produção ANTES das correções Analytics 2
-- Gerado automaticamente (Fase 0). DDL puro: restaura defs anteriores.
-- Para reverter: bash .claude/hooks/promote-to-prod.sh <este arquivo>
-- (ou rodar via Management API). Dropa tambem a funcao nova da Fase 2.
-- ============================================================================
BEGIN;

-- VIEW ww_funil_casal_native (def viva = 20260622c, contaminada — restaura o estado pre-fix)
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
            COALESCE(c.vendas_owner_id, c.sdr_owner_id, c.dono_atual_id) AS v_consultor_id,
                CASE
                    WHEN COALESCE(c.produto_data ->> 'ww_tipo_casamento'::text, ''::text) ~~* '%elopement%'::text THEN 'Elopement'::text
                    ELSE 'DW'::text
                END AS v_tipo,
            _ww_native_ts(c.produto_data ->> 'ww_sdr_data_reuniao'::text) AS f_sdr_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_sdr_como_reuniao'::text), ''::text) AS f_sdr_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_reuniao'::text) AS f_closer_data,
            NULLIF(TRIM(BOTH FROM c.produto_data ->> 'ww_closer_como_reuniao'::text), ''::text) AS f_closer_como,
            _ww_native_ts(c.produto_data ->> 'ww_closer_data_ganho'::text) AS f_ganho_data
           FROM cards c
             LEFT JOIN stage_entry se ON se.card_id = c.id
          WHERE c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid AND c.produto = 'WEDDING'::app_product AND c.deleted_at IS NULL
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
    b.f_ganho_data IS NOT NULL OR b.status_comercial = 'ganho'::text AS ganho,
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
    _ww_ac_norm_origem(COALESCE(NULLIF(b.produto_data ->> 'ww_sdr_como_conheceu'::text, ''::text), NULLIF(b.utm_source, ''::text))) AS origem,
    b.v_consultor_id AS consultor_id,
    p.nome AS consultor_nome,
    b.v_tipo <> 'Elopement'::text AS entrou_sdr,
    b.v_tipo = 'Elopement'::text AS entrou_elopement,
    b.v_tipo AS tipo_entrada,
    true AS entrou_valido,
    b.valor_final
   FROM base b
     LEFT JOIN profiles p ON p.id = b.v_consultor_id;
GRANT SELECT ON public.ww_funil_casal_native TO authenticated, service_role;

-- VIEW vw_ww_funnel_base_native (def pré-fix: destino_final = COALESCE(refinado, declarado))
CREATE OR REPLACE VIEW public.vw_ww_funnel_base_native AS
 SELECT n.contact_id AS ac_deal_id, n.contact_id, NULL::uuid AS pipeline_group_id,
    n.deal_title, true AS is_ww, n.sdr_agendou_at IS NOT NULL AS marcou_sdr, n.fez_sdr,
    n.closer_agendou_at IS NOT NULL AS marcou_closer, n.fez_closer, n.ganho,
    n.sdr_agendou_at, n.closer_agendou_at, n.ganho_at, n.sdr_canal, n.closer_canal,
    c.produto_data ->> 'ww_closer_valor_pacote'::text AS real_orcamento_raw,
        CASE WHEN (c.produto_data ->> 'ww_closer_valor_pacote'::text) ~ '[0-9]'::text THEN NULLIF(regexp_replace(replace(replace(c.produto_data ->> 'ww_closer_valor_pacote'::text, '.'::text, ''::text), ','::text, '.'::text), '[^0-9.]'::text, ''::text, 'g'::text), ''::text)::numeric ELSE NULL::numeric END AS real_orcamento_parsed,
    c.produto_data ->> 'ww_convidados_refinado'::text AS real_convidados_raw,
        CASE _ww2_norm_conv_strict(c.produto_data ->> 'ww_convidados_refinado'::text) WHEN 'Apenas o casal'::text THEN 2 WHEN 'Até 20'::text THEN 15 WHEN '20-50'::text THEN 35 WHEN '50-100'::text THEN 75 WHEN '+100'::text THEN 130 ELSE NULL::integer END AS real_convidados_parsed,
        CASE WHEN (c.produto_data ->> 'ww_convidados_refinado'::text) IS NOT NULL THEN 'ttars_convidados_refinado'::text ELSE NULL::text END AS real_convidados_fonte,
    c.id AS card_id, c.org_id, c.created_at AS card_created_at, c.status_comercial,
    c.valor_final, c.titulo AS card_titulo, c.sdr_owner_id, c.vendas_owner_id,
    c.pos_owner_id, c.dono_atual_id, n.faixa, n.convidados, n.destino,
    COALESCE(_ww2_norm_dest_strict(c.produto_data ->> 'ww_onde_casar_refinado'::text), n.destino) AS destino_final,
    n.origem, n.tipo,
    COALESCE(n.lead_created_at, n.sdr_agendou_at, n.closer_agendou_at, n.ganho_at) AS data_entrada
   FROM ww_funil_casal_native n JOIN cards c ON c.id = n.contact_id::uuid;

-- FUNCTION _ww_ac_norm_origem(text)
CREATE OR REPLACE FUNCTION public._ww_ac_norm_origem(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p_raw IS NULL OR p_raw = '' THEN RETURN 'Desconhecida'; END IF;
  RETURN CASE
    WHEN p_raw ILIKE '%instagram%' OR p_raw ILIKE '%insta%' OR p_raw = 'ig' OR p_raw ILIKE 'ig %' THEN 'Instagram'
    WHEN p_raw ILIKE '%leadster%' THEN 'Leadster'
    WHEN p_raw ILIKE '%facebook%' OR p_raw ILIKE '%fb%' OR p_raw ILIKE '%meta%' THEN 'Facebook/Meta'
    WHEN p_raw ILIKE '%google%' OR p_raw ILIKE '%adwords%' THEN 'Google'
    WHEN p_raw ILIKE '%site%' OR p_raw ILIKE '%formul%' OR p_raw ILIKE '%direct%' THEN 'Site direto'
    WHEN p_raw ILIKE '%indicac%' OR p_raw ILIKE '%referral%' OR p_raw ILIKE '%boca%' THEN 'Indicação'
    ELSE INITCAP(p_raw)
  END;
END $function$;

-- FUNCTION ww2_marketing_native(timestamp with time zone,timestamp with time zone,text,uuid,text[],text[],text[],text[],uuid[],text[],text[])
CREATE OR REPLACE FUNCTION public.ww2_marketing_native(p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_mn ON COMMIT DROP AS
    SELECT v.contact_id,
           v.lead_created_at                                          AS entrada_at,
           v.ganho_at,
           v.fez_sdr_at                                               AS qualif_at,
           v.valor_final                                              AS valor_pac,
           v.origem                                                   AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida')       AS campaign,
           -- 3a: medium normalizado (linktree/linketree, insta, fb…)
           COALESCE(public._ww_norm_medium(c.utm_medium), 'Desconhecido') AS medium,
           v.faixa                                                    AS faixa,
           v.tipo_entrada                                             AS tipo,
           _ww_norm_canal_strict(v.sdr_canal)                         AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal)                      AS canal_closer,
           COALESCE(v.ganho, FALSE)                                   AS fechado
      FROM ww_funil_casal_native v
      JOIN cards c ON c.id = v.contact_id::uuid
     WHERE v.org_id = v_org_id
       AND COALESCE(v.entrou_valido, FALSE)
       AND v.lead_created_at BETWEEN p_date_start AND p_date_end;

    IF p_origins      IS NOT NULL THEN DELETE FROM _ww2_mn WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas       IS NOT NULL THEN DELETE FROM _ww2_mn WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos        IS NOT NULL THEN DELETE FROM _ww2_mn WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal    IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_mn t USING ww_funil_casal_native v
         WHERE v.contact_id = t.contact_id
           AND (v.consultor_id IS NULL OR v.consultor_id != ALL(p_consultor_ids));
    END IF;

    -- POR ORIGEM (idêntico ao original — mantém "Desconhecida")
    SELECT json_agg(json_build_object(
        'origem', origem, 'leads', leads, 'qualificados', qualif, 'fechados', fechados,
        'taxa_qualif', taxa_q, 'taxa_fechamento', taxa_f, 'ticket_medio', ticket,
        'tempo_qualif_medio_dias', tempo_q
    ) ORDER BY leads DESC) INTO v_por_origem
    FROM (SELECT origem,
                 COUNT(*) AS leads,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE qualif_at IS NOT NULL)/COUNT(*),1) ELSE 0 END AS taxa_q,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa_f,
                 ROUND(COALESCE(AVG(valor_pac) FILTER (WHERE fechado AND valor_pac>0), 0)::NUMERIC, 0) AS ticket,
                 ROUND(AVG(EXTRACT(EPOCH FROM (qualif_at - entrada_at))/86400) FILTER (WHERE qualif_at IS NOT NULL AND qualif_at >= entrada_at)::NUMERIC, 1) AS tempo_q
          FROM _ww2_mn
         GROUP BY origem) x;

    -- 3b: POR CAMPAIGN — NÃO exclui mais 'Desconhecida' (totais fecham); top 15
    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_mn GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    -- 3b: POR MEDIUM — NÃO exclui mais 'Desconhecido' (totais fecham); top 10
    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_mn GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- FUNIL POR ORIGEM (top 5) — inalterado
    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_mn GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_mn;

    RETURN json_build_object(
        'por_origem',   COALESCE(v_por_origem,   '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium',   COALESCE(v_por_medium,   '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON),
        'fonte', 'native (ttars): pool = ww_funil_casal_native (cohort por lead_created_at + entrou_valido); UTM = cards.utm_* via id=contact_id; medium normalizado; desconhecidos mantidos'
    );
END $function$;

-- FUNCTION ww2_overview_native(timestamp with time zone,timestamp with time zone,text,uuid,text[],text[],text[],text[],uuid[],text[],text[],text[],text)
CREATE OR REPLACE FUNCTION public.ww2_overview_native(p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_convidados text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_window INTERVAL := p_date_end - p_date_start;
    v_prev_start TIMESTAMPTZ := p_date_start - v_window;
    v_prev_end TIMESTAMPTZ := p_date_start;
    v_kpis JSON; v_funnel JSON; v_conv JSON; v_alertas JSON;
    v_ticket NUMERIC; v_receita NUMERIC;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    -- Pool por CASAL (card), SEM corte de período. valor_final carregado p/ ticket/receita nativos.
    CREATE TEMP TABLE _ww2c ON COMMIT DROP AS
    SELECT c.contact_id, c.lead_created_at,
           COALESCE(c.agendou_sdr, FALSE)    AS agendou_sdr,    c.agendou_sdr_at,
           COALESCE(c.fez_sdr, FALSE)        AS fez_sdr,        c.fez_sdr_at,
           COALESCE(c.agendou_closer, FALSE) AS agendou_closer, c.agendou_closer_at,
           COALESCE(c.fez_closer, FALSE)     AS fez_closer,     c.fez_closer_at,
           COALESCE(c.ganho, FALSE)          AS ganho,          c.ganho_at,
           COALESCE(c.is_perdido, FALSE)     AS is_perdido,
           c.valor_final,
           c.entrou_valido AS entrada_valida
      FROM ww_funil_casal_native c
     WHERE c.org_id = v_org_id
       AND (p_origins IS NULL    OR c.origem = ANY(p_origins))
       AND (p_faixas IS NULL     OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL   OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL OR c.convidados = ANY(p_convidados))
       AND (p_tipos IS NULL      OR c.tipo_entrada = ANY(p_tipos))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       -- consultor: dono do card (nativo) — sem a perna AC do original
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    IF p_date_mode = 'throughput' THEN
        SELECT json_build_object(
            'mode', 'throughput',
            'leads',          COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
            'reunioes',       COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at BETWEEN p_date_start AND p_date_end),
            'reunioes_prev',  COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at >= v_prev_start AND fez_sdr_at < v_prev_end),
            'propostas',      COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end),
            'propostas_prev', COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at >= v_prev_start AND agendou_closer_at < v_prev_end),
            'fechados',       COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end),
            'fechados_prev',  COUNT(*) FILTER (WHERE ganho AND ganho_at >= v_prev_start AND ganho_at < v_prev_end)
        ) INTO v_kpis FROM _ww2c;
    ELSE
        -- ticket/receita nativos: valor_final dos casais GANHOS na safra (direto da view).
        SELECT ROUND(COALESCE(AVG(v), 0)::NUMERIC, 0), ROUND(COALESCE(SUM(v), 0)::NUMERIC, 0)
          INTO v_ticket, v_receita
          FROM (
            SELECT t.valor_final AS v
              FROM _ww2c t
             WHERE t.ganho AND t.lead_created_at BETWEEN p_date_start AND p_date_end
               AND t.valor_final > 0
          ) g WHERE v IS NOT NULL;
        SELECT json_build_object(
            'mode', 'cohort',
            'leads',          COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
            'reunioes',       COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND (fez_sdr OR agendou_closer OR fez_closer OR ganho)),
            'reunioes_prev',  COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND (fez_sdr OR agendou_closer OR fez_closer OR ganho)),
            'propostas',      COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND (agendou_closer OR fez_closer OR ganho)),
            'propostas_prev', COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND (agendou_closer OR fez_closer OR ganho)),
            'fechados',       COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND ganho),
            'fechados_prev',  COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND ganho),
            'ticket_medio',   v_ticket,
            'receita',        v_receita
        ) INTO v_kpis FROM _ww2c;
    END IF;

    -- FUNIL "Onde estão agora" NATIVO — UMA LINHA POR ETAPA ATIVA do pipeline WEDDING.
    -- Universo: cards ABERTOS (status_comercial NOT IN ('ganho','perdido')) classificados
    -- pela pipeline_stage_id atual. Ordenação: fase (order_index) -> etapa (ordem).
    -- Mesmas chaves do original; aqui stage_id/stage_active/is_won/is_lost = colunas reais.
    WITH stages AS (
        SELECT s.id AS stage_id, s.nome AS stage_name, s.ordem AS stage_order,
               s.ativo AS stage_active, s.is_won, s.is_lost,
               ph.slug AS phase_slug, COALESCE(ph.label, ph.name, '—') AS phase_label,
               ph.order_index AS phase_order
          FROM pipeline_stages s
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE s.pipeline_id = v_pipeline_id
           AND s.ativo IS TRUE
    ),
    cnt AS (
        SELECT c.pipeline_stage_id, COUNT(*)::INT AS n
          FROM cards c
         WHERE c.org_id = v_org_id AND c.produto = 'WEDDING' AND c.deleted_at IS NULL
           AND COALESCE(c.status_comercial, '') NOT IN ('ganho','perdido')
         GROUP BY c.pipeline_stage_id
    )
    SELECT json_agg(json_build_object(
        'phase_label', st.phase_label, 'phase_order', st.phase_order,
        'phase_slug', st.phase_slug,
        'stage_id', st.stage_id, 'stage_slug', st.stage_id::TEXT, 'stage_name', st.stage_name, 'stage_order', st.stage_order,
        'stage_active', st.stage_active, 'is_won', st.is_won, 'is_lost', st.is_lost,
        'leads_count', COALESCE(cn.n, 0)
    ) ORDER BY st.phase_order, st.stage_order) INTO v_funnel
    FROM stages st LEFT JOIN cnt cn ON cn.pipeline_stage_id = st.stage_id;

    -- CONVERSÃO ENTRE FASES — segue o MODO, por CASAL (idêntico ao original; fonte nativa).
    IF p_date_mode = 'throughput' THEN
        WITH m AS (
            SELECT COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr AND agendou_sdr_at BETWEEN p_date_start AND p_date_end) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at BETWEEN p_date_start AND p_date_end) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer AND fez_closer_at BETWEEN p_date_start AND p_date_end) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS ganho
              FROM _ww2c
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0 OR m.marcou_sdr > 0 OR m.ganho > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    ELSE
        WITH cohort AS (
            SELECT * FROM _ww2c WHERE lead_created_at BETWEEN p_date_start AND p_date_end
        ),
        m AS (
            SELECT COUNT(*) FILTER (WHERE entrada_valida) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM cohort
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    END IF;

    -- Alertas NATIVOS — cards ABERTOS parados > 7d, top 8. dias_parado = now()-último evento
    -- (GREATEST do updated_at/created_at). Sem ww_ac_deal_funnel_cache: ac_deal_id/ac_pipeline_nome = NULL.
    SELECT COALESCE(json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado,
        'ac_deal_id', ac_deal_id, 'ac_pipeline_nome', ac_pipeline_nome
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado,
               NULL::TEXT AS ac_deal_id,
               NULL::TEXT AS ac_pipeline_nome
          FROM cards c
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.org_id = v_org_id AND c.produto = 'WEDDING'
           AND c.deleted_at IS NULL AND c.archived_at IS NULL
           AND COALESCE(c.status_comercial,'') NOT IN ('ganho','perdido')
           AND COALESCE(ph.slug,'') NOT IN ('resolucao','pos_venda')
           AND GREATEST(c.updated_at, c.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at)) DESC
    ) a;

    DROP TABLE _ww2c;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', COALESCE(v_conv, '[]'::JSON),
        'alertas', COALESCE(v_alertas, '[]'::JSON),
        'fonte_marcos', 'native (ttars): marcos do log de etapas (activities.stage_changed); onde-estão = pipeline_stages ativas; alertas direto de cards'
    );
END $function$;

-- FUNCTION ww_agenda_reunioes_native(uuid,integer,integer,text[],text[],text[],text[],text[],uuid[],integer,timestamp with time zone,timestamp with time zone,text[],text[])
CREATE OR REPLACE FUNCTION public.ww_agenda_reunioes_native(p_org_id uuid DEFAULT NULL::uuid, p_dias_futuro integer DEFAULT 7, p_dias_pendentes integer DEFAULT 14, p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_dias_desfechos integer DEFAULT 30, p_date_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_atras INT := GREATEST(p_dias_pendentes, p_dias_desfechos);
    v_proximas JSON; v_pendentes JSON; v_por_dia JSON; v_desfechos JSON;
    v_desf_ini TIMESTAMPTZ := COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos));
    v_desf_fim TIMESTAMPTZ := COALESCE(p_date_end, NOW());
    v_desf_dias INT := COALESCE((EXTRACT(EPOCH FROM (COALESCE(p_date_end,NOW()) - COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos))))/86400)::INT, p_dias_desfechos);
BEGIN
    -- Universo nativo: 1 linha por casal/card, com agendou_*/fez_* do log de etapas.
    -- ac_deal_id = NULL (sem AC); card_id = contact_id::uuid (id do card na view).
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT NULL::TEXT AS ac_deal_id, w.contact_id, w.deal_title,
           w.sdr_agendou_at, w.closer_agendou_at,
           w.fez_sdr_at AS sdr_como_registrado_at, w.fez_closer_at AS closer_como_registrado_at,
           NULL::TEXT AS motivo_perda_sdr_raw, NULL::TEXT AS motivo_perda_closer_raw,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           w.sdr_canal, w.closer_canal,
           COALESCE(w.fez_sdr, FALSE) AS fez_sdr, COALESCE(w.fez_closer, FALSE) AS fez_closer,
           COALESCE(w.is_perdido, FALSE) AS is_perdido,
           w.contact_id::uuid AS card_id,
           NULL::TEXT AS curr_stage
      FROM ww_funil_casal_native w
     WHERE w.org_id = v_org
       AND (w.sdr_agendou_at    BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro)
         OR w.closer_agendou_at BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ag WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ag WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_ag WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_ag WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww_ag WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_ag WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    -- PRÓXIMAS: reuniões marcadas de agora em diante (casal não perdido)
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_proximas
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal,
               fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id, fc.consultor_nome
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at >= NOW() AND fc.sdr_agendou_at <= NOW() + make_interval(days => p_dias_futuro)
           AND NOT fc.is_perdido
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id, fc.consultor_nome
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at >= NOW() AND fc.closer_agendou_at <= NOW() + make_interval(days => p_dias_futuro)
           AND NOT fc.is_perdido
    ) x;

    -- POR DIA: futuras agrupadas pelo dia em Brasília
    SELECT COALESCE(json_agg(d ORDER BY d.dia), '[]'::JSON) INTO v_por_dia
    FROM (
        SELECT (x.quando AT TIME ZONE 'America/Sao_Paulo')::DATE AS dia,
               COUNT(*) FILTER (WHERE x.reuniao = 'sdr')    AS sdr,
               COUNT(*) FILTER (WHERE x.reuniao = 'closer') AS closer
        FROM (
            SELECT sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao FROM _ww_ag
             WHERE sdr_agendou_at >= NOW() AND sdr_agendou_at <= NOW() + make_interval(days => p_dias_futuro) AND NOT is_perdido
            UNION ALL
            SELECT closer_agendou_at, 'closer' FROM _ww_ag
             WHERE closer_agendou_at >= NOW() AND closer_agendou_at <= NOW() + make_interval(days => p_dias_futuro) AND NOT is_perdido
        ) x
        GROUP BY 1
    ) d;

    -- PENDENTES: data já passou, casal não perdido, sem registro do "como foi".
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_pendentes
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal, fc.tipo,
               fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.sdr_agendou_at)::INT AS dias_atraso
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at < NOW() AND fc.sdr_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_sdr AND NOT fc.is_perdido
           AND (fc.sdr_como_registrado_at IS NULL OR fc.sdr_como_registrado_at < fc.sdr_agendou_at - INTERVAL '24 hours')
           AND COALESCE(fc.curr_stage, '') <> '201'
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.closer_agendou_at)::INT
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at < NOW() AND fc.closer_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_closer AND NOT fc.is_perdido
           AND (fc.closer_como_registrado_at IS NULL OR fc.closer_como_registrado_at < fc.closer_agendou_at - INTERVAL '24 hours')
           AND COALESCE(fc.curr_stage, '') <> '222'
    ) x;

    -- DESFECHOS: o que aconteceu com as reuniões marcadas no período.
    CREATE TEMP TABLE _ww_desf ON COMMIT DROP AS
    SELECT x.quando, x.reuniao, x.casal, x.tipo, x.ac_deal_id, x.contact_id, x.card_id, x.motivo, x.sdr_canal, x.closer_canal,
           CASE
             WHEN x.fez THEN 'feita'
             WHEN x.reg_at IS NOT NULL AND x.reg_at >= x.quando - INTERVAL '24 hours' THEN 'nao_aconteceu'
             WHEN x.curr_stage = x.reag_stage THEN 'reagendando'
             WHEN x.is_perdido THEN 'perdida'
             ELSE 'sem_registro'
           END AS categoria
    FROM (
        SELECT sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, deal_title AS casal, tipo,
               ac_deal_id, contact_id, card_id, motivo_perda_sdr_raw AS motivo,
               fez_sdr AS fez, sdr_como_registrado_at AS reg_at, curr_stage, '201'::TEXT AS reag_stage, is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE sdr_agendou_at >= v_desf_ini AND sdr_agendou_at <= v_desf_fim
        UNION ALL
        SELECT closer_agendou_at, 'closer', deal_title, tipo, ac_deal_id, contact_id, card_id,
               motivo_perda_closer_raw, fez_closer, closer_como_registrado_at, curr_stage, '222', is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE closer_agendou_at >= v_desf_ini AND closer_agendou_at <= v_desf_fim
    ) x;

    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_desf WHERE reuniao='sdr' AND (sdr_canal IS NULL OR _ww_norm_canal_strict(sdr_canal) != ALL(p_sdr_canal)); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_desf WHERE reuniao='closer' AND (closer_canal IS NULL OR _ww_norm_canal_strict(closer_canal) != ALL(p_closer_canal)); END IF;

    SELECT json_build_object(
        'janela_dias', v_desf_dias,
        'sdr',    (SELECT json_build_object(
                       'marcadas', COUNT(*),
                       'feitas', COUNT(*) FILTER (WHERE categoria='feita'),
                       'nao_aconteceu', COUNT(*) FILTER (WHERE categoria='nao_aconteceu'),
                       'reagendando', COUNT(*) FILTER (WHERE categoria='reagendando'),
                       'perdidas', COUNT(*) FILTER (WHERE categoria='perdida'),
                       'sem_registro', COUNT(*) FILTER (WHERE categoria='sem_registro'))
                     FROM _ww_desf WHERE reuniao='sdr'),
        'closer', (SELECT json_build_object(
                       'marcadas', COUNT(*),
                       'feitas', COUNT(*) FILTER (WHERE categoria='feita'),
                       'nao_aconteceu', COUNT(*) FILTER (WHERE categoria='nao_aconteceu'),
                       'reagendando', COUNT(*) FILTER (WHERE categoria='reagendando'),
                       'perdidas', COUNT(*) FILTER (WHERE categoria='perdida'),
                       'sem_registro', COUNT(*) FILTER (WHERE categoria='sem_registro'))
                     FROM _ww_desf WHERE reuniao='closer'),
        'itens', (SELECT COALESCE(json_agg(d ORDER BY d.quando DESC), '[]'::JSON) FROM _ww_desf d)
    ) INTO v_desfechos;

    DROP TABLE _ww_ag;
    DROP TABLE _ww_desf;
    RETURN json_build_object(
        'proximas', v_proximas,
        'pendentes', v_pendentes,
        'por_dia', v_por_dia,
        'desfechos', v_desfechos,
        'gerado_em', NOW(),
        'fonte', 'native (ttars): agendou_*/fez_* do log de etapas (ww_funil_casal_native). Sem AC: ac_deal_id/motivo NULL.'
    );
END $function$;

-- FUNCTION ww_drift_combos_native(timestamp with time zone,timestamp with time zone,uuid,text,text[],text[],text[],text[])
CREATE OR REPLACE FUNCTION public.ww_drift_combos_native(p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_org_id uuid DEFAULT NULL::uuid, p_date_mode text DEFAULT 'cohort'::text, p_tipos text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT; v_total_fechados INT;
    v_top_entrada JSON;
    v_combos_fechados JSON;
    v_matriz_faixa_conv JSON;
    v_matriz_faixa_destino JSON;
    v_matriz_destino_conv JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- Conversão é SEMPRE por safra: universo = quem ENTROU no período (data_entrada).
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT v.faixa   AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           COALESCE(v.ganho, FALSE) AS fechou,
           v.ganho_at
      FROM vw_ww_funnel_base_native v
     WHERE v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end
       AND (p_tipos IS NULL        OR v.tipo = ANY(p_tipos))
       AND (p_origins IS NULL      OR v.origem = ANY(p_origins))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(v.sdr_canal::TEXT) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(v.closer_canal) = ANY(p_closer_canal));

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_dc;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e, 'qtd', qtd,
      'pct', CASE WHEN v_total_leads > 0 THEN ROUND(100.0 * qtd / v_total_leads, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_entrada
    FROM (
      SELECT faixa_e, dest_e, conv_e, COUNT(*) AS qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e,
      'fechou', fechou_qtd, 'entrou', entrou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    ) ORDER BY fechou_qtd DESC), '[]'::JSON) INTO v_combos_fechados
    FROM (
      SELECT faixa_e, dest_e, conv_e,
             COUNT(*) FILTER (WHERE fechou) AS fechou_qtd,
             COUNT(*) AS entrou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e
      HAVING COUNT(*) FILTER (WHERE fechou) > 0
       ORDER BY COUNT(*) FILTER (WHERE fechou) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', conv_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_conv
    FROM (
      SELECT faixa_e, conv_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, conv_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_destino
    FROM (
      SELECT faixa_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY faixa_e, dest_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', conv_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_destino_conv
    FROM (
      SELECT conv_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE conv_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY conv_e, dest_e
    ) g;

    DROP TABLE _ww_dc;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', 'cohort',
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'top_combos_entrada', v_top_entrada,
      'top_combos_fechados', v_combos_fechados,
      'matriz_faixa_conv', v_matriz_faixa_conv,
      'matriz_faixa_destino', v_matriz_faixa_destino,
      'matriz_destino_conv', v_matriz_destino_conv,
      'fonte_marcos', 'vw_ww_funnel_base_native (somente ttars) — conversão sempre por safra + filtros tipo/origem/canal'
    );
END $function$;

-- FUNCTION ww_drill_casais_native(timestamp with time zone,timestamp with time zone,text,uuid,text,text,text,text,text,text,text,text,text,text,text,uuid,text,text[],text[],text[],text[],text[],uuid[],text[],text[],integer,integer)
CREATE OR REPLACE FUNCTION public.ww_drill_casais_native(p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_marco text DEFAULT NULL::text, p_phase_slug text DEFAULT NULL::text, p_faixa text DEFAULT NULL::text, p_destino text DEFAULT NULL::text, p_convidados text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_campaign text DEFAULT NULL::text, p_medium text DEFAULT NULL::text, p_motivo_perda text DEFAULT NULL::text, p_motivo_role text DEFAULT NULL::text, p_consultor_id uuid DEFAULT NULL::uuid, p_status_lead text DEFAULT NULL::text, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados_list text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
    -- etapas reais "Onde estão agora" (snapshot, sem corte de período) — espelha ww2_overview v10
    v_etapas_reais TEXT[] := ARRAY['sdr_triagem','sdr_follow_up','sdr_reagendamento','sdr_qualificacao','sdr_taxa','sdr_qualificado','sdr_standby','closer_reagendamento','closer_primeira_reuniao','closer_em_contato','closer_contrato','closer_negociacao','closer_oportunidade','closer_dados','closer_standby'];
BEGIN
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT c.contact_id, c.deal_title, c.tipo, c.tipo_entrada, c.entrou_valido, c.lead_created_at,
           c.faixa, c.convidados, c.destino, c.origem, c.consultor_id, c.consultor_nome,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.agendou_sdr, c.agendou_sdr_at, c.fez_sdr, c.fez_sdr_at,
           c.agendou_closer, c.agendou_closer_at, c.fez_closer, c.fez_closer_at,
           c.ganho, c.ganho_at, c.is_perdido,
           -- v6 (20260618a): etapa ATUAL do Active (cache) — mesma régua do "Onde estão agora" v10
           cs.cur_stage AS cur
      FROM ww_funil_casal_native c
      LEFT JOIN (
          -- etapa atual NATIVA: pipeline_stage_id do card (contact_id da view = cards.id).
          -- (no nativo o overview so emite filtro por FASE sdr/closer/pos_venda — flag-based;
          --  os filtros de etapa-AC abaixo nunca chegam, ficam inertes.)
          SELECT c2.id::text AS contact_id, c2.pipeline_stage_id::text AS cur_stage
            FROM cards c2
           WHERE c2.org_id = v_org_id AND c2.produto = 'WEDDING' AND c2.deleted_at IS NULL
      ) cs ON cs.contact_id = c.contact_id
     WHERE c.org_id = v_org_id
       AND (CASE
              -- etapas reais ("Onde estão agora"): SNAPSHOT — sem corte de período (espelha v10)
              WHEN p_phase_slug = ANY(v_etapas_reais) THEN TRUE
              WHEN p_date_mode = 'throughput' AND p_marco IS NOT NULL THEN TRUE
              WHEN p_date_mode = 'throughput' THEN
                   (c.lead_created_at   BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
                OR (c.ganho_at          BETWEEN p_date_start AND p_date_end)
              ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end)
            END);

    -- ── Marco do funil ──
    IF p_marco IS NOT NULL THEN
        IF p_date_mode = 'throughput' THEN
            -- o que ACONTECEU no período: marco pela própria data (régua da ww_serie_temporal).
            -- COALESCE(..., FALSE): *_at NULL não pode escapar do corte (3-valued logic).
            CASE p_marco
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(lead_created_at BETWEEN p_date_start AND p_date_end AND entrou_valido, FALSE);
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT (COALESCE(is_perdido, FALSE) AND COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE));
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE) OR NOT COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        ELSE
            -- safra: marcos CUMULATIVOS (mesma régua do ww_funil_conversao_v1)
            CASE p_marco
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(entrou_valido, FALSE); -- 20260617: gateia por nascimento (= ww2_overview)
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer OR ganho, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        END IF;
    END IF;

    -- ── Status do lead (filtro da barra) ──
    IF p_status_lead = 'perdido' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
    ELSIF p_status_lead = 'aberto' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
    END IF;

    -- ── Fase atual / etapa real (régua do "Onde estão agora" do ww2_overview v10) ──
    -- v6: as etapas reais filtram pela ETAPA ATUAL do Active (cur = ac_current_stage_id da cache),
    -- não mais pelo last_stage da timeline (incompleta). Won/perdido fora (salvo status='perdido').
    IF p_phase_slug IS NOT NULL THEN
        CASE p_phase_slug
            WHEN 'sdr'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho OR agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR NOT COALESCE(agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'pos_venda' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
            -- etapas reais SDR (grupo 1) — cur = ac_current_stage_id
            WHEN 'sdr_triagem'              THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '1'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_follow_up'            THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '3'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_reagendamento'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '201'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_qualificacao'         THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '7'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_taxa'                 THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '61'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_qualificado'          THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '8'    OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_standby'              THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '60'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            -- etapas reais Closer (grupo 3) — cur = ac_current_stage_id
            WHEN 'closer_reagendamento'     THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '222'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_primeira_reuniao'  THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '13'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_em_contato'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '14'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_contrato'          THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '15'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_negociacao'        THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '16'   OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_oportunidade'      THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '221'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_dados'             THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '193'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_standby'           THEN DELETE FROM _ww_dc WHERE cur IS DISTINCT FROM '163'  OR COALESCE(ganho, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            ELSE NULL; -- slug desconhecido: não corta (fase de card CRM não existe no universo Active)
        END CASE;
    END IF;

    -- ── Célula (singulares). 'Não informado' = sem valor declarado (heatmaps usam COALESCE) ──
    IF p_faixa IS NOT NULL THEN
        IF p_faixa = 'Não informado' THEN DELETE FROM _ww_dc WHERE faixa IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE faixa IS DISTINCT FROM p_faixa; END IF;
    END IF;
    IF p_destino IS NOT NULL THEN
        IF p_destino = 'Não informado' THEN DELETE FROM _ww_dc WHERE destino IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE destino IS DISTINCT FROM p_destino; END IF;
    END IF;
    IF p_convidados IS NOT NULL THEN
        IF p_convidados = 'Não informado' THEN DELETE FROM _ww_dc WHERE convidados IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE convidados IS DISTINCT FROM p_convidados; END IF;
    END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS DISTINCT FROM p_origem; END IF;
    IF p_tipo IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo_entrada IS DISTINCT FROM p_tipo; END IF;
    -- consultor: dono no Active OU dono do card (Equipe conta por dono de card)
    IF p_consultor_id IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = p_consultor_id
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.id = t.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND (c2.dono_atual_id = p_consultor_id OR c2.sdr_owner_id = p_consultor_id
                        OR c2.vendas_owner_id = p_consultor_id OR c2.pos_owner_id = p_consultor_id)
            ), FALSE);
    END IF;

    -- campanha / medium: qualquer deal do casal no cache (server-side; antes era client-side)
    IF p_campaign IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM cards c2
             WHERE c2.id = t.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
               AND NULLIF(c2.utm_campaign, '') = p_campaign);
    END IF;
    IF p_medium IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM cards c2
             WHERE c2.id = t.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
               AND NULLIF(c2.utm_medium, '') = p_medium);
    END IF;

    -- motivo de perda (raw do Active, mesma fonte do ww2_loss_reasons); role recorta SDR/Closer
    -- motivo de perda NATIVO: cards.motivo_perda_id -> motivos_perda.nome (ttars tem 1 motivo
    -- por card; p_motivo_role nao se aplica e e ignorado).
    IF p_motivo_perda IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM cards c2 JOIN motivos_perda mp ON mp.id = c2.motivo_perda_id
             WHERE c2.id = t.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
               AND mp.nome = p_motivo_perda);
    END IF;

    -- ── Barra (arrays) ──
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_dc WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_dc WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados_list IS NOT NULL THEN DELETE FROM _ww_dc WHERE convidados IS NULL OR convidados != ALL(p_convidados_list); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo_entrada IS NULL OR tipo_entrada != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = ANY(p_consultor_ids)
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.id = t.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND (c2.dono_atual_id = ANY(p_consultor_ids) OR c2.sdr_owner_id = ANY(p_consultor_ids)
                        OR c2.vendas_owner_id = ANY(p_consultor_ids) OR c2.pos_owner_id = ANY(p_consultor_ids))
            ), FALSE);
    END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*) INTO v_total FROM _ww_dc;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT d.contact_id, d.deal_title, d.tipo, d.lead_created_at,
               d.faixa, d.convidados, d.destino, d.origem, d.consultor_nome,
               d.canal_sdr, d.canal_closer,
               d.agendou_sdr_at, d.fez_sdr_at, d.agendou_closer_at, d.fez_closer_at, d.ganho_at,
               d.ganho, d.is_perdido,
               COALESCE(fc.ac_deal_id, cd.card_deal_id) AS ac_deal_id,
               NULLIF(fc.utm_campaign, '') AS campaign,
               NULLIF(fc.utm_medium, '')   AS medium,
               mot.motivo AS motivo_perda,
               cd.card_id, cd.valor_final, cd.contato_nome, cd.contato_telefone
          FROM _ww_dc d
          -- exibicao NATIVA: deal id + utm vem do proprio card (contact_id = cards.id)
          LEFT JOIN LATERAL (
              SELECT c2.external_id AS ac_deal_id, c2.utm_campaign, c2.utm_medium
                FROM cards c2
               WHERE c2.id = d.contact_id::uuid AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
          ) fc ON TRUE
          -- motivo de perda NATIVO (exibicao): cards.motivo_perda_id -> motivos_perda.nome
          LEFT JOIN LATERAL (
              SELECT mp.nome AS motivo
                FROM cards c3 JOIN motivos_perda mp ON mp.id = c3.motivo_perda_id
               WHERE c3.id = d.contact_id::uuid AND c3.org_id = v_org_id AND c3.deleted_at IS NULL
          ) mot ON TRUE
          -- card do CRM (navegação /cards) + valor + contato.
          -- NATIVO: contact_id da view = cards.id -> resolve o card DIRETO pelo id.
          -- (o round-trip pela cache AC só casa quando contact_id é AC contact id; aqui não é.)
          LEFT JOIN LATERAL (
              SELECT c2.id AS card_id, c2.external_id AS card_deal_id, c2.valor_final,
                     co.nome AS contato_nome, co.telefone AS contato_telefone
                FROM cards c2
                LEFT JOIN contatos co ON co.id = c2.pessoa_principal_id
               WHERE c2.id = d.contact_id::uuid
                 AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
               LIMIT 1
          ) cd ON TRUE
         ORDER BY CASE p_marco
                    WHEN 'ganho'         THEN d.ganho_at
                    WHEN 'fez_closer'    THEN d.fez_closer_at
                    WHEN 'marcou_closer' THEN d.agendou_closer_at
                    WHEN 'fez_sdr'       THEN d.fez_sdr_at
                    WHEN 'marcou_sdr'    THEN d.agendou_sdr_at
                    ELSE d.lead_created_at
                  END DESC NULLS LAST
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww_dc;
    RETURN json_build_object('total', v_total, 'limit', p_limit, 'offset', p_offset, 'rows', COALESCE(v_rows, '[]'::JSON));
END $function$;

-- FUNCTION ww_v2_drift_venda_native(timestamp with time zone,timestamp with time zone,uuid,text[],text,text[],text[],text[])
CREATE OR REPLACE FUNCTION public.ww_v2_drift_venda_native(p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_date_mode text DEFAULT 'cohort'::text, p_tipos text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total INT; v_total_fechados INT;
    v_inv_json JSON; v_dest_json JSON; v_conv_json JSON;
    v_vendas_lista JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING nao encontrado'); END IF;

    CREATE TEMP TABLE _ww_v2_dv ON COMMIT DROP AS
    SELECT v.ac_deal_id AS id,
           v.card_titulo AS titulo,
           v.ac_deal_id,
           v.ganho_at AS data_venda,
           v.ganho AS fechou,
           v.faixa AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_orcamento_parsed IS NULL THEN NULL
             WHEN v.real_orcamento_parsed < 50000 THEN 'Até R$50 mil'
             WHEN v.real_orcamento_parsed < 80000 THEN 'R$50-80 mil'
             WHEN v.real_orcamento_parsed < 100000 THEN 'R$80-100 mil'
             WHEN v.real_orcamento_parsed < 200000 THEN 'R$100-200 mil'
             WHEN v.real_orcamento_parsed < 500000 THEN 'R$200-500 mil'
             ELSE '+R$500 mil'
           END AS faixa_v,
           CASE WHEN v.ganho THEN v.destino_final ELSE NULL END AS dest_v,
           CASE WHEN v.ganho THEN v.real_convidados_parsed ELSE NULL END AS num_convidados_real,
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_convidados_parsed IS NULL THEN NULL
             WHEN v.real_convidados_parsed <= 2 THEN 'Apenas o casal'
             WHEN v.real_convidados_parsed <= 20 THEN 'Ate 20'
             WHEN v.real_convidados_parsed <= 50 THEN '20-50'
             WHEN v.real_convidados_parsed <= 80 THEN '50-80'
             WHEN v.real_convidados_parsed <= 100 THEN '80-100'
             ELSE '+100'
           END AS conv_r,
           v.valor_final AS valor_final,
           NULL::TEXT AS monde_venda,
           v.origem,
           v.tipo AS tipo_casamento,
           _ww_norm_canal_strict(v.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal) AS canal_closer,
           v.card_titulo AS contato_nome,
           v.contact_id AS contato_external_id
    FROM vw_ww_funnel_base_native v
    WHERE CASE
      WHEN p_date_mode = 'throughput' THEN (v.ganho_at BETWEEN p_date_start AND p_date_end)
      ELSE (v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end)
    END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total, v_total_fechados FROM _ww_v2_dv;

    WITH dados AS (SELECT faixa_e, fechou, faixa_v FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE faixa_v IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu FROM dados),
    matriz AS (SELECT faixa_e, faixa_v, COUNT(*) AS qtd FROM dados WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL GROUP BY faixa_e, faixa_v)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_inv_json;

    WITH dados AS (SELECT dest_e, dest_v, fechou FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE dest_v IS NOT NULL) AS com_vendido,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e = dest_v) AS manteve,
                     COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v) AS mudou FROM dados),
    matriz AS (SELECT dest_e, dest_v, COUNT(*) AS qtd FROM dados WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL GROUP BY dest_e, dest_v),
    top_migracoes AS (SELECT dest_e AS de, dest_v AS para, COUNT(*) AS qtd FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v
         GROUP BY dest_e, dest_v ORDER BY COUNT(*) DESC LIMIT 8)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'top_migracoes', COALESCE((SELECT json_agg(row_to_json(t)) FROM top_migracoes t), '[]'::JSON))
    INTO v_dest_json;

    WITH dados AS (SELECT conv_e, fechou, conv_r, num_convidados_real FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE conv_r IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL) AS com_ambos,
                         COUNT(*) FILTER (WHERE num_convidados_real IS NOT NULL) AS com_numero_exato FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_e) = _ww_conv_ordem(conv_r)) AS manteve,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) > _ww_conv_ordem(conv_e)) AS subiu,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) < _ww_conv_ordem(conv_e)) AS desceu FROM dados),
    matriz AS (SELECT conv_e, conv_r, COUNT(*) AS qtd FROM dados WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL GROUP BY conv_e, conv_r)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_conv_json;

    SELECT json_agg(json_build_object('card_id', id, 'titulo', titulo, 'data_venda', data_venda,
        'num_convidados', num_convidados_real, 'tipo_casamento', tipo_casamento,
        'monde_venda', monde_venda, 'destino_vendido', dest_v, 'origem', origem,
        'valor_final', valor_final, 'consultor_nome', NULL::TEXT,
        'contato_nome', contato_nome, 'contato_external_id', contato_external_id,
        'ac_deal_id', ac_deal_id) ORDER BY data_venda DESC NULLS LAST, id) INTO v_vendas_lista
    FROM (SELECT * FROM _ww_v2_dv WHERE fechou LIMIT 200) sub;

    DROP TABLE _ww_v2_dv;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id, 'date_mode', p_date_mode,
        'fonte_v2', 'vw_ww_funnel_base_native (somente ttars: cards + ww_funil_casal_native)',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $function$;

-- Funcao nova da Fase 2 (se ja criada): remover no rollback
DROP FUNCTION IF EXISTS public.ww_perfil_temporal_native(timestamptz,timestamptz,uuid,text,text,text,text,text[],text[],uuid[],text[],text[],text[],text[],text[],text,integer,text[]);

COMMIT;
NOTIFY pgrst, 'reload schema';
