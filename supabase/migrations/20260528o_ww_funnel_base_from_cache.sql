-- ============================================================================
-- Universo do funil Weddings agora parte do CACHE AC, não de cards.
--
-- Motivo: 1.084 dos 2.255 deals WW na AC NÃO têm card no WelcomeCRM
-- (deals de Closer/Planejamento/Convidados criados via integração mas
-- não espelhados como cards locais). Filtrar por cards.id perdia 47%
-- do funil.
--
-- Nova view vw_ww_funnel_base:
--   - 1 linha por ac_deal_id WW
--   - LEFT JOIN com card pra metadados (faixa, destino, convidados, origem, owner)
--   - Cards ausentes = filtros de perfil ficam NULL (excluídos quando filtro aplicado)
--
-- RPCs reescritas pra usar essa view: ww_funil_perfil_slot, ww2_overview, ww2_journey
-- Padrão DROP+CREATE (não CREATE OR REPLACE) pra deixar explícito que é
-- substituição completa baseada em novo universo.
-- ============================================================================

DROP VIEW IF EXISTS public.vw_ww_card_marcos CASCADE;
DROP VIEW IF EXISTS public.vw_ww_funnel_base CASCADE;

CREATE VIEW public.vw_ww_funnel_base AS
SELECT
  fc.ac_deal_id,
  fc.contact_id,
  fc.pipeline_group_id,
  fc.deal_title,
  fc.is_ww,
  fc.sdr_agendou_at IS NOT NULL AS marcou_sdr,
  fc.sdr_fez AS fez_sdr,
  fc.closer_agendou_at IS NOT NULL AS marcou_closer,
  fc.closer_fez AS fez_closer,
  fc.ganho_at IS NOT NULL AS ganho,
  fc.sdr_agendou_at,
  fc.closer_agendou_at,
  fc.ganho_at,
  fc.sdr_canal,
  fc.closer_canal,
  c.id AS card_id,
  c.org_id,
  c.created_at AS card_created_at,
  c.status_comercial,
  c.valor_final,
  c.titulo AS card_titulo,
  c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
  _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form')  AS faixa,
  _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
  _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')    AS destino,
  _ww2_norm_destino(c.produto_data->>'ww_destino')                  AS destino_final,
  _ww2_norm_origem(c.marketing_data)                                AS origem,
  NULLIF(c.produto_data->>'ww_tipo_casamento', '')                  AS tipo,
  COALESCE(c.created_at, fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at) AS data_entrada
FROM ww_ac_deal_funnel_cache fc
LEFT JOIN cards c
  ON c.external_id = fc.ac_deal_id
 AND c.external_source = 'active_campaign'
 AND c.deleted_at IS NULL
 AND c.archived_at IS NULL
 AND c.produto::TEXT = 'WEDDING'
WHERE fc.is_ww;

COMMENT ON VIEW public.vw_ww_funnel_base IS
  'Universo do funil Weddings: 1 linha por deal WW na AC. JOIN com card é opcional (deals AC sem card recebem NULL nos campos de perfil). Fonte de verdade canônica para Analytics-Weddings.';

GRANT SELECT ON public.vw_ww_funnel_base TO authenticated, anon;

-- ============================================================================
-- ww_funil_perfil_slot v4 — universo = vw_ww_funnel_base
-- ============================================================================
DROP FUNCTION IF EXISTS public.ww_funil_perfil_slot(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT, TEXT[]);

CREATE FUNCTION public.ww_funil_perfil_slot(
    p_populacao    TEXT        DEFAULT 'todos',
    p_date_axis    TEXT        DEFAULT 'entry',
    p_date_start   TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '365 days'),
    p_date_end     TIMESTAMPTZ DEFAULT NOW(),
    p_org_id       UUID        DEFAULT NULL,
    p_segment_by   TEXT        DEFAULT 'none',
    p_faixas       TEXT[]      DEFAULT NULL,
    p_convidados   TEXT[]      DEFAULT NULL,
    p_destinos     TEXT[]      DEFAULT NULL,
    p_origins      TEXT[]      DEFAULT NULL,
    p_tipos        TEXT[]      DEFAULT NULL,
    p_consultor_ids UUID[]     DEFAULT NULL,
    p_dias_parado  INT         DEFAULT 14,
    p_meses        TEXT[]      DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id      UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total       INT;
    v_marcos      JSON;
    v_segments    JSON;
    v_tempos      JSON;
    v_parados     JSON;
    v_top_combos  JSON;
    v_perfil_ganhos JSON;
    v_ganhos_total INT;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline WEDDING não encontrado para org_id ' || v_org_id);
    END IF;

    CREATE TEMP TABLE _slot_pool ON COMMIT DROP AS
    SELECT
        ac_deal_id, card_id, contact_id, status_comercial,
        faixa, convidados, destino, origem, tipo, dono_atual_id AS consultor_id,
        data_entrada AS created_at, card_created_at,
        sdr_agendou_at AS sdr_data_ts,
        closer_agendou_at AS closer_data_ts,
        ganho_at,
        marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho
      FROM vw_ww_funnel_base;

    -- SEM upward closure: marcos refletem dados crus AC (paridade exata)

    IF p_populacao = 'ganhos' THEN
        DELETE FROM _slot_pool WHERE NOT ganho;
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR to_char(ganho_at, 'YYYY-MM') != ALL(p_meses);
            ELSE
                DELETE FROM _slot_pool WHERE created_at IS NULL OR to_char(created_at, 'YYYY-MM') != ALL(p_meses);
            END IF;
        ELSE
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR ganho_at NOT BETWEEN p_date_start AND p_date_end;
            ELSE
                DELETE FROM _slot_pool WHERE created_at IS NULL OR created_at NOT BETWEEN p_date_start AND p_date_end;
            END IF;
        END IF;
    ELSIF p_populacao = 'em_jogo' THEN
        DELETE FROM _slot_pool WHERE ganho OR (status_comercial IS NOT NULL AND status_comercial <> 'aberto');
    ELSE
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            DELETE FROM _slot_pool WHERE created_at IS NULL OR to_char(created_at, 'YYYY-MM') != ALL(p_meses);
        ELSE
            DELETE FROM _slot_pool WHERE created_at IS NULL OR created_at NOT BETWEEN p_date_start AND p_date_end;
        END IF;
    END IF;

    IF p_origins IS NOT NULL THEN DELETE FROM _slot_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _slot_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _slot_pool WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _slot_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _slot_pool WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _slot_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;

    SELECT COUNT(*) INTO v_total FROM _slot_pool;
    SELECT COUNT(*) INTO v_ganhos_total FROM _slot_pool WHERE ganho;

    SELECT json_build_object(
        'entrou',         v_total,
        'marcou_sdr',     COUNT(*) FILTER (WHERE marcou_sdr),
        'fez_sdr',        COUNT(*) FILTER (WHERE fez_sdr),
        'marcou_closer',  COUNT(*) FILTER (WHERE marcou_closer),
        'fez_closer',     COUNT(*) FILTER (WHERE fez_closer),
        'ganho',          COUNT(*) FILTER (WHERE ganho)
    ) INTO v_marcos FROM _slot_pool;

    IF p_segment_by = 'convidados' THEN
        SELECT json_agg(json_build_object('bucket', bucket, 'total', total, 'marcos', json_build_object(
                'entrou', total, 'marcou_sdr', m_sdr, 'fez_sdr', f_sdr,
                'marcou_closer', m_cl, 'fez_closer', f_cl, 'ganho', g
            )) ORDER BY ord) INTO v_segments
        FROM (
            SELECT COALESCE(convidados, '— sem informação') AS bucket, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE marcou_sdr) AS m_sdr, COUNT(*) FILTER (WHERE fez_sdr) AS f_sdr,
                COUNT(*) FILTER (WHERE marcou_closer) AS m_cl, COUNT(*) FILTER (WHERE fez_closer) AS f_cl,
                COUNT(*) FILTER (WHERE ganho) AS g,
                CASE COALESCE(convidados, '— sem informação')
                    WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                    WHEN '50-80' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ord
            FROM _slot_pool GROUP BY 1
        ) s;
    ELSIF p_segment_by = 'investimento' THEN
        SELECT json_agg(json_build_object('bucket', bucket, 'total', total, 'marcos', json_build_object(
                'entrou', total, 'marcou_sdr', m_sdr, 'fez_sdr', f_sdr,
                'marcou_closer', m_cl, 'fez_closer', f_cl, 'ganho', g
            )) ORDER BY ord) INTO v_segments
        FROM (
            SELECT COALESCE(faixa, '— sem informação') AS bucket, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE marcou_sdr) AS m_sdr, COUNT(*) FILTER (WHERE fez_sdr) AS f_sdr,
                COUNT(*) FILTER (WHERE marcou_closer) AS m_cl, COUNT(*) FILTER (WHERE fez_closer) AS f_cl,
                COUNT(*) FILTER (WHERE ganho) AS g,
                CASE COALESCE(faixa, '— sem informação')
                    WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 3
                    WHEN 'R$80-100 mil' THEN 4 WHEN 'R$100-200 mil' THEN 5 WHEN 'R$200-500 mil' THEN 6
                    WHEN '+R$500 mil' THEN 7 ELSE 99 END AS ord
            FROM _slot_pool GROUP BY 1
        ) s;
    ELSIF p_segment_by = 'destino' THEN
        SELECT json_agg(json_build_object('bucket', bucket, 'total', total, 'marcos', json_build_object(
                'entrou', total, 'marcou_sdr', m_sdr, 'fez_sdr', f_sdr,
                'marcou_closer', m_cl, 'fez_closer', f_cl, 'ganho', g
            )) ORDER BY total DESC) INTO v_segments
        FROM (
            SELECT COALESCE(destino, '— sem informação') AS bucket, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE marcou_sdr) AS m_sdr, COUNT(*) FILTER (WHERE fez_sdr) AS f_sdr,
                COUNT(*) FILTER (WHERE marcou_closer) AS m_cl, COUNT(*) FILTER (WHERE fez_closer) AS f_cl,
                COUNT(*) FILTER (WHERE ganho) AS g
            FROM _slot_pool GROUP BY 1
        ) s LIMIT 12;
    ELSE
        v_segments := NULL;
    END IF;

    WITH transicoes AS (
        SELECT 'entrou_marcou_sdr' AS transicao, EXTRACT(EPOCH FROM (sdr_data_ts - created_at))/86400.0 AS dias
        FROM _slot_pool WHERE marcou_sdr AND sdr_data_ts IS NOT NULL AND created_at IS NOT NULL AND sdr_data_ts > created_at
        UNION ALL
        SELECT 'marcou_sdr_marcou_closer', EXTRACT(EPOCH FROM (closer_data_ts - sdr_data_ts))/86400.0
        FROM _slot_pool WHERE marcou_closer AND sdr_data_ts IS NOT NULL AND closer_data_ts IS NOT NULL AND closer_data_ts > sdr_data_ts
        UNION ALL
        SELECT 'marcou_closer_ganho', EXTRACT(EPOCH FROM (ganho_at - closer_data_ts))/86400.0
        FROM _slot_pool WHERE ganho AND ganho_at IS NOT NULL AND closer_data_ts IS NOT NULL AND ganho_at > closer_data_ts
    )
    SELECT json_object_agg(transicao, dados) INTO v_tempos
    FROM (
        SELECT transicao, json_build_object(
                'amostra', COUNT(*),
                'lt3',    COUNT(*) FILTER (WHERE dias < 3),
                'd3_7',   COUNT(*) FILTER (WHERE dias >= 3 AND dias < 7),
                'd7_15',  COUNT(*) FILTER (WHERE dias >= 7 AND dias < 15),
                'd15_30', COUNT(*) FILTER (WHERE dias >= 15 AND dias < 30),
                'ge30',   COUNT(*) FILTER (WHERE dias >= 30)
            ) AS dados
        FROM transicoes GROUP BY transicao
    ) t;
    IF v_tempos IS NULL THEN v_tempos := '{}'::JSON; END IF;

    IF p_populacao = 'em_jogo' THEN
        WITH classificado AS (
            SELECT ac_deal_id, CASE WHEN ganho THEN 'ganho' WHEN fez_closer THEN 'fez_closer'
                WHEN marcou_closer THEN 'marcou_closer' WHEN fez_sdr THEN 'fez_sdr'
                WHEN marcou_sdr THEN 'marcou_sdr' ELSE 'entrou' END AS marco_atual,
                GREATEST(COALESCE(sdr_data_ts, '1900-01-01'::TIMESTAMPTZ),
                         COALESCE(closer_data_ts, '1900-01-01'::TIMESTAMPTZ),
                         COALESCE(created_at, '1900-01-01'::TIMESTAMPTZ)) AS ultima_data
            FROM _slot_pool
        )
        SELECT json_object_agg(marco_atual, json_build_object('total', total, 'parados', parados)) INTO v_parados
        FROM (SELECT marco_atual, COUNT(*) AS total,
                     COUNT(*) FILTER (WHERE (NOW() - ultima_data) >= (p_dias_parado || ' days')::INTERVAL) AS parados
              FROM classificado GROUP BY marco_atual) s;
        IF v_parados IS NULL THEN v_parados := '{}'::JSON; END IF;
    ELSE
        v_parados := NULL;
    END IF;

    IF v_ganhos_total > 0 THEN
        SELECT json_agg(json_build_object(
            'faixa', faixa, 'convidados', convidados, 'destino', destino, 'qtd', qtd,
            'pct', CASE WHEN v_ganhos_total > 0 THEN ROUND((qtd * 100.0 / v_ganhos_total)::NUMERIC, 1) ELSE NULL END
        ) ORDER BY qtd DESC) INTO v_top_combos
        FROM (
            SELECT COALESCE(faixa, '—') AS faixa, COALESCE(convidados, '—') AS convidados,
                COALESCE(destino, '—') AS destino, COUNT(*) AS qtd
            FROM _slot_pool WHERE ganho GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10
        ) s;
        IF v_top_combos IS NULL THEN v_top_combos := '[]'::JSON; END IF;
    ELSE
        v_top_combos := NULL;
    END IF;

    IF v_ganhos_total > 0 THEN
        WITH ganhos AS (SELECT * FROM _slot_pool WHERE ganho)
        SELECT json_build_object(
            'total_ganhos', v_ganhos_total,
            'faixa',      (SELECT json_agg(json_build_object('bucket', b, 'qtd', q, 'pct', ROUND(q*100.0/v_ganhos_total,1)) ORDER BY q DESC)
                           FROM (SELECT COALESCE(faixa, '— sem informação') AS b, COUNT(*) AS q FROM ganhos GROUP BY 1 ORDER BY 2 DESC LIMIT 5) f),
            'convidados', (SELECT json_agg(json_build_object('bucket', b, 'qtd', q, 'pct', ROUND(q*100.0/v_ganhos_total,1)) ORDER BY q DESC)
                           FROM (SELECT COALESCE(convidados, '— sem informação') AS b, COUNT(*) AS q FROM ganhos GROUP BY 1 ORDER BY 2 DESC LIMIT 5) f),
            'destino',    (SELECT json_agg(json_build_object('bucket', b, 'qtd', q, 'pct', ROUND(q*100.0/v_ganhos_total,1)) ORDER BY q DESC)
                           FROM (SELECT COALESCE(destino, '— sem informação') AS b, COUNT(*) AS q FROM ganhos GROUP BY 1 ORDER BY 2 DESC LIMIT 5) f),
            'origem',     (SELECT json_agg(json_build_object('bucket', b, 'qtd', q, 'pct', ROUND(q*100.0/v_ganhos_total,1)) ORDER BY q DESC)
                           FROM (SELECT COALESCE(origem, '— sem informação') AS b, COUNT(*) AS q FROM ganhos GROUP BY 1 ORDER BY 2 DESC LIMIT 5) f)
        ) INTO v_perfil_ganhos;
    ELSE
        v_perfil_ganhos := NULL;
    END IF;

    DROP TABLE _slot_pool;

    RETURN json_build_object(
        'config', json_build_object(
            'populacao', p_populacao, 'date_axis', p_date_axis,
            'date_start', p_date_start, 'date_end', p_date_end,
            'segment_by', p_segment_by, 'dias_parado', p_dias_parado,
            'meses', p_meses
        ),
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'total',         v_total,
        'ganhos_total',  v_ganhos_total,
        'marcos',        v_marcos,
        'segments',      v_segments,
        'tempos',        v_tempos,
        'parados',       v_parados,
        'top_combos',    v_top_combos,
        'perfil_ganhos', v_perfil_ganhos,
        'fonte_marcos',  'vw_ww_funnel_base (cache AC, v4)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_perfil_slot(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.ww_funil_perfil_slot IS
  'v4 (2026-05-28): universo = vw_ww_funnel_base (cache AC). 1 linha por ac_deal_id WW; card opcional pra metadados de perfil.';

-- ============================================================================
-- ww2_overview v3 — universo = cache AC (DROP+CREATE)
-- ============================================================================
DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww2_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
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
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, data_entrada AS created_at, status_comercial, valor_final,
           sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id,
           faixa, convidados, destino, tipo, origem,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at, closer_agendou_at, ganho_at
      FROM vw_ww_funnel_base;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_pool
         WHERE (sdr_owner_id IS NULL OR sdr_owner_id != ALL(p_consultor_ids))
            AND (vendas_owner_id IS NULL OR vendas_owner_id != ALL(p_consultor_ids))
            AND (pos_owner_id IS NULL OR pos_owner_id != ALL(p_consultor_ids))
            AND (dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids));
    END IF;

    IF p_date_mode = 'throughput' THEN
        WITH base AS (
            SELECT
                COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end) AS leads,
                COUNT(*) FILTER (WHERE created_at >= v_prev_start AND created_at <  v_prev_end) AS leads_prev,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS reunioes,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN v_prev_start AND v_prev_end) AS reunioes_prev,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN p_date_start AND p_date_end) AS propostas,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN v_prev_start AND v_prev_end) AS propostas_prev,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS fechados,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN v_prev_start AND v_prev_end) AS fechados_prev
            FROM _ww2_pool
        )
        SELECT json_build_object(
            'mode', 'throughput',
            'leads', leads, 'leads_prev', leads_prev,
            'reunioes', reunioes, 'reunioes_prev', reunioes_prev,
            'propostas', propostas, 'propostas_prev', propostas_prev,
            'fechados', fechados, 'fechados_prev', fechados_prev
        ) INTO v_kpis FROM base;
    ELSE
        WITH cohort AS (
            SELECT * FROM _ww2_pool WHERE created_at >= p_date_start AND created_at <= p_date_end
        ),
        cohort_prev AS (
            SELECT * FROM _ww2_pool WHERE created_at >= v_prev_start AND created_at < v_prev_end
        )
        SELECT json_build_object(
            'mode', 'cohort',
            'leads',          (SELECT COUNT(*) FROM cohort),
            'leads_prev',     (SELECT COUNT(*) FROM cohort_prev),
            'reunioes',       (SELECT COUNT(*) FROM cohort WHERE fez_sdr),
            'reunioes_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE fez_sdr),
            'propostas',      (SELECT COUNT(*) FROM cohort WHERE marcou_closer),
            'propostas_prev', (SELECT COUNT(*) FROM cohort_prev WHERE marcou_closer),
            'fechados',       (SELECT COUNT(*) FROM cohort WHERE ganho),
            'fechados_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE ganho),
            'ticket_medio',   (SELECT ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) FROM cohort),
            'receita',        (SELECT ROUND(COALESCE(SUM(valor_final) FILTER (WHERE ganho), 0)::NUMERIC, 0) FROM cohort)
        ) INTO v_kpis;
    END IF;

    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order, 'phase_slug', phase_slug,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'is_won', is_won, 'is_lost', is_lost,
        'leads_count', leads_count
    ) ORDER BY phase_order NULLS LAST, stage_order NULLS LAST) INTO v_funnel
    FROM (
        SELECT COALESCE(ph.label, ph.name) AS phase_label, ph.order_index AS phase_order, ph.slug AS phase_slug,
               s.id AS stage_id, s.nome AS stage_name, s.ordem AS stage_order, s.ativo AS stage_active,
               s.is_won, s.is_lost,
               COUNT(c.id) FILTER (WHERE c.created_at >= p_date_start AND c.created_at <= p_date_end) AS leads_count
          FROM pipeline_phases ph
          JOIN pipeline_stages s ON s.phase_id = ph.id
          LEFT JOIN cards c ON c.pipeline_stage_id = s.id AND c.org_id = v_org_id
                            AND c.deleted_at IS NULL AND c.archived_at IS NULL
                            AND c.produto::TEXT = 'WEDDING'
         WHERE s.pipeline_id = v_pipeline_id
         GROUP BY ph.id, ph.label, ph.name, ph.order_index, ph.slug, s.id, s.nome, s.ordem, s.ativo, s.is_won, s.is_lost
        HAVING s.ativo = TRUE OR COUNT(c.id) FILTER (WHERE c.created_at >= p_date_start AND c.created_at <= p_date_end) > 0
    ) sc;

    v_conv := '[]'::JSON;
    v_alertas := '[]'::JSON;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', v_conv,
        'alertas', v_alertas,
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v3)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ============================================================================
-- ww2_journey v3 — universo = cache AC (DROP+CREATE)
-- ============================================================================
DROP FUNCTION IF EXISTS public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww2_journey(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_funil_real JSON; v_tempos JSON;
    v_orcamento_real JSON; v_destino_mudou JSON; v_ranking_lentos JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_j ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, card_titulo,
           data_entrada AS created_at, valor_final, status_comercial,
           faixa AS faixa_entrada, destino AS destino_entrada, convidados AS convidados_entrada,
           destino_final, tipo, origem,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at AS sdr_data_reuniao, closer_agendou_at AS closer_data_reuniao, ganho_at
      FROM vw_ww_funnel_base
     WHERE data_entrada >= p_date_start AND data_entrada <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_j WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_j WHERE faixa_entrada IS NULL OR faixa_entrada != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_j WHERE destino_entrada IS NULL OR destino_entrada != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_j WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    SELECT json_agg(json_build_object(
        'passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior
    ) ORDER BY ordem) INTO v_funil_real
    FROM (
        WITH counts AS (
            SELECT
                (SELECT COUNT(*) FROM _ww2_j) AS total,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr,
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1) FROM counts
        UNION ALL SELECT '3. Fez reunião SDR', 3, c_fez_sdr,
               ROUND(100.0 * c_fez_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fez_sdr / NULLIF(c_marcou_sdr, 0), 1) FROM counts
        UNION ALL SELECT '4. Marcou reunião Closer', 4, c_marcou_closer,
               ROUND(100.0 * c_marcou_closer / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_closer / NULLIF(c_fez_sdr, 0), 1) FROM counts
        UNION ALL SELECT '5. Fez reunião Closer', 5, c_fez_closer,
               ROUND(100.0 * c_fez_closer / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fez_closer / NULLIF(c_marcou_closer, 0), 1) FROM counts
        UNION ALL SELECT '6. Ganho', 6, c_ganho,
               ROUND(100.0 * c_ganho / NULLIF(total, 0), 1),
               ROUND(100.0 * c_ganho / NULLIF(c_fez_closer, 0), 1) FROM counts
    ) x;

    SELECT json_build_object(
        'lead_para_reuniao_sdr', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND created_at IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND created_at IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND created_at IS NOT NULL))::NUMERIC, 1)
        ),
        'reuniao_sdr_para_reuniao_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1)
        ),
        'lead_para_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE closer_data_reuniao IS NOT NULL AND created_at IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL AND created_at IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL AND created_at IS NOT NULL))::NUMERIC, 1)
        ),
        'lead_para_fechamento', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE ganho),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ganho_at, NOW()) - created_at))/86400) FILTER (WHERE ganho AND created_at IS NOT NULL))::NUMERIC, 0),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ganho_at, NOW()) - created_at))/86400) FILTER (WHERE ganho AND created_at IS NOT NULL))::NUMERIC, 0),
            'nota', 'tempo entre criação do card e data de ganho (field 87 AC)'
        )
    ) INTO v_tempos FROM _ww2_j;

    SELECT json_agg(json_build_object(
        'faixa_entrada', faixa_entrada, 'leads_total', leads_total, 'leads_fechados', leads_fechados,
        'leads_com_valor', leads_com_valor, 'valor_medio_real', valor_medio,
        'valor_mediano_real', valor_mediano, 'taxa_fechamento', taxa
    ) ORDER BY ordem_faixa) INTO v_orcamento_real
    FROM (
        SELECT faixa_entrada,
               CASE faixa_entrada
                 WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 3
                 WHEN 'R$80-100 mil' THEN 4 WHEN 'R$100-200 mil' THEN 5 WHEN 'R$200-500 mil' THEN 6
                 WHEN 'Mais de R$500 mil' THEN 7 ELSE 99 END AS ordem_faixa,
               COUNT(*) AS leads_total,
               COUNT(*) FILTER (WHERE ganho) AS leads_fechados,
               COUNT(*) FILTER (WHERE ganho AND valor_final > 0) AS leads_com_valor,
               ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) AS valor_medio,
               ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) AS valor_mediano,
               CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE ganho) / COUNT(*), 1) ELSE 0 END AS taxa
          FROM _ww2_j WHERE faixa_entrada IS NOT NULL
         GROUP BY faixa_entrada
    ) x;

    SELECT json_agg(json_build_object(
        'destino_entrada', destino_entrada, 'leads_total', leads_total, 'manteve', manteve,
        'mudou', mudou, 'sem_dado_final', sem_dado_final, 'principal_destino_final', principal_destino_final,
        'pct_manteve', pct_manteve
    ) ORDER BY leads_total DESC) INTO v_destino_mudou
    FROM (
        SELECT destino_entrada, COUNT(*) AS leads_total,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) AS manteve,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) != LOWER(destino_entrada)) AS mudou,
            COUNT(*) FILTER (WHERE destino_final IS NULL) AS sem_dado_final,
            (SELECT destino_final FROM _ww2_j j2 WHERE j2.destino_entrada = j1.destino_entrada AND j2.destino_final IS NOT NULL
              GROUP BY destino_final ORDER BY COUNT(*) DESC LIMIT 1) AS principal_destino_final,
            CASE WHEN COUNT(*) FILTER (WHERE destino_final IS NOT NULL) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) / COUNT(*) FILTER (WHERE destino_final IS NOT NULL), 1)
                 ELSE NULL END AS pct_manteve
          FROM _ww2_j j1 WHERE destino_entrada IS NOT NULL
         GROUP BY destino_entrada HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC LIMIT 12
    ) x;

    SELECT json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'gargalo', gargalo, 'dias', dias, 'origem', origem, 'faixa', faixa
    ) ORDER BY dias DESC) INTO v_ranking_lentos
    FROM (
        SELECT j.card_id, j.card_titulo AS titulo,
               'Marcou SDR sem confirmar reunião' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.sdr_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada AS faixa
          FROM _ww2_j j
         WHERE j.marcou_sdr AND NOT j.fez_sdr AND j.sdr_data_reuniao IS NOT NULL AND j.card_id IS NOT NULL
           AND NOW() - j.sdr_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        UNION ALL
        SELECT j.card_id, j.card_titulo,
               'Marcou Closer mas não realizou reunião' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.closer_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada
          FROM _ww2_j j
         WHERE j.marcou_closer AND NOT j.fez_closer AND NOT j.ganho AND j.closer_data_reuniao IS NOT NULL AND j.card_id IS NOT NULL
           AND NOW() - j.closer_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        ORDER BY 4 DESC LIMIT 8
    ) x;

    DROP TABLE _ww2_j;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'funil_real', COALESCE(v_funil_real, '[]'::JSON),
        'tempos', v_tempos,
        'orcamento_real', COALESCE(v_orcamento_real, '[]'::JSON),
        'destino_mudou', COALESCE(v_destino_mudou, '[]'::JSON),
        'ranking_lentos', COALESCE(v_ranking_lentos, '[]'::JSON),
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v3)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

COMMENT ON FUNCTION public.ww2_journey IS
  'v3 (2026-05-28): universo = vw_ww_funnel_base (cache AC). Funil de 6 passos canônicos.';
COMMENT ON FUNCTION public.ww2_overview IS
  'v3 (2026-05-28): universo = vw_ww_funnel_base (cache AC). reunioes/propostas/fechados vêm da AC.';
