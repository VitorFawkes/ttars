-- 20260615a — "Onde estão agora" PIPELINE-PRIMEIRO + etapas reais do Active (SDR / Closer)
--
-- Pedido do Vitor (2026-06-14/15): o bloco "Onde estão agora" contava o lead por ELIMINAÇÃO de
-- marcos — então casal que já saiu do funil de vendas (foi pra gestão de convidados, produção, ou
-- ganhou por fora) caía em "Lead" e inflava o número (ex.: 101 em vez de 81 nos DW de junho).
--
-- Correção (auditada casal-a-casal, AC-only):
--   1) PIPELINE PRIMEIRO: o pipeline atual vem da ÚLTIMA etapa do Active (ww_deal_event). Se o casal
--      não está mais no funil SDR/Closer (etapa de outro funil), ele NÃO aparece em nenhuma etapa
--      de SDR/Closer. Recém-criado (sem etapa) = SDR. Quem entrou no closer (agendou/fez) = Closer.
--   2) Etapas reais por pipeline (partição estrita por casal):
--        SDR:    Lead · Reunião agendada · Reunião re-agendada · Aguardando pagamento taxa · Aguardando agendamento closer
--        Closer: Em contato · Contrato enviado · Negociação · Aguardando dados
--   3) Universo = casais ABERTOS cuja ÚLTIMA ATIVIDADE caiu no período (snapshot por data de atividade,
--      não por data de criação). Pós-Venda (ganho) fora — já tem o KPI "Casamentos fechados".
--   Sinais: marcos do casal (ww_funil_casal) + etapas cruas do Active (ww_deal_event, kind='etapa',
--   to_id = id da etapa: 61=Aguardando taxa, 201=Reagendamento SDR, 198=Reunião agendada,
--   15=Contrato enviado, 16=Em negociação, 193=Aguardando dados).
--
-- Sem mudança de assinatura → DROP + CREATE (mesmo padrão do 20260612a). REBASE conferido (TOP-5 #5):
-- bases vivas v8 (overview) / v4 (drill) de 20260612a reproduzidas verbatim; só o bloco do funil
-- (overview) e o _ww_dc + ramos de etapa no p_phase_slug (drill) mudam. Nada mais. Backend-only:
-- o frontend já publicado renderiza essas linhas como barras (uma por etapa).

-- ═══════════════ 1) ww2_overview v9 — "Onde estão agora" pipeline-primeiro ═══════════════
DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT); -- def viva 20260612a (v8)

CREATE FUNCTION public.ww2_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_convidados   TEXT[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
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
           COALESCE(c.is_perdido, FALSE)     AS is_perdido
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
            'leads',          COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
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
            'leads',          COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
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
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_taxa AND NOT fez_sdr AND NOT r_reagenda AND NOT (agendou_sdr OR r_reuniao_ag))::INT AS n FROM base
        UNION ALL SELECT 'sdr_reuniao_agendada','SDR · Reunião agendada',2,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_taxa AND NOT fez_sdr AND NOT r_reagenda AND (agendou_sdr OR r_reuniao_ag))::INT FROM base
        UNION ALL SELECT 'sdr_reuniao_reagendada','SDR · Reunião re-agendada',3,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_taxa AND NOT fez_sdr AND r_reagenda)::INT FROM base
        UNION ALL SELECT 'sdr_aguardando_taxa','SDR · Aguardando pagamento taxa',4,
               COUNT(*) FILTER (WHERE pipe='SDR' AND r_taxa)::INT FROM base
        UNION ALL SELECT 'sdr_aguardando_closer','SDR · Aguardando agendamento closer',5,
               COUNT(*) FILTER (WHERE pipe='SDR' AND NOT r_taxa AND fez_sdr)::INT FROM base
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
            SELECT COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end) AS entrou,
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
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT DISTINCT ON (c.id) c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado
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
        'fonte_marcos', 'v8 — TUDO da ww_funil_casal (mesma régua do drill); fases sem perdidos; + p_status_lead'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings v9 (20260615a) — "Onde estão agora" pipeline-primeiro: pipeline atual pela última etapa do Active (ww_deal_event), depois etapa real (SDR: Lead/Reunião agendada/re-agendada/Aguardando taxa/Aguardando agendamento closer; Closer: Em contato/Contrato enviado/Negociação/Aguardando dados); universo por data de atividade; Pós-Venda fora; resto = v8.';

-- ═══════════════ 2) ww_drill_casais v5 — drill por etapa real + pipeline-primeiro ═══════════════
DROP FUNCTION IF EXISTS public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT); -- def viva 20260612a (v4)

CREATE FUNCTION public.ww_drill_casais(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    -- marco do funil / fase atual / status
    p_marco      TEXT DEFAULT NULL,  -- entrou|marcou_sdr|fez_sdr|marcou_closer|fez_closer|ganho|perdido|aberto
    p_phase_slug TEXT DEFAULT NULL,  -- sdr|closer|pos_venda (posição atual)
    -- célula (valores únicos — clique num dado específico)
    p_faixa        TEXT DEFAULT NULL,
    p_destino      TEXT DEFAULT NULL,
    p_convidados   TEXT DEFAULT NULL,
    p_origem       TEXT DEFAULT NULL,
    p_tipo         TEXT DEFAULT NULL,
    p_campaign     TEXT DEFAULT NULL,
    p_medium       TEXT DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_motivo_role  TEXT DEFAULT NULL, -- 'sdr' | 'closer' | NULL (qualquer)
    p_consultor_id UUID DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL, -- 'aberto' | 'perdido' | NULL (todos)
    -- barra (arrays — filtros ativos da aba; convivem com os singulares via AND)
    p_origins         TEXT[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados_list TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL,
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT c.contact_id, c.deal_title, c.tipo, c.lead_created_at,
           c.faixa, c.convidados, c.destino, c.origem, c.consultor_id, c.consultor_nome,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.agendou_sdr, c.agendou_sdr_at, c.fez_sdr, c.fez_sdr_at,
           c.agendou_closer, c.agendou_closer_at, c.fez_closer, c.fez_closer_at,
           c.ganho, c.ganho_at, c.is_perdido,
           -- v5 (20260615a): etapas reais + pipeline atual (alinha com "Onde estão agora" v9)
           COALESCE(e.r_taxa,FALSE) AS r_taxa, COALESCE(e.r_reagenda,FALSE) AS r_reagenda,
           COALESCE(e.r_reuniao_ag,FALSE) AS r_reuniao_ag, COALESCE(e.r_contrato,FALSE) AS r_contrato,
           COALESCE(e.r_negoc,FALSE) AS r_negoc, COALESCE(e.r_dados,FALSE) AS r_dados,
           CASE
             WHEN c.agendou_closer OR c.fez_closer THEN 'CLO'
             WHEN e.last_stage IS NULL THEN 'SDR'
             WHEN e.last_stage = ANY(ARRAY['1','3','7','8','60','61','186','198','201']) THEN 'SDR'
             WHEN e.last_stage = ANY(ARRAY['13','14','15','16','37','163','193','221','222']) THEN 'CLO'
             ELSE 'OUT'
           END AS pipe
      FROM ww_funil_casal c
      LEFT JOIN (
          SELECT contact_id, MAX(event_ts) AS last_event_at,
                 (array_agg(to_id ORDER BY event_ts DESC) FILTER (WHERE kind='etapa' AND to_id IS NOT NULL))[1] AS last_stage,
                 bool_or(kind='etapa' AND to_id='61')  AS r_taxa,
                 bool_or(kind='etapa' AND to_id='201') AS r_reagenda,
                 bool_or(kind='etapa' AND to_id='198') AS r_reuniao_ag,
                 bool_or(kind='etapa' AND to_id='15')  AS r_contrato,
                 bool_or(kind='etapa' AND to_id='16')  AS r_negoc,
                 bool_or(kind='etapa' AND to_id='193') AS r_dados
            FROM ww_deal_event WHERE org_id = v_org_id AND kind IN ('etapa','esteira') GROUP BY contact_id
      ) e ON e.contact_id = c.contact_id
     WHERE c.org_id = v_org_id
       AND (CASE
              -- etapas reais ("Onde estão agora"): universo por DATA DE ATIVIDADE (snapshot)
              WHEN p_phase_slug IN ('sdr_lead','sdr_reuniao_agendada','sdr_reuniao_reagendada','sdr_aguardando_taxa','sdr_aguardando_closer','closer_em_contato','closer_contrato_enviado','closer_negociacao','closer_aguardando_dados')
                THEN GREATEST(c.lead_created_at, c.agendou_sdr_at, c.fez_sdr_at, c.agendou_closer_at, c.fez_closer_at, e.last_event_at) BETWEEN p_date_start AND p_date_end
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
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(lead_created_at BETWEEN p_date_start AND p_date_end, FALSE);
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
                WHEN 'entrou'        THEN NULL; -- pool já é a safra
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

    -- ── Fase atual (régua do funil "Onde estão agora" do ww2_overview v8) ──
    -- v4: perdido NÃO está em fase ativa (sai do sdr/closer), a menos que o filtro
    -- de status seja exatamente 'perdido' (aí a fase mostra onde ele parou).
    IF p_phase_slug IS NOT NULL THEN
        CASE p_phase_slug
            WHEN 'sdr'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho OR agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR NOT COALESCE(agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'pos_venda' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
            -- etapas reais SDR (pipeline-primeiro, alinhado ao agregado v9)
            WHEN 'sdr_lead'               THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'SDR' OR COALESCE(r_taxa OR fez_sdr OR r_reagenda OR agendou_sdr OR r_reuniao_ag, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_reuniao_agendada'   THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'SDR' OR COALESCE(r_taxa OR fez_sdr OR r_reagenda, FALSE) OR NOT COALESCE(agendou_sdr OR r_reuniao_ag, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_reuniao_reagendada' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'SDR' OR COALESCE(r_taxa OR fez_sdr, FALSE) OR NOT COALESCE(r_reagenda, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_aguardando_taxa'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'SDR' OR NOT COALESCE(r_taxa, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'sdr_aguardando_closer'  THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'SDR' OR COALESCE(r_taxa, FALSE) OR NOT COALESCE(fez_sdr, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            -- etapas reais Closer (pipeline-primeiro)
            WHEN 'closer_em_contato'      THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'CLO' OR COALESCE(r_dados OR r_negoc OR r_contrato, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_contrato_enviado' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'CLO' OR COALESCE(r_dados OR r_negoc, FALSE) OR NOT COALESCE(r_contrato, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_negociacao'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'CLO' OR COALESCE(r_dados, FALSE) OR NOT COALESCE(r_negoc, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer_aguardando_dados' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR pipe IS DISTINCT FROM 'CLO' OR NOT COALESCE(r_dados, FALSE) OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
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
    IF p_tipo IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS DISTINCT FROM p_tipo; END IF;
    -- consultor: dono no Active OU dono do card (Equipe conta por dono de card)
    IF p_consultor_id IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = p_consultor_id
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc5.ac_deal_id FROM ww_ac_deal_funnel_cache fc5
                                           WHERE fc5.contact_id = t.contact_id AND fc5.is_ww)
                   AND (c2.dono_atual_id = p_consultor_id OR c2.sdr_owner_id = p_consultor_id
                        OR c2.vendas_owner_id = p_consultor_id OR c2.pos_owner_id = p_consultor_id)
            ), FALSE);
    END IF;

    -- campanha / medium: qualquer deal do casal no cache (server-side; antes era client-side)
    IF p_campaign IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_campaign, '') = p_campaign);
    END IF;
    IF p_medium IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_medium, '') = p_medium);
    END IF;

    -- motivo de perda (raw do Active, mesma fonte do ww2_loss_reasons); role recorta SDR/Closer
    IF p_motivo_perda IS NOT NULL OR p_motivo_role IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww
               AND (
                    (COALESCE(p_motivo_role, 'sdr') = 'sdr'
                     AND fc.motivo_perda_sdr_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_sdr_raw = p_motivo_perda))
                 OR (COALESCE(p_motivo_role, 'closer') = 'closer'
                     AND fc.motivo_perda_closer_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_closer_raw = p_motivo_perda))
               ));
    END IF;

    -- ── Barra (arrays) ──
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_dc WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_dc WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados_list IS NOT NULL THEN DELETE FROM _ww_dc WHERE convidados IS NULL OR convidados != ALL(p_convidados_list); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = ANY(p_consultor_ids)
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc6.ac_deal_id FROM ww_ac_deal_funnel_cache fc6
                                           WHERE fc6.contact_id = t.contact_id AND fc6.is_ww)
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
               fc.ac_deal_id,
               NULLIF(fc.utm_campaign, '') AS campaign,
               NULLIF(fc.utm_medium, '')   AS medium,
               mot.motivo AS motivo_perda,
               cd.card_id, cd.valor_final, cd.contato_nome, cd.contato_telefone
          FROM _ww_dc d
          -- deal mais recente do casal: link "abrir no Active" + utm de exibição
          LEFT JOIN LATERAL (
              SELECT fc2.ac_deal_id, fc2.utm_campaign, fc2.utm_medium
                FROM ww_ac_deal_funnel_cache fc2
               WHERE fc2.contact_id = d.contact_id AND fc2.is_ww
               ORDER BY fc2.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) fc ON TRUE
          -- motivo de perda mais recente registrado (exibição)
          LEFT JOIN LATERAL (
              SELECT COALESCE(fc3.motivo_perda_closer_raw, fc3.motivo_perda_sdr_raw) AS motivo
                FROM ww_ac_deal_funnel_cache fc3
               WHERE fc3.contact_id = d.contact_id AND fc3.is_ww
                 AND (fc3.motivo_perda_closer_raw IS NOT NULL OR fc3.motivo_perda_sdr_raw IS NOT NULL)
               ORDER BY fc3.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) mot ON TRUE
          -- card do CRM (navegação /cards) + valor + contato — quando existir
          LEFT JOIN LATERAL (
              SELECT c2.id AS card_id, c2.valor_final, co.nome AS contato_nome, co.telefone AS contato_telefone
                FROM cards c2
                LEFT JOIN contatos co ON co.id = c2.pessoa_principal_id
               WHERE c2.external_source = 'active_campaign'
                 AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                 AND c2.external_id IN (SELECT fc4.ac_deal_id FROM ww_ac_deal_funnel_cache fc4
                                         WHERE fc4.contact_id = d.contact_id AND fc4.is_ww)
               ORDER BY c2.created_at DESC
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

REVOKE EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww_drill_casais IS
  'Drill-down Weddings (ww_funil_casal + ww_deal_event). v5 (20260615a): p_phase_slug aceita as etapas reais pipeline-primeiro (sdr_lead|sdr_reuniao_agendada|sdr_reuniao_reagendada|sdr_aguardando_taxa|sdr_aguardando_closer|closer_em_contato|closer_contrato_enviado|closer_negociacao|closer_aguardando_dados) com universo por data de atividade, alinhado ao ww2_overview v9; resto = v4.';
