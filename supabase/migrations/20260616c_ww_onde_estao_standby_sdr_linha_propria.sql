-- 20260616c_ww_onde_estao_standby_sdr_linha_propria.sql
--
-- REGRA (Vitor, 2026-06-16): no bloco "Onde estão agora" (estoque atual por fase), os leads
-- em StandBy do SDR (etapa 60 do Active, dealGroup 1) NÃO contam nas etapas ATIVAS do SDR.
-- Viram uma linha própria "SDR · StandBy (em espera)" (ord 10, no fim do SDR).
--
-- Exclusivo: StandBy = posição ATUAL (last_stage=60). Excluído das 5 sub-etapas SDR ativas
-- (lead/reunião agendada/reagendada/aguardando taxa/aguardando closer) pra não contar 2x —
-- 7 dos 25 tinham flag de agendou/reagenda e contariam duplicado sem isso.
--
-- Só o bloco "Onde estão agora" muda. KPIs, funil de marcos e conversões intactos.
-- Base: definição VIVA de produção (pg_get_functiondef, 2026-06-16).

CREATE OR REPLACE FUNCTION public.ww2_overview(p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_convidados text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
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

    -- Pool único por CASAL, SEM corte de período (os KPIs comparam com a janela anterior).
    CREATE TEMP TABLE _ww2c ON COMMIT DROP AS
    SELECT c.contact_id, c.lead_created_at,
           COALESCE(c.agendou_sdr, FALSE)    AS agendou_sdr,    c.agendou_sdr_at,
           COALESCE(c.fez_sdr, FALSE)        AS fez_sdr,        c.fez_sdr_at,
           COALESCE(c.agendou_closer, FALSE) AS agendou_closer, c.agendou_closer_at,
           COALESCE(c.fez_closer, FALSE)     AS fez_closer,     c.fez_closer_at,
           COALESCE(c.ganho, FALSE)          AS ganho,          c.ganho_at,
           COALESCE(c.is_perdido, FALSE)     AS is_perdido,
           -- 20260616a: "entrada válida" — DW só conta se passou pela esteira SDR Weddings (group 1)
           -- do Active (porta de entrada do DW). Demais tipos (Elopement etc) contam pela porta deles.
           (c.tipo <> 'DW' OR EXISTS (
              SELECT 1 FROM ww_ac_deal_funnel_cache fcv
               WHERE fcv.contact_id = c.contact_id AND fcv.is_ww AND fcv.pipeline_group_id = 1
           )) AS entrada_valida
      FROM ww_funil_casal c
     WHERE c.org_id = v_org_id
       AND (p_origins IS NULL    OR c.origem = ANY(p_origins))
       AND (p_faixas IS NULL     OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL   OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL OR c.convidados = ANY(p_convidados))
       AND (p_tipos IS NULL      OR c.tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       -- consultor: dono no Active OU dono do card (mesma régua do ww_drill_casais)
       AND (p_consultor_ids IS NULL OR COALESCE(
              c.consultor_id = ANY(p_consultor_ids)
              OR EXISTS (
                  SELECT 1 FROM cards cc
                   WHERE cc.external_source = 'active_campaign' AND cc.org_id = v_org_id AND cc.deleted_at IS NULL
                     AND cc.external_id IN (SELECT fcx.ac_deal_id FROM ww_ac_deal_funnel_cache fcx
                                             WHERE fcx.contact_id = c.contact_id AND fcx.is_ww)
                     AND (cc.dono_atual_id = ANY(p_consultor_ids) OR cc.sdr_owner_id = ANY(p_consultor_ids)
                          OR cc.vendas_owner_id = ANY(p_consultor_ids) OR cc.pos_owner_id = ANY(p_consultor_ids))
              ), FALSE))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    IF p_date_mode = 'throughput' THEN
        -- O que ACONTECEU no período — marco pela própria data (régua do drill/série temporal)
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
        -- Safra: marcos CUMULATIVOS (chegou na etapa OU além) — mesma régua do funil v1/drill
        SELECT ROUND(COALESCE(AVG(v), 0)::NUMERIC, 0), ROUND(COALESCE(SUM(v), 0)::NUMERIC, 0)
          INTO v_ticket, v_receita
          FROM (
            SELECT (SELECT cc.valor_final FROM cards cc
                     WHERE cc.external_source = 'active_campaign' AND cc.org_id = v_org_id AND cc.deleted_at IS NULL
                       AND cc.external_id IN (SELECT fcx.ac_deal_id FROM ww_ac_deal_funnel_cache fcx
                                               WHERE fcx.contact_id = t.contact_id AND fcx.is_ww)
                       AND cc.valor_final > 0
                     ORDER BY cc.created_at DESC LIMIT 1) AS v
              FROM _ww2c t
             WHERE t.ganho AND t.lead_created_at BETWEEN p_date_start AND p_date_end
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

    -- FUNIL "Onde estão agora" v9 (20260615a) — SDR/Closer × ETAPAS REAIS do Active, pipeline-PRIMEIRO.
    -- Universo: casais ABERTOS cuja ÚLTIMA ATIVIDADE caiu no período (snapshot por data de atividade).
    -- 1º o PIPELINE atual (última etapa do Active → SDR/Closer/fora); quem saiu do funil de vendas
    -- (gestão de convidados, produção, ganho por fora) NÃO entra em etapa de SDR/Closer.
    -- 2º a etapa dentro do pipeline (partição estrita). Pós-Venda fora (já tem o KPI de fechados).
    WITH ev_agg AS (
        SELECT contact_id,
               MAX(event_ts) AS last_event_at,
               (array_agg(to_id ORDER BY event_ts DESC) FILTER (WHERE kind='etapa' AND to_id IS NOT NULL))[1] AS last_stage,
               bool_or(kind='etapa' AND to_id='61')  AS r_taxa,
               bool_or(kind='etapa' AND to_id='201') AS r_reagenda,
               bool_or(kind='etapa' AND to_id='198') AS r_reuniao_ag,
               bool_or(kind='etapa' AND to_id='15')  AS r_contrato,
               bool_or(kind='etapa' AND to_id='16')  AS r_negoc,
               bool_or(kind='etapa' AND to_id='193') AS r_dados
          FROM ww_deal_event
         WHERE org_id = v_org_id AND kind IN ('etapa','esteira')
         GROUP BY contact_id
    ),
    base AS (
        SELECT t.agendou_sdr, t.fez_sdr, t.agendou_closer, t.fez_closer,
               COALESCE(e.r_taxa,FALSE) AS r_taxa, COALESCE(e.r_reagenda,FALSE) AS r_reagenda,
               COALESCE(e.r_reuniao_ag,FALSE) AS r_reuniao_ag, COALESCE(e.r_contrato,FALSE) AS r_contrato,
               COALESCE(e.r_negoc,FALSE) AS r_negoc, COALESCE(e.r_dados,FALSE) AS r_dados,
               -- 20260616c: StandBy SDR (etapa 60 = posicao ATUAL) sai das etapas ativas e vira linha propria
               COALESCE(e.last_stage = '60', FALSE) AS r_standby,
               CASE
                 WHEN t.agendou_closer OR t.fez_closer THEN 'CLO'
                 WHEN e.last_stage IS NULL THEN 'SDR'
                 WHEN e.last_stage = ANY(ARRAY['1','3','7','8','60','61','186','198','201']) THEN 'SDR'
                 WHEN e.last_stage = ANY(ARRAY['13','14','15','16','37','163','193','221','222']) THEN 'CLO'
                 ELSE 'OUT'
               END AS pipe
          FROM _ww2c t
          LEFT JOIN ev_agg e ON e.contact_id = t.contact_id
         WHERE NOT t.ganho
           AND (p_status_lead = 'perdido' OR NOT t.is_perdido)
           AND GREATEST(t.lead_created_at, t.agendou_sdr_at, t.fez_sdr_at,
                        t.agendou_closer_at, t.fez_closer_at, e.last_event_at)
               BETWEEN p_date_start AND p_date_end
    ),
    sub AS (
        SELECT 'sdr_lead'::TEXT AS slug, 'SDR · Lead'::TEXT AS nome, 1 AS ord,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_standby AND NOT r_taxa AND NOT fez_sdr AND NOT r_reagenda AND NOT (agendou_sdr OR r_reuniao_ag))::INT AS n FROM base
        UNION ALL SELECT 'sdr_reuniao_agendada','SDR · Reunião agendada',2,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_standby AND NOT r_taxa AND NOT fez_sdr AND NOT r_reagenda AND (agendou_sdr OR r_reuniao_ag))::INT FROM base
        UNION ALL SELECT 'sdr_reuniao_reagendada','SDR · Reunião re-agendada',3,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_standby AND NOT r_taxa AND NOT fez_sdr AND r_reagenda)::INT FROM base
        UNION ALL SELECT 'sdr_aguardando_taxa','SDR · Aguardando pagamento taxa',4,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_standby AND r_taxa)::INT FROM base
        UNION ALL SELECT 'sdr_aguardando_closer','SDR · Aguardando agendamento closer',5,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_standby AND NOT r_taxa AND fez_sdr)::INT FROM base
        UNION ALL SELECT 'sdr_standby','SDR · StandBy (em espera)',10,
               COUNT(*) FILTER (WHERE pipe='SDR' AND r_standby)::INT FROM base
        UNION ALL SELECT 'closer_em_contato','Closer · Em contato',6,
               COUNT(*) FILTER (WHERE pipe='CLO' AND NOT r_dados AND NOT r_negoc AND NOT r_contrato)::INT FROM base
        UNION ALL SELECT 'closer_contrato_enviado','Closer · Contrato enviado',7,
               COUNT(*) FILTER (WHERE pipe='CLO' AND NOT r_dados AND NOT r_negoc AND r_contrato)::INT FROM base
        UNION ALL SELECT 'closer_negociacao','Closer · Negociação',8,
               COUNT(*) FILTER (WHERE pipe='CLO' AND NOT r_dados AND r_negoc)::INT FROM base
        UNION ALL SELECT 'closer_aguardando_dados','Closer · Aguardando dados',9,
               COUNT(*) FILTER (WHERE pipe='CLO' AND r_dados)::INT FROM base
    )
    SELECT json_agg(json_build_object(
        'phase_label', nome, 'phase_order', ord,
        'phase_slug', CASE WHEN slug LIKE 'sdr%' THEN 'sdr' ELSE 'closer' END,
        'stage_id', NULL::UUID, 'stage_slug', slug, 'stage_name', nome, 'stage_order', ord,
        'stage_active', TRUE, 'is_won', FALSE, 'is_lost', FALSE,
        'leads_count', n
    ) ORDER BY ord) INTO v_funnel FROM sub;

    -- CONVERSÃO ENTRE FASES — segue o MODO (v7), agora por CASAL (régua do drill).
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
            SELECT * FROM _ww2c WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end
        ),
        m AS (
            SELECT COUNT(*) AS entrou,
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

    -- Alertas — cards ABERTOS dos casais do recorte (sem perdidos/ganhos), parados > 7d, top 8.
    SELECT COALESCE(json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado,
        'ac_deal_id', ac_deal_id, 'ac_pipeline_nome', ac_pipeline_nome
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT DISTINCT ON (c.id) c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado, c.external_id AS ac_deal_id,
               CASE fc.pipeline_group_id
                 WHEN 1  THEN 'SDR Weddings'
                 WHEN 3  THEN 'Closer Weddings'
                 WHEN 4  THEN 'Planejamento Weddings'
                 WHEN 5  THEN 'Convidados'
                 WHEN 10 THEN 'Convidados - Michelly'
                 WHEN 12 THEN 'Elopment Wedding'
                 WHEN 14 THEN 'Presentes Weddings'
                 WHEN 17 THEN 'WW - Internacional'
                 WHEN 18 THEN 'WW - Gestão Casamento'
                 WHEN 19 THEN 'WW - Gestão Convidados'
                 WHEN 22 THEN 'Produção'
                 ELSE NULL
               END AS ac_pipeline_nome
          FROM _ww2c t
          JOIN ww_ac_deal_funnel_cache fc ON fc.contact_id = t.contact_id AND fc.is_ww
          JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign'
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.org_id = v_org_id AND c.deleted_at IS NULL AND c.archived_at IS NULL
           AND NOT t.is_perdido AND NOT t.ganho
           AND (c.status_comercial IS NULL OR c.status_comercial NOT IN ('ganho','perdido'))
           AND COALESCE(ph.slug,'') NOT IN ('resolucao','pos_venda')
           AND GREATEST(c.updated_at, c.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY c.id, EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at)) DESC
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
        'fonte_marcos', 'v9 (alertas+pipeline Active) — v8 — TUDO da ww_funil_casal (mesma régua do drill); fases sem perdidos; + p_status_lead'
    );
END $function$
;
