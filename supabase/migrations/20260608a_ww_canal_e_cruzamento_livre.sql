-- 20260608a — Analytics Weddings: filtro "tipo de reunião" (canal) + Lead Ideal destravado
--
-- Pedido do Vitor: (1) filtrar por tipo de reunião feita (canal: Vídeo/WhatsApp/Telefone/Presencial);
-- (2) destravar a aba "Lead Ideal" — hoje cruzamento preso a 3 combinações fixas.
--
-- O dado já existe e é sincronizado: ww_funil_casal.sdr_canal (campo AC 17, multiselect → '{Vídeo}')
-- e .closer_canal (campo AC 299, texto). Um normalizador strict resolve os dois formatos.
--
-- Mudanças (TODAS aditivas; bases vivas: lead_ideal/funil em 20260603h, filter_options em 20260603e,
-- qualidade_lead em 20260603g — grep feito, TOP-5 #5):
--   • _ww_norm_canal_strict(text): canal cru → balde canônico (Vídeo/WhatsApp/Telefone/Presencial).
--   • ww_funil_filter_options: + canais_sdr[] / canais_closer[].
--   • ww_v2_lead_ideal: + p_sdr_canal/p_closer_canal (filtro), + canal_sdr/origem como dimensão de
--     comparação, + CRUZAMENTO LIVRE (p_cruz_x/p_cruz_y, allowlist via CASE — sem SQL dinâmico),
--     + p_referencia ('ganho'|'perdido') pra comparar pipeline com quem FECHOU ou quem PERDEU.
--   • ww_qualidade_lead: + p_sdr_canal (filtro).
-- Canal NÃO entra no funil comparado de propósito: lá redefiniria "entrou" e confundiria a leitura.

-- ═══════════════════════ 0) Normalizador de canal ═══════════════════════
-- Aceita os dois formatos: '{Vídeo}' (array-literal vindo da casal) e 'Vídeo' (closer).
-- Multi-canal ('{Vídeo,WhatsApp}') cai no primeiro reconhecido. "Não teve reunião"/vazio → NULL.
CREATE OR REPLACE FUNCTION public._ww_norm_canal_strict(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN btrim(raw) IN ('', '[]', '{}', '""', '{""}') THEN NULL
    WHEN lower(raw) LIKE '%não teve%' OR lower(raw) LIKE '%nao teve%' THEN NULL
    WHEN lower(raw) LIKE '%vídeo%' OR lower(raw) LIKE '%video%' THEN 'Vídeo'
    WHEN lower(raw) LIKE '%whats%' THEN 'WhatsApp'
    WHEN lower(raw) LIKE '%presen%' THEN 'Presencial'
    WHEN lower(raw) LIKE '%telefone%' OR lower(raw) LIKE '%ligaç%' OR lower(raw) LIKE '%ligac%' OR lower(raw) LIKE '%call%' THEN 'Telefone'
    ELSE NULLIF(btrim(regexp_replace(raw, '[{}"]', '', 'g')), '')
  END
$$;

-- ═══════════════════════ 1) ww_funil_filter_options (base 20260603e + canais) ═══════════════════════
CREATE OR REPLACE FUNCTION public.ww_funil_filter_options(p_org_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE v_f JSON; v_c JSON; v_d JSON; v_o JSON; v_cons JSON; v_csdr JSON; v_cclo JSON;
BEGIN
    SELECT json_agg(x ORDER BY x) INTO v_f FROM (SELECT DISTINCT faixa x FROM ww_funil_casal WHERE faixa IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_c FROM (SELECT DISTINCT convidados x FROM ww_funil_casal WHERE convidados IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_d FROM (SELECT DISTINCT destino x FROM ww_funil_casal WHERE destino IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_o FROM (SELECT DISTINCT origem x FROM ww_funil_casal WHERE origem IS NOT NULL AND origem<>'Desconhecida') a;
    SELECT json_agg(json_build_object('id',consultor_id,'nome',consultor_nome) ORDER BY consultor_nome) INTO v_cons
      FROM (SELECT DISTINCT consultor_id, consultor_nome FROM ww_funil_casal WHERE consultor_id IS NOT NULL AND consultor_nome IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_csdr FROM (SELECT DISTINCT _ww_norm_canal_strict(sdr_canal) x FROM ww_funil_casal WHERE _ww_norm_canal_strict(sdr_canal) IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_cclo FROM (SELECT DISTINCT _ww_norm_canal_strict(closer_canal) x FROM ww_funil_casal WHERE _ww_norm_canal_strict(closer_canal) IS NOT NULL) a;
    RETURN json_build_object('faixas',COALESCE(v_f,'[]'::JSON),'convidados',COALESCE(v_c,'[]'::JSON),
        'destinos',COALESCE(v_d,'[]'::JSON),'origens',COALESCE(v_o,'[]'::JSON),'consultores',COALESCE(v_cons,'[]'::JSON),
        'canais_sdr',COALESCE(v_csdr,'[]'::JSON),'canais_closer',COALESCE(v_cclo,'[]'::JSON));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_filter_options(UUID) TO authenticated;

-- ═══════════════════════ 2) ww_v2_lead_ideal (base 20260603h + canal + cruzamento livre + referência) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[]);

CREATE FUNCTION public.ww_v2_lead_ideal(
    p_atual_start     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_atual_end       TIMESTAMPTZ DEFAULT NOW(),
    p_org_id          UUID DEFAULT NULL,
    p_historico_start TIMESTAMPTZ DEFAULT NULL,
    p_historico_end   TIMESTAMPTZ DEFAULT NULL,
    p_historico_meses INT DEFAULT 12,
    p_min_amostra     INT DEFAULT 2,
    p_origins         TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados      TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL,
    p_referencia      TEXT DEFAULT 'ganho',
    p_cruz_x          TEXT DEFAULT 'faixa',
    p_cruz_y          TEXT DEFAULT 'convidados'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_hist_start TIMESTAMPTZ;
    v_hist_end   TIMESTAMPTZ;
    v_total_hist INT := 0;
    v_total_atual INT := 0;
    v_perdido BOOLEAN := (lower(COALESCE(p_referencia,'ganho')) = 'perdido');
    v_comparacoes JSON;
    v_cruzamento JSON;
    v_top_perfis_hist JSON;
    v_top_perfis_atual JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    IF p_historico_start IS NOT NULL AND p_historico_end IS NOT NULL THEN
      v_hist_start := p_historico_start;
      v_hist_end := p_historico_end;
    ELSE
      v_hist_start := '1970-01-01'::timestamptz;
      v_hist_end := NOW();
    END IF;

    -- Referência: quem FECHOU (ganho_at na janela) ou quem PERDEU (is_perdido, por data de entrada).
    CREATE TEMP TABLE _ww_v2_pli_h ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo, origem,
           _ww_norm_canal_strict(sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND (CASE WHEN v_perdido
                 THEN is_perdido = TRUE AND (lead_created_at >= v_hist_start AND lead_created_at <= v_hist_end)
                 ELSE ganho = TRUE AND (ganho_at IS NULL OR (ganho_at >= v_hist_start AND ganho_at <= v_hist_end)) END)
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(closer_canal) = ANY(p_closer_canal));

    CREATE TEMP TABLE _ww_v2_pli_a ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo, origem,
           _ww_norm_canal_strict(sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND lead_created_at >= p_atual_start AND lead_created_at <= p_atual_end
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(closer_canal) = ANY(p_closer_canal));

    SELECT COUNT(*) INTO v_total_hist  FROM _ww_v2_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_v2_pli_a;

    -- Comparação por dimensão (faixa/convidados/destino/tipo/origem/canal_sdr)
    WITH dims AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_h WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_h WHERE tipo IS NOT NULL
      UNION ALL SELECT 'origem', origem FROM _ww_v2_pli_h WHERE origem IS NOT NULL
      UNION ALL SELECT 'canal_sdr', canal_sdr FROM _ww_v2_pli_h WHERE canal_sdr IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_a WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_a WHERE tipo IS NOT NULL
      UNION ALL SELECT 'origem', origem FROM _ww_v2_pli_a WHERE origem IS NOT NULL
      UNION ALL SELECT 'canal_sdr', canal_sdr FROM _ww_v2_pli_a WHERE canal_sdr IS NOT NULL
    ),
    tot_h AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_a AS (SELECT dim, COUNT(*) AS total FROM dims_a GROUP BY dim),
    by_h  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_a  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_a GROUP BY dim, cat),
    cats AS (SELECT DISTINCT dim, cat FROM (SELECT dim, cat FROM by_h UNION ALL SELECT dim, cat FROM by_a) z),
    rows AS (
      SELECT c.dim, c.cat,
             COALESCE(h.qtd, 0) AS historico_qtd,
             COALESCE(a.qtd, 0) AS atual_qtd,
             CASE WHEN th.total > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / th.total, 1) END AS historico_pct,
             CASE WHEN ta.total > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / ta.total, 1) END AS atual_pct
        FROM cats c
        LEFT JOIN by_h h ON h.dim=c.dim AND h.cat=c.cat
        LEFT JOIN by_a a ON a.dim=c.dim AND a.cat=c.cat
        LEFT JOIN tot_h th ON th.dim=c.dim
        LEFT JOIN tot_a ta ON ta.dim=c.dim
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::JSON) INTO v_comparacoes
    FROM (
      SELECT dim, json_agg(json_build_object(
          'categoria', cat,
          'historico_qtd', historico_qtd, 'historico_pct', historico_pct,
          'atual_qtd', atual_qtd, 'atual_pct', atual_pct,
          'lift', CASE WHEN historico_pct IS NULL OR historico_pct = 0 OR atual_pct IS NULL THEN NULL
                       ELSE ROUND((atual_pct / historico_pct)::numeric, 2) END,
          'delta_pp', CASE WHEN historico_pct IS NULL OR atual_pct IS NULL THEN NULL
                          ELSE ROUND((atual_pct - historico_pct)::numeric, 1) END
        ) ORDER BY historico_qtd DESC, atual_qtd DESC) AS dados
        FROM rows WHERE historico_qtd >= v_min OR atual_qtd >= v_min
       GROUP BY dim
    ) g;

    -- Cruzamento LIVRE: dois eixos escolhidos (allowlist via CASE; valor inválido → NULL → some)
    WITH hx AS (
      SELECT
        CASE p_cruz_x WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'tipo' THEN tipo END AS x,
        CASE p_cruz_y WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'tipo' THEN tipo END AS y
        FROM _ww_v2_pli_h
    ),
    ax AS (
      SELECT
        CASE p_cruz_x WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'tipo' THEN tipo END AS x,
        CASE p_cruz_y WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'tipo' THEN tipo END AS y
        FROM _ww_v2_pli_a
    ),
    h AS (SELECT x, y, COUNT(*) AS qtd FROM hx WHERE x IS NOT NULL AND y IS NOT NULL GROUP BY x, y),
    a AS (SELECT x, y, COUNT(*) AS qtd FROM ax WHERE x IS NOT NULL AND y IS NOT NULL GROUP BY x, y),
    cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
    SELECT COALESCE(json_agg(json_build_object(
        'x', cells.x, 'y', cells.y,
        'hist_qtd', COALESCE(h.qtd, 0),
        'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
        'atual_qtd', COALESCE(a.qtd, 0),
        'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
      )), '[]'::JSON) INTO v_cruzamento
    FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados,
      'qtd', qtd,
      'pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * qtd / v_total_hist, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_hist
    FROM (
      SELECT faixa, destino, convidados, COUNT(*) AS qtd
        FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
       GROUP BY faixa, destino, convidados
       HAVING COUNT(*) >= 1
       ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados,
      'qtd', qtd,
      'pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * qtd / v_total_atual, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_atual
    FROM (
      SELECT faixa, destino, convidados, COUNT(*) AS qtd
        FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
       GROUP BY faixa, destino, convidados
       HAVING COUNT(*) >= v_min
       ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    DROP TABLE _ww_v2_pli_h;
    DROP TABLE _ww_v2_pli_a;

    RETURN json_build_object(
      'atual_start', p_atual_start, 'atual_end', p_atual_end,
      'historico_start', v_hist_start, 'historico_end', v_hist_end,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'min_amostra', v_min,
      'fonte_v2', 'ww_funil_casal',
      'referencia', CASE WHEN v_perdido THEN 'perdido' ELSE 'ganho' END,
      'cruz_x', p_cruz_x, 'cruz_y', p_cruz_y,
      'filtros_aplicados', json_build_object('origins',p_origins,'consultor_ids',p_consultor_ids,'faixas',p_faixas,'destinos',p_destinos,'convidados',p_convidados,'tipos',p_tipos,'sdr_canal',p_sdr_canal,'closer_canal',p_closer_canal),
      'total_historico', v_total_hist,
      'total_atual', v_total_atual,
      'comparacoes', v_comparacoes,
      'cruzamento', v_cruzamento,
      'top_perfis_historico', v_top_perfis_hist,
      'top_perfis_atual', v_top_perfis_atual
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT) TO authenticated;

-- ═══════════════════════ 3) ww_qualidade_lead (base 20260603g + filtro p_sdr_canal) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer);

CREATE FUNCTION public.ww_qualidade_lead(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_date_mode text DEFAULT 'cohort',
    p_event_stage_id uuid DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 3,
    p_sdr_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_convidados JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
    v_acc_labels TEXT[]; v_acc_e INT; v_acc_f INT; v_acc_v NUMERIC[];
    v_out JSONB[]; r RECORD;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_convidados_bucket(c.real_convidados_parsed) AS conv_bucket,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::text) AS canal_sdr,
           (c.ganho_at IS NOT NULL) AS fechou,
           c.real_orcamento_parsed AS valor_pac
    FROM ww_ac_deal_funnel_cache c
    WHERE c.is_ww
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
      AND CASE
        WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
        ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
      END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', 0,
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa: merge dinâmico ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT faixa,
            CASE faixa
                WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$80-100 mil' THEN 3
                WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_faixa_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_faixa FROM unnest(v_out) m;

    -- ── por_convidados: mesma lógica ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT conv_bucket AS faixa,
            CASE conv_bucket
                WHEN 'Até 50' THEN 1 WHEN '50-100' THEN 2 WHEN '100-150' THEN 3
                WHEN '150-200' THEN 4 WHEN '200-300' THEN 5 WHEN 'Mais de 300' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_conv_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_convidados FROM unnest(v_out) m;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob, 'por_faixa', v_por_faixa, 'por_destino', '[]'::JSON,
        'por_convidados', v_por_convidados, 'outros_amostra_pequena', NULL,
        'heatmap_faixa_destino', '[]'::JSON, 'cruzamentos', NULL,
        'evolucao_mensal_por_faixa', NULL, 'comparacao_entrada_vs_fechamento', NULL,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + consolidação dinâmica + filtro tipo + canal)'
    );
END $$;
GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[]) TO authenticated;
