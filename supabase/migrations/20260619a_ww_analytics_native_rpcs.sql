-- 20260619a_ww_analytics_native_rpcs.sql
-- =============================================================================
-- WEDDINGS ANALYTICS — clones NATIVOS (ttars) das 5 RPCs hoje alimentadas pelo
-- Active Campaign (ww_funil_casal + ww_ac_deal_funnel_cache).
--
-- Objetivo: reconstruir a MESMA interface de dados a partir do funil NATIVO do
-- ttars (cards + log de mudança de etapa em activities tipo='stage_changed').
--
-- 1) VIEW  ww_funil_casal_native  — 1 linha por card WEDDING, mesma lista de
--    colunas de ww_funil_casal (colunas não usadas preenchidas com NULL::tipo),
--    mas com marcos reconstruídos FORWARD-ONLY a partir do log de etapas.
-- 2) 5 RPCs *_native com assinatura e shape de JSON IDÊNTICOS aos originais,
--    trocando APENAS a fonte de dados:
--      - ww_funil_conversao_v1_native / ww_serie_temporal_native:
--        clone mecânico (ww_funil_casal -> ww_funil_casal_native).
--      - ww2_overview_native: kpis/conversoes da view nativa; bloco "funnel"
--        ("onde estão agora") reconstruído sobre pipeline_stages ATIVAS do
--        pipeline WEDDING; alertas direto de cards (sem ww_ac_deal_funnel_cache).
--      - ww_agenda_reunioes_native / ww_agendamentos_por_dia_native:
--        timestamps SDR/Closer vindos do log de etapas (agendou_*/fez_*).
--
-- Constantes WEDDING:
--   org_id      b0000000-0000-0000-0000-000000000002
--   pipeline_id f4611f84-ce9c-48ad-814b-dcd6081f15db
--   fase SDR    545a78f5-e58b-48a7-980a-e2a2652dc755
--   fase Closer c314b65d-4271-4ac2-8b4d-0694630deb3a
--   fase pos    775a7a1c-3959-4e0d-8454-1063c4fba144
--
-- Etapas do funil (nomes em activities.metadata->>'new_stage_name'):
--   SDR:    Novo Lead, Tentativa de Contato, Conectado, Reunião Agendada, Reunião Realizada
--   Closer: 1ª Reunião, Em contato, Contrato enviado, Em negociação, Contrato Assinado
--
-- Não persiste nada além das definições; self-test feito via BEGIN/ROLLBACK.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- STEP 1 — VIEW ww_funil_casal_native
-- -----------------------------------------------------------------------------
-- "entered stage X at" = MIN(created_at) das activities tipo='stage_changed' com
-- metadata->>'new_stage_name' = X, por card. Calculado em um único agregado
-- (CTE stage_entry) com FILTER por nome, evitando N subqueries.
CREATE OR REPLACE VIEW public.ww_funil_casal_native AS
WITH stage_entry AS (
    SELECT a.card_id,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Reunião Agendada')  AS sdr_agendada_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Reunião Realizada') AS sdr_realizada_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = '1ª Reunião')         AS closer_1a_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Em contato')         AS closer_contato_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Contrato enviado')   AS closer_contrato_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Em negociação')      AS closer_negociacao_at
      FROM activities a
     WHERE a.tipo = 'stage_changed'
       AND a.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
     GROUP BY a.card_id
),
base AS (
    SELECT c.*,
           se.sdr_agendada_at,
           se.sdr_realizada_at,
           se.closer_1a_at,
           se.closer_contato_at,
           se.closer_contrato_at,
           se.closer_negociacao_at,
           COALESCE(c.vendas_owner_id, c.sdr_owner_id, c.dono_atual_id) AS v_consultor_id,
           CASE WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopement%'
                THEN 'Elopement' ELSE 'DW' END AS v_tipo
      FROM cards c
      LEFT JOIN stage_entry se ON se.card_id = c.id
     WHERE c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
       AND c.produto = 'WEDDING'
       AND c.deleted_at IS NULL
)
SELECT
    b.org_id                                                          AS org_id,
    b.id::text                                                        AS contact_id,
    b.titulo                                                          AS deal_title,
    b.v_tipo                                                          AS tipo,
    (b.v_tipo = 'Elopement')                                          AS is_elopement,
    b.created_at                                                      AS lead_created_at,
    -- entrou_* timestamps que os corpos das RPCs eventualmente referenciam
    b.closer_1a_at                                                    AS entrou_closer_at,
    b.closer_1a_at                                                    AS entrou_1a_reuniao_at,
    b.closer_contrato_at                                              AS entrou_contrato_enviado_at,
    b.closer_negociacao_at                                            AS entrou_negociacao_at,
    NULL::timestamptz                                                 AS entrou_op_futura_at,
    NULL::timestamptz                                                 AS entrou_planejamento_at,
    NULL::timestamptz                                                 AS entrou_producao_at,
    NULL::timestamptz                                                 AS entrou_controle_at,
    NULL::timestamptz                                                 AS elopement_assinatura_at,
    -- "sdr_agendou_at"/"closer_agendou_at" são lidos pela agenda original p/ timing
    b.sdr_agendada_at                                                 AS sdr_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_sdr_como_reuniao')     AS sdr_canal,
    COALESCE(b.ganho_sdr_at, b.closer_1a_at)                          AS closer_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_closer_como_reuniao')  AS closer_canal,
    -- marcos SDR
    (b.sdr_agendada_at IS NOT NULL)                                   AS agendou_sdr,
    b.sdr_agendada_at                                                 AS agendou_sdr_at,
    (b.sdr_realizada_at IS NOT NULL)                                  AS fez_sdr,
    b.sdr_realizada_at                                                AS fez_sdr_at,
    'ttars_stage_log'::text                                           AS fez_sdr_fonte,
    -- marcos Closer
    (COALESCE(b.ganho_sdr_at, b.closer_1a_at) IS NOT NULL)            AS agendou_closer,
    COALESCE(b.ganho_sdr_at, b.closer_1a_at)                          AS agendou_closer_at,
    'ttars'::text                                                     AS agendou_closer_fonte,
    (b.closer_contato_at IS NOT NULL)                                 AS fez_closer,
    b.closer_contato_at                                               AS fez_closer_at,
    'ttars'::text                                                     AS fez_closer_fonte,
    -- ganho / perdido
    (b.status_comercial = 'ganho')                                    AS ganho,
    CASE WHEN b.status_comercial = 'ganho'
         THEN COALESCE(b.data_fechamento::timestamptz, b.ganho_planner_at, b.updated_at)
    END                                                               AS ganho_at,
    'ttars_status'::text                                              AS ganho_fonte,
    (b.status_comercial = 'perdido')                                  AS is_perdido,
    now()                                                             AS refreshed_at,
    -- dimensões normalizadas (mesmos buckets das helpers usadas pelas RPCs)
    _ww2_norm_faixa_strict(COALESCE(b.produto_data->>'ww_orcamento_faixa', b.produto_data->>'ww_mkt_orcamento_form'))                                                AS faixa,
    _ww2_norm_conv_strict(COALESCE(b.produto_data->>'ww_num_convidados', b.produto_data->>'ww_mkt_convidados_form', b.produto_data->>'ww_convidados_refinado'))       AS convidados,
    _ww2_norm_dest_strict(COALESCE(b.produto_data->>'ww_destino', b.produto_data->>'ww_mkt_destino_form', b.produto_data->>'ww_onde_casar_refinado'))                 AS destino,
    _ww_ac_norm_origem(b.produto_data->>'ww_sdr_como_conheceu')                                                                                                       AS origem,
    b.v_consultor_id                                                  AS consultor_id,
    p.nome                                                            AS consultor_nome,
    -- flags de entrada
    (b.v_tipo <> 'Elopement')                                         AS entrou_sdr,
    (b.v_tipo = 'Elopement')                                          AS entrou_elopement,
    b.v_tipo                                                          AS tipo_entrada,
    TRUE                                                              AS entrou_valido,
    -- valor_final: usado por ww2_overview_native p/ ticket_medio/receita (não existe em ww_funil_casal)
    b.valor_final                                                     AS valor_final
  FROM base b
  LEFT JOIN profiles p ON p.id = b.v_consultor_id;

COMMENT ON VIEW public.ww_funil_casal_native IS
  'Clone NATIVO de ww_funil_casal (1 linha/card WEDDING). Marcos reconstruídos forward-only do log de etapas (activities tipo=stage_changed). Mesma interface de colunas; alimenta as RPCs *_native. Migration 20260619a.';

GRANT SELECT ON public.ww_funil_casal_native TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- STEP 2a — ww_funil_conversao_v1_native (clone mecânico: troca a fonte)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ww_funil_conversao_v1_native(
    p_date_start timestamp with time zone DEFAULT (now() - '90 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort'::text,
    p_org_id uuid DEFAULT NULL::uuid,
    p_faixas text[] DEFAULT NULL::text[],
    p_convidados text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_origins text[] DEFAULT NULL::text[],
    p_tipos text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[],
    p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_bt INT:=0; v_ft INT:=0; v_df INT; v_dc INT; v_dd INT; v_ac JSON;
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
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
      FROM ww_funil_casal_native c
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

GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1_native(timestamptz,timestamptz,text,uuid,text[],text[],text[],text[],text[],uuid[],text[],text[],text)
  TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- STEP 2b — ww_serie_temporal_native (clone mecânico: troca a fonte)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ww_serie_temporal_native(
    p_date_start timestamp with time zone DEFAULT (now() - '1 year'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_granularidade text DEFAULT 'month'::text,
    p_org_id uuid DEFAULT NULL::uuid,
    p_date_mode text DEFAULT 'throughput'::text,
    p_incluir_elopement boolean DEFAULT true,
    p_origins text[] DEFAULT NULL::text[],
    p_faixas text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_convidados text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[],
    p_tipos text[] DEFAULT NULL::text[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[],
    p_status_lead text DEFAULT NULL::text)
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
           c.entrou_valido AS entrada_valida
      FROM ww_funil_casal_native c
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

GRANT EXECUTE ON FUNCTION public.ww_serie_temporal_native(timestamptz,timestamptz,text,uuid,text,boolean,text[],text[],text[],text[],uuid[],text[],text[],text[],text)
  TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- STEP 2c — ww2_overview_native
--   kpis + conversoes -> ww_funil_casal_native (swap)
--   funnel ("onde estão agora") -> pipeline_stages ATIVAS do pipeline WEDDING
--   alertas -> direto de cards (sem ww_ac_deal_funnel_cache; ac_* = NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ww2_overview_native(
    p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort'::text,
    p_org_id uuid DEFAULT NULL::uuid,
    p_origins text[] DEFAULT NULL::text[],
    p_faixas text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_tipos text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[],
    p_convidados text[] DEFAULT NULL::text[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[],
    p_status_lead text DEFAULT NULL::text)
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

GRANT EXECUTE ON FUNCTION public.ww2_overview_native(timestamptz,timestamptz,text,uuid,text[],text[],text[],text[],uuid[],text[],text[],text[],text)
  TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- STEP 2d — ww_agenda_reunioes_native
--   Timestamps SDR/Closer do log de etapas (agendou_*/fez_* da view nativa).
--   Sem ww_ac_deal_funnel_cache: ac_deal_id/motivo = NULL; card_id = contact_id::uuid.
--   reagendando: sem etapa "Reagendamento" nativa dedicada -> categoria não é emitida
--   (cai em sem_registro), mantida a chave no JSON p/ shape idêntico.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ww_agenda_reunioes_native(
    p_org_id uuid DEFAULT NULL::uuid,
    p_dias_futuro integer DEFAULT 7,
    p_dias_pendentes integer DEFAULT 14,
    p_origins text[] DEFAULT NULL::text[],
    p_tipos text[] DEFAULT NULL::text[],
    p_faixas text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_convidados text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[],
    p_dias_desfechos integer DEFAULT 30,
    p_date_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_date_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[])
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

GRANT EXECUTE ON FUNCTION public.ww_agenda_reunioes_native(uuid,integer,integer,text[],text[],text[],text[],text[],uuid[],integer,timestamptz,timestamptz,text[],text[])
  TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- STEP 2e — ww_agendamentos_por_dia_native
--   Bucket por agendou_*_at (booking). Nativamente não há "marcou vs reunião"
--   separado: marcou_em = reuniao_em = agendou_*_at. ac_deal_id = NULL;
--   card_id = contact_id::uuid. Sem a exclusão de "edição em massa" do AC
--   (não há timestamp de edição em massa nativo — comentado abaixo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ww_agendamentos_por_dia_native(
    p_org_id uuid DEFAULT NULL::uuid,
    p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_tipos text[] DEFAULT NULL::text[],
    p_origins text[] DEFAULT NULL::text[],
    p_faixas text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_convidados text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_tz  TEXT := 'America/Sao_Paulo';
    v_por_dia JSON; v_itens JSON;
    v_tot_sdr INT; v_tot_closer INT;
BEGIN
    -- NOTA: a versão AC excluía "edição em massa" (>=6 deals tocados em ±10min); nativamente
    -- não existe timestamp separado de edição/booking, então essa exclusão é pulada.
    CREATE TEMP TABLE _ww_agd ON COMMIT DROP AS
    SELECT NULL::TEXT AS ac_deal_id, w.contact_id, w.deal_title,
           w.agendou_sdr_at    AS sdr_agendado_em,    w.agendou_sdr_at    AS sdr_agendou_at,
           w.agendou_closer_at AS closer_agendado_em, w.agendou_closer_at AS closer_agendou_at,
           w.tipo, w.origem, w.faixa, w.destino, w.convidados, w.consultor_id,
           w.contact_id::uuid AS card_id
      FROM ww_funil_casal_native w
     WHERE w.org_id = v_org
       AND (w.agendou_sdr_at    BETWEEN p_date_start AND p_date_end
         OR w.agendou_closer_at BETWEEN p_date_start AND p_date_end);

    IF p_origins       IS NOT NULL THEN DELETE FROM _ww_agd WHERE origem       IS NULL OR origem       != ALL(p_origins);       END IF;
    IF p_tipos         IS NOT NULL THEN DELETE FROM _ww_agd WHERE tipo         IS NULL OR tipo         != ALL(p_tipos);         END IF;
    IF p_faixas        IS NOT NULL THEN DELETE FROM _ww_agd WHERE faixa        IS NULL OR faixa        != ALL(p_faixas);        END IF;
    IF p_destinos      IS NOT NULL THEN DELETE FROM _ww_agd WHERE destino      IS NULL OR destino      != ALL(p_destinos);      END IF;
    IF p_convidados    IS NOT NULL THEN DELETE FROM _ww_agd WHERE convidados   IS NULL OR convidados   != ALL(p_convidados);    END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_agd WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    CREATE TEMP TABLE _ww_ev ON COMMIT DROP AS
    SELECT (sdr_agendado_em AT TIME ZONE v_tz)::DATE AS dia, 'sdr'::TEXT AS reuniao,
           deal_title AS casal, ac_deal_id, contact_id, card_id, tipo,
           sdr_agendado_em AS marcou_em, sdr_agendou_at AS reuniao_em
      FROM _ww_agd
     WHERE sdr_agendado_em BETWEEN p_date_start AND p_date_end
       AND sdr_agendou_at IS NOT NULL
    UNION ALL
    SELECT (closer_agendado_em AT TIME ZONE v_tz)::DATE, 'closer',
           deal_title, ac_deal_id, contact_id, card_id, tipo,
           closer_agendado_em, closer_agendou_at
      FROM _ww_agd
     WHERE closer_agendado_em BETWEEN p_date_start AND p_date_end
       AND closer_agendou_at IS NOT NULL;

    SELECT COALESCE(json_agg(d ORDER BY d.dia), '[]'::JSON) INTO v_por_dia
    FROM (
        SELECT to_char(dia, 'YYYY-MM-DD') AS dia,
               COUNT(*) FILTER (WHERE reuniao = 'sdr')    AS sdr,
               COUNT(*) FILTER (WHERE reuniao = 'closer') AS closer
        FROM _ww_ev GROUP BY dia
    ) d;

    SELECT COALESCE(json_agg(json_build_object(
               'dia', to_char(dia, 'YYYY-MM-DD'), 'reuniao', reuniao, 'casal', casal,
               'ac_deal_id', ac_deal_id, 'contact_id', contact_id, 'card_id', card_id, 'tipo', tipo,
               'marcou_em', marcou_em, 'reuniao_em', reuniao_em
           ) ORDER BY marcou_em DESC), '[]'::JSON) INTO v_itens FROM _ww_ev;

    SELECT COUNT(*) FILTER (WHERE reuniao='sdr'), COUNT(*) FILTER (WHERE reuniao='closer')
      INTO v_tot_sdr, v_tot_closer FROM _ww_ev;

    DROP TABLE _ww_agd; DROP TABLE _ww_ev;
    RETURN json_build_object(
        'por_dia', v_por_dia,
        'itens', v_itens,
        'total_sdr', COALESCE(v_tot_sdr, 0),
        'total_closer', COALESCE(v_tot_closer, 0),
        'fonte', 'native (ttars): agendou_*_at do log de etapas; conta por dia de agendamento; sem exclusao de edicao em massa'
    );
END $function$;

GRANT EXECUTE ON FUNCTION public.ww_agendamentos_por_dia_native(uuid,timestamptz,timestamptz,text[],text[],text[],text[],text[],uuid[])
  TO authenticated, service_role;

COMMIT;
