-- 20260617b — Funções de ENTRADA passam a gatear por entrou_valido / tipo_entrada
-- (nascimento certo). entrada_valida deixa de checar a esteira ATUAL (descartava
-- avançados) e passa a usar c.entrou_valido de ww_funil_casal. Filtro DW/Elopement
-- usa c.tipo_entrada. Depende da migration 20260617a.
-- Funções: ww2_overview, ww_funil_conversao_v1, ww_serie_temporal.

-- ╔══ ww2_overview ══╗
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
           c.entrou_valido AS entrada_valida
      FROM ww_funil_casal c
     WHERE c.org_id = v_org_id
       AND (p_origins IS NULL    OR c.origem = ANY(p_origins))
       AND (p_faixas IS NULL     OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL   OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL OR c.convidados = ANY(p_convidados))
       AND (p_tipos IS NULL      OR c.tipo_entrada = ANY(p_tipos))
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
    WITH cur_stage_agg AS (
        -- 20260616f: etapa ATUAL do casal vinda da cache (deal.stage do Active, confiável).
        -- Prioriza o deal da esteira SDR Weddings (group 1); senão o mais recente.
        SELECT DISTINCT ON (contact_id) contact_id, ac_current_stage_id AS cur_stage
          FROM ww_ac_deal_funnel_cache
         WHERE is_ww AND ac_current_stage_id IS NOT NULL
         ORDER BY contact_id, (pipeline_group_id = 1) DESC, synced_at DESC
    ),
    ev_agg AS (
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
        -- 20260616f: posição ATUAL (pipe, sub-etapa, standby) vem da etapa atual da cache (cs.cur_stage),
        -- não mais do last_stage da timeline (incompleta). Flags de posição derivadas de cur_stage.
        SELECT t.agendou_sdr, t.fez_sdr, t.agendou_closer, t.fez_closer,
               (cs.cur_stage = '61')  AS r_taxa,
               (cs.cur_stage = '201') AS r_reagenda,
               (cs.cur_stage = '198') AS r_reuniao_ag,
               (cs.cur_stage = '15')  AS r_contrato,
               (cs.cur_stage = '16')  AS r_negoc,
               (cs.cur_stage IN ('193','163')) AS r_dados,
               (cs.cur_stage = '60')  AS r_standby,
               cs.cur_stage AS cur,
               -- 20260616i: "Onde estão agora" = ESTADO ATUAL. Classifica pela ETAPA ATUAL (cur_stage),
               -- não pelo histórico de closer. Casal cuja etapa atual está FORA de SDR/Closer
               -- (Convidados, Planejamento, Elopment, Produção…) vira 'OUT' e NÃO aparece.
               CASE
                 WHEN cs.cur_stage = '60' THEN 'STANDBY'
                 WHEN cs.cur_stage = ANY(ARRAY['1','3','7','8','61','186','198','201']) THEN 'SDR'
                 WHEN cs.cur_stage = ANY(ARRAY['13','14','15','16','163','193','221','222']) THEN 'CLO'
                 WHEN cs.cur_stage IS NOT NULL THEN 'OUT'   -- etapa de outro pipeline → fora do bloco
                 WHEN t.agendou_closer OR t.fez_closer THEN 'CLO'   -- sem etapa conhecida: fallback histórico
                 ELSE 'SDR'
               END AS pipe
          FROM _ww2c t
          LEFT JOIN ev_agg e ON e.contact_id = t.contact_id
          LEFT JOIN cur_stage_agg cs ON cs.contact_id = t.contact_id
         WHERE NOT t.ganho
           AND (p_status_lead = 'perdido' OR NOT t.is_perdido)
           -- 20260616i: SEM filtro de período — snapshot do estado atual (independe do recorte de tempo).
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
               COUNT(*) FILTER (WHERE pipe='STANDBY')::INT FROM base
        UNION ALL SELECT 'closer_em_contato','Closer · Em contato',6,
               COUNT(*) FILTER (WHERE pipe='CLO' AND cur IN ('14','13','222'))::INT FROM base
        UNION ALL SELECT 'closer_contrato_enviado','Closer · Contrato enviado',7,
               COUNT(*) FILTER (WHERE pipe='CLO' AND cur='15')::INT FROM base
        UNION ALL SELECT 'closer_negociacao','Closer · Negociação',8,
               COUNT(*) FILTER (WHERE pipe='CLO' AND cur='16')::INT FROM base
        UNION ALL SELECT 'closer_aguardando_dados','Closer · Aguardando dados',9,
               COUNT(*) FILTER (WHERE pipe='CLO' AND cur IN ('193','163'))::INT FROM base
        UNION ALL SELECT 'closer_oportunidade_futura','Closer · Oportunidade futura',11,
               COUNT(*) FILTER (WHERE pipe='CLO' AND cur='221')::INT FROM base
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
            -- 20260616e: cohort COMPLETO (todos os DW do período). entrada_valida (só SDR Weddings)
            -- gateia APENAS o "Entrou" — os marcos de baixo mostram a realidade (não zeram).
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
END $function$;

-- ╔══ ww_funil_conversao_v1 ══╗
CREATE OR REPLACE FUNCTION public.ww_funil_conversao_v1(p_date_start timestamp with time zone DEFAULT (now() - '90 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_faixas text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_bt INT:=0; v_ft INT:=0; v_df INT; v_dc INT; v_dd INT; v_ac JSON;
BEGIN
    -- ⚠️ Filtro de canal redefine o universo: só casais que FIZERAM a reunião por aquele canal.
    --    As etapas anteriores à reunião ficam triviais (100%) — a leitura útil é DALI PRA FRENTE.
    -- throughput: cada marco conta pela DATA do próprio evento na janela (régua do ww2_overview/drill).
    -- cohort:     safra criada na janela; marcos CUMULATIVOS (chegou na etapa OU além — 20260531e).
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           -- 20260616a: DW só "entra" se passou pela esteira SDR Weddings (group 1) no Active.
           c.entrou_valido AS entrada_valida,
           COALESCE(c.lead_created_at BETWEEN p_date_start AND p_date_end, FALSE) AS m_entrou,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_sdr    AND c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_sdr OR c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS m_msdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_sdr        AND c.fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS m_fsdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_closer AND c.agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS m_mclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_closer     AND c.fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_closer OR c.ganho, FALSE) END AS m_fclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.ganho          AND c.ganho_at          BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.ganho, FALSE) END AS m_g
      FROM ww_funil_casal c
     WHERE c.org_id = v_org
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at    BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at     BETWEEN p_date_start AND p_date_end)
               OR (c.fez_sdr_at         BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at  BETWEEN p_date_start AND p_date_end)
               OR (c.fez_closer_at      BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at           BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_tipos IS NULL         OR c.tipo_entrada = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    SELECT COUNT(*) FILTER (WHERE entrada_valida AND m_entrou) INTO v_bt FROM _pool;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE entrada_valida AND m_entrou),
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo),
        'ganho',         COUNT(*) FILTER (WHERE m_g)) INTO v_baseline FROM _pool;

    CREATE TEMP TABLE _filt ON COMMIT DROP AS
    SELECT * FROM _pool
     WHERE (p_faixas IS NULL     OR faixa = ANY(p_faixas))
       AND (p_convidados IS NULL OR convidados = ANY(p_convidados))
       AND (p_destinos IS NULL   OR destino = ANY(p_destinos));
    SELECT COUNT(*) FILTER (WHERE entrada_valida AND m_entrou) INTO v_ft FROM _filt;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE entrada_valida AND m_entrou),
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo),
        'ganho',         COUNT(*) FILTER (WHERE m_g)) INTO v_filtrado FROM _filt;

    SELECT COUNT(DISTINCT faixa) FILTER (WHERE faixa IS NOT NULL),
           COUNT(DISTINCT convidados) FILTER (WHERE convidados IS NOT NULL),
           COUNT(DISTINCT destino) FILTER (WHERE destino IS NOT NULL)
      INTO v_df, v_dc, v_dd FROM _pool;

    SELECT json_build_object('last_event_at', MAX(processed_at),
        'minutes_ago', CASE WHEN MAX(processed_at) IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW()-MAX(processed_at)))/60.0 END,
        'status', CASE WHEN MAX(processed_at) IS NULL THEN 'unknown'
            WHEN NOW()-MAX(processed_at) < INTERVAL '10 minutes' THEN 'recent'
            WHEN NOW()-MAX(processed_at) < INTERVAL '60 minutes' THEN 'stale' ELSE 'very_stale' END
    ) INTO v_ac FROM integration_events
    WHERE entity_type='deal' AND processed_at IS NOT NULL AND created_at > NOW()-INTERVAL '24 hours';

    DROP TABLE _pool; DROP TABLE _filt;
    RETURN json_build_object(
        'periodo', json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'pipeline_id', NULL, 'org_id', v_org,
        'filtros_aplicados', json_build_object('faixas',p_faixas,'convidados',p_convidados,'destinos',p_destinos,'origins',p_origins,'tipos',p_tipos,'consultor_ids',p_consultor_ids,'sdr_canal',p_sdr_canal,'closer_canal',p_closer_canal),
        'ac_sync', v_ac, 'baseline', v_baseline, 'filtrado', v_filtrado,
        'baseline_total', v_bt, 'filtrado_total', v_ft,
        'distincts_disponiveis', json_build_object('faixas',v_df,'convidados',v_dc,'destinos',v_dd),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas,1)>0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados,1)>0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos,1)>0));
END $function$;

-- ╔══ ww_serie_temporal ══╗
CREATE OR REPLACE FUNCTION public.ww_serie_temporal(p_date_start timestamp with time zone DEFAULT (now() - '1 year'::interval), p_date_end timestamp with time zone DEFAULT now(), p_granularidade text DEFAULT 'month'::text, p_org_id uuid DEFAULT NULL::uuid, p_date_mode text DEFAULT 'throughput'::text, p_incluir_elopement boolean DEFAULT true, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_tipos text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org   UUID := COALESCE(p_org_id, requesting_org_id());
    v_trunc TEXT := CASE WHEN p_granularidade = 'day' THEN 'day' WHEN p_granularidade = 'week' THEN 'week' ELSE 'month' END;
    v_step  INTERVAL := CASE WHEN p_granularidade = 'day' THEN INTERVAL '1 day' WHEN p_granularidade = 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END;
    v_lblfmt TEXT := CASE WHEN p_granularidade IN ('day','week') THEN 'DD/MM' ELSE 'MM/YYYY' END;
    v_series JSON;
    v_tot_e INT; v_tot_ms INT; v_tot_s INT; v_tot_mc INT; v_tot_c INT; v_tot_g INT;
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT lead_created_at,
           agendou_sdr, agendou_sdr_at, fez_sdr, fez_sdr_at,
           agendou_closer, agendou_closer_at, fez_closer, fez_closer_at,
           ganho, ganho_at,
           -- 20260616k: DW só "entra" se passou pela esteira SDR Weddings (group 1) — mesma régua
           -- do ww2_overview/funil. Gateia SÓ o "entrou"; demais marcos seguem a realidade.
           c.entrou_valido AS entrada_valida
      FROM ww_funil_casal c
     WHERE c.org_id = v_org
       AND (p_incluir_elopement OR c.tipo_entrada IS DISTINCT FROM 'Elopement')
       AND (p_tipos IS NULL         OR c.tipo_entrada = ANY(p_tipos))
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    IF p_date_mode = 'cohort' THEN
        -- SAFRA: marcos CUMULATIVOS (mesma régua do ww_funil_conversao_v1 e do drill)
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        agg AS (
            SELECT date_trunc(v_trunc, lead_created_at) AS b,
                   COUNT(*) FILTER (WHERE entrada_valida) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM _pool
             WHERE lead_created_at BETWEEN p_date_start AND p_date_end
             GROUP BY 1
        )
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',        COALESCE(a.entrou, 0),
                   'marcou_sdr',    COALESCE(a.marcou_sdr, 0),
                   'fez_sdr',       COALESCE(a.fez_sdr, 0),
                   'marcou_closer', COALESCE(a.marcou_closer, 0),
                   'fez_closer',    COALESCE(a.fez_closer, 0),
                   'ganho',         COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    ELSE
        -- THROUGHPUT: cada marco pela própria data
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        ev AS (
            SELECT date_trunc(v_trunc, lead_created_at) b, 1 e, 0 ms, 0 s, 0 mc, 0 c, 0 g FROM _pool WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, agendou_sdr_at),    0,1,0,0,0,0 FROM _pool WHERE agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_sdr_at),        0,0,1,0,0,0 FROM _pool WHERE fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, agendou_closer_at), 0,0,0,1,0,0 FROM _pool WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_closer_at),     0,0,0,0,1,0 FROM _pool WHERE fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, ganho_at),          0,0,0,0,0,1 FROM _pool WHERE ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end
        ),
        agg AS (SELECT b, SUM(e) entrou, SUM(ms) marcou_sdr, SUM(s) fez_sdr, SUM(mc) marcou_closer, SUM(c) fez_closer, SUM(g) ganho FROM ev GROUP BY b)
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',        COALESCE(a.entrou, 0),
                   'marcou_sdr',    COALESCE(a.marcou_sdr, 0),
                   'fez_sdr',       COALESCE(a.fez_sdr, 0),
                   'marcou_closer', COALESCE(a.marcou_closer, 0),
                   'fez_closer',    COALESCE(a.fez_closer, 0),
                   'ganho',         COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    END IF;

    -- Totais do período (mesma régua de modo)
    IF p_date_mode = 'cohort' THEN
        SELECT COUNT(*) FILTER (WHERE entrada_valida),
               COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE fez_closer OR ganho),
               COUNT(*) FILTER (WHERE ganho)
          INTO v_tot_e, v_tot_ms, v_tot_s, v_tot_mc, v_tot_c, v_tot_g
          FROM _pool WHERE lead_created_at BETWEEN p_date_start AND p_date_end;
    ELSE
        SELECT COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end)
          INTO v_tot_e, v_tot_ms, v_tot_s, v_tot_mc, v_tot_c, v_tot_g FROM _pool;
    END IF;

    DROP TABLE _pool;
    RETURN json_build_object(
        'granularidade', v_trunc,
        'date_mode', p_date_mode,
        'series', COALESCE(v_series, '[]'::JSON),
        'totais', json_build_object(
            'entrou', v_tot_e, 'marcou_sdr', v_tot_ms, 'fez_sdr', v_tot_s,
            'marcou_closer', v_tot_mc, 'fez_closer', v_tot_c, 'ganho', v_tot_g)
    );
END $function$;
