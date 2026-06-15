-- 20260615h_ww_agenda_desfechos_periodo_canal_e_alertas_pipeline.sql
--
-- P2 — Desfechos das reuniões respeitam o PERÍODO e os CANAIS do filtro da página.
--   ww_agenda_reunioes ganha p_date_start/p_date_end (janela dos desfechos) e
--   p_sdr_canal/p_closer_canal (filtro de canal só nos desfechos; próximas/pendentes são o
--   FUTURO e ficam livres). Assinatura muda → DROP + CREATE + re-grant.
--
-- P4 — Alertas (leads parados) expõem o PIPELINE do Active (ac_pipeline_nome), derivado de
--   ww_ac_deal_funnel_cache.pipeline_group_id (nomes reais dos dealGroups, verificados via API
--   do Active em 2026-06-15). ww2_overview mantém assinatura (só corpo).
--
-- Base: definição VIVA de produção (pg_get_functiondef, 2026-06-15) — guard de rebase TOP-5 #5.

DROP FUNCTION IF EXISTS public.ww_agenda_reunioes(uuid,integer,integer,text[],text[],text[],text[],text[],uuid[],integer);

CREATE OR REPLACE FUNCTION public.ww_agenda_reunioes(p_org_id uuid DEFAULT NULL::uuid, p_dias_futuro integer DEFAULT 7, p_dias_pendentes integer DEFAULT 14, p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_dias_desfechos integer DEFAULT 30, p_date_start timestamptz DEFAULT NULL, p_date_end timestamptz DEFAULT NULL, p_sdr_canal text[] DEFAULT NULL, p_closer_canal text[] DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_atras INT := GREATEST(p_dias_pendentes, p_dias_desfechos);
    v_proximas JSON; v_pendentes JSON; v_por_dia JSON; v_desfechos JSON;
    -- P2 (20260615h): desfechos respeitam o período do filtro quando passado; senão últimos p_dias_desfechos.
    v_desf_ini TIMESTAMPTZ := COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos));
    v_desf_fim TIMESTAMPTZ := COALESCE(p_date_end, NOW());
    v_desf_dias INT := COALESCE((EXTRACT(EPOCH FROM (COALESCE(p_date_end,NOW()) - COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos))))/86400)::INT, p_dias_desfechos);
BEGIN
    -- Universo: deal-level (cada agendamento tem hora própria) + dimensões/estado do casal.
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT fc.ac_deal_id, fc.contact_id, fc.deal_title,
           fc.sdr_agendou_at, fc.closer_agendou_at,
           fc.sdr_como_registrado_at, fc.closer_como_registrado_at,
           fc.motivo_perda_sdr_raw, fc.motivo_perda_closer_raw,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           w.sdr_canal, w.closer_canal,
           COALESCE(w.fez_sdr, FALSE) AS fez_sdr, COALESCE(w.fez_closer, FALSE) AS fez_closer,
           COALESCE(w.is_perdido, FALSE) AS is_perdido,
           c.id AS card_id,
           NULL::TEXT AS curr_stage
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
      LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign' AND c.deleted_at IS NULL
     WHERE fc.is_ww
       AND (fc.sdr_agendou_at    BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro)
         OR fc.closer_agendou_at BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ag WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ag WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_ag WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_ag WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww_ag WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_ag WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    -- Etapa atual (último evento de etapa na timeline) — p/ detectar "reagendando"
    UPDATE _ww_ag a SET curr_stage = e.to_id
      FROM (SELECT DISTINCT ON (ac_deal_id) ac_deal_id, to_id
              FROM ww_deal_event
             WHERE org_id = v_org AND kind = 'etapa'
               AND ac_deal_id IN (SELECT ac_deal_id FROM _ww_ag)
             ORDER BY ac_deal_id, event_ts DESC) e
     WHERE e.ac_deal_id = a.ac_deal_id;

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

    -- POR DIA (gráfico): futuras agrupadas pelo dia em Brasília
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

    -- PENDENTES: data já passou e NINGUÉM reagiu — sem registro do "como foi" (nem "não teve
    -- reunião"), sem mover pra Reagendamento, casal não perdido. É AVISO operacional (cobrar
    -- registro), não contagem. Registro vale pra ESTA reunião se veio de 24h antes dela em diante
    -- (registro mais antigo = sobra de reunião anterior remarcada, aí o aviso continua valendo).
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

    -- DESFECHOS: o que aconteceu com as reuniões marcadas dos últimos p_dias_desfechos.
    -- Categoria única por reunião, na ordem feita > nao_aconteceu > reagendando > perdida > sem_registro.
    CREATE TEMP TABLE _ww_desf ON COMMIT DROP AS
    SELECT x.quando, x.reuniao, x.casal, x.tipo, x.ac_deal_id, x.contact_id, x.card_id, x.motivo, x.sdr_canal, x.closer_canal,
           CASE
             WHEN x.fez THEN 'feita'
             -- registro sem canal real ("Não teve reunião") feito no entorno desta reunião
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

    -- P2: filtro de canal SÓ nos desfechos (passado tem canal registrado). Próximas/pendentes ficam livres.
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
        'fonte', 'ww_ac_deal_funnel_cache (campos 6/18 do Active) + estado do casal (ww_funil_casal) + timeline (ww_deal_event)'
    );
END $function$
;

REVOKE ALL ON FUNCTION public.ww_agenda_reunioes(uuid,integer,integer,text[],text[],text[],text[],text[],uuid[],integer,timestamptz,timestamptz,text[],text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agenda_reunioes(uuid,integer,integer,text[],text[],text[],text[],text[],uuid[],integer,timestamptz,timestamptz,text[],text[]) TO authenticated, service_role;

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
