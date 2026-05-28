-- ============================================================================
-- RPCs do funil Weddings baseadas em ww_ac_deal_funnel_cache (AC como verdade)
--
-- Substitui a lógica antiga que lia cards.produto_data (sync parcial + campo
-- errado mapeado pra closer_fez). Marcos canônicos vêm do cache AC via view
-- vw_ww_card_marcos.
--
-- Universo de cada RPC:
--   - "entrou" = cards Weddings vivos (sem soft-delete/archive)
--   - Marcos do funil = LEFT JOIN com cache AC
--   - Cards sem external_id (74 de 2943) ficam com marcos=FALSE — não estão na AC
-- ============================================================================

-- ── ww_ac_funnel_validation_counts — chamada pela edge function ────────────
DROP FUNCTION IF EXISTS public.ww_ac_funnel_validation_counts();

CREATE FUNCTION public.ww_ac_funnel_validation_counts()
RETURNS JSON
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $func$
  SELECT json_build_object(
    'total_deals',     COUNT(*),
    'is_ww',           COUNT(*) FILTER (WHERE is_ww),
    'sdr_agendou',     COUNT(*) FILTER (WHERE is_ww AND sdr_agendou_at IS NOT NULL),
    'sdr_fez',         COUNT(*) FILTER (WHERE is_ww AND sdr_fez),
    'closer_agendou',  COUNT(*) FILTER (WHERE is_ww AND closer_agendou_at IS NOT NULL),
    'closer_fez',      COUNT(*) FILTER (WHERE is_ww AND closer_fez),
    'ganho',           COUNT(*) FILTER (WHERE is_ww AND ganho_at IS NOT NULL),
    'sample_canais_sdr', (
      SELECT json_object_agg(canal, qtd) FROM (
        SELECT unnest(sdr_canal) AS canal, COUNT(*) AS qtd
        FROM ww_ac_deal_funnel_cache
        WHERE is_ww AND sdr_fez
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10
      ) c
    )
  )
  FROM ww_ac_deal_funnel_cache;
$func$;

GRANT EXECUTE ON FUNCTION public.ww_ac_funnel_validation_counts() TO authenticated, service_role;

-- ============================================================================
-- ww_funil_perfil_slot v3 — usa vw_ww_card_marcos como fonte dos marcos
--
-- Mantém shape idêntico ao v2 (FunilPerfil tab continua funcionando).
-- Mudanças:
--   - Marcos vêm da view (regra AC canônica): sdr_fez exclui "Não teve reunião",
--     closer_fez exclui "Não teve reunião", ganho vem do field 87 via cache.
--   - Removidas as colunas sdr_data_raw/closer_data_raw locais (não precisam mais).
--   - Mantém upward closure (ganho → fez_closer → marcou_closer → fez_sdr → marcou_sdr)
--     pra UI sempre mostrar funil monotônico.
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
        c.id, c.created_at, c.updated_at, c.status_comercial,
        _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
        _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
        _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')   AS destino,
        _ww2_norm_origem(c.marketing_data) AS origem,
        NULLIF(c.produto_data->>'ww_tipo_casamento','') AS tipo,
        c.dono_atual_id AS consultor_id,
        m.marcou_sdr, m.fez_sdr, m.marcou_closer, m.fez_closer, m.ganho,
        m.sdr_agendou_at    AS sdr_data_ts,
        m.closer_agendou_at AS closer_data_ts,
        m.ganho_at          AS ganho_at
      FROM cards c
      LEFT JOIN vw_ww_card_marcos m ON m.card_id = c.id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING'
       AND c.org_id = v_org_id;

    -- Monotonicidade: ganho implica todos os marcos anteriores
    UPDATE _slot_pool SET fez_closer    = TRUE WHERE ganho AND NOT fez_closer;
    UPDATE _slot_pool SET marcou_closer = TRUE WHERE fez_closer AND NOT marcou_closer;
    UPDATE _slot_pool SET fez_sdr       = TRUE WHERE marcou_closer AND NOT fez_sdr;
    UPDATE _slot_pool SET marcou_sdr    = TRUE WHERE fez_sdr AND NOT marcou_sdr;

    -- ── Filtros por população + período (suporta p_meses) ─────────────────
    IF p_populacao = 'ganhos' THEN
        DELETE FROM _slot_pool WHERE NOT ganho;
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR to_char(ganho_at, 'YYYY-MM') != ALL(p_meses);
            ELSE
                DELETE FROM _slot_pool WHERE to_char(created_at, 'YYYY-MM') != ALL(p_meses);
            END IF;
        ELSE
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR ganho_at NOT BETWEEN p_date_start AND p_date_end;
            ELSE
                DELETE FROM _slot_pool WHERE created_at NOT BETWEEN p_date_start AND p_date_end;
            END IF;
        END IF;
    ELSIF p_populacao = 'em_jogo' THEN
        DELETE FROM _slot_pool WHERE ganho OR status_comercial <> 'aberto';
    ELSE
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            DELETE FROM _slot_pool WHERE to_char(created_at, 'YYYY-MM') != ALL(p_meses);
        ELSE
            DELETE FROM _slot_pool WHERE created_at NOT BETWEEN p_date_start AND p_date_end;
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

    -- ── Segments ──────────────────────────────────────────────────────────
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

    -- ── Tempos (transições entre marcos) ──────────────────────────────────
    WITH transicoes AS (
        SELECT 'entrou_marcou_sdr' AS transicao, EXTRACT(EPOCH FROM (sdr_data_ts - created_at))/86400.0 AS dias
        FROM _slot_pool WHERE marcou_sdr AND sdr_data_ts IS NOT NULL AND sdr_data_ts > created_at
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

    -- ── Parados (em_jogo only) ────────────────────────────────────────────
    IF p_populacao = 'em_jogo' THEN
        WITH ultimo_evento AS (
            SELECT id,
                   GREATEST(created_at, COALESCE(sdr_data_ts, '1900-01-01'::TIMESTAMPTZ),
                            COALESCE(closer_data_ts, '1900-01-01'::TIMESTAMPTZ), updated_at) AS ultima_data,
                   marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho
            FROM _slot_pool
        ),
        classificado AS (
            SELECT id, CASE WHEN ganho THEN 'ganho' WHEN fez_closer THEN 'fez_closer'
                WHEN marcou_closer THEN 'marcou_closer' WHEN fez_sdr THEN 'fez_sdr'
                WHEN marcou_sdr THEN 'marcou_sdr' ELSE 'entrou' END AS marco_atual,
                ultima_data, (NOW() - ultima_data) >= (p_dias_parado || ' days')::INTERVAL AS parado
            FROM ultimo_evento
        )
        SELECT json_object_agg(marco_atual, json_build_object('total', total, 'parados', parados)) INTO v_parados
        FROM (SELECT marco_atual, COUNT(*) AS total, COUNT(*) FILTER (WHERE parado) AS parados
              FROM classificado GROUP BY marco_atual) s;
        IF v_parados IS NULL THEN v_parados := '{}'::JSON; END IF;
    ELSE
        v_parados := NULL;
    END IF;

    -- ── Top combos (somente quando há ganhos) ─────────────────────────────
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

    -- ── Perfil dos ganhos (top buckets) ───────────────────────────────────
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
        'fonte_marcos',  'ww_ac_deal_funnel_cache (v3)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_perfil_slot(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.ww_funil_perfil_slot IS
  'v3 (2026-05-28): marcos do funil vêm de vw_ww_card_marcos (cache AC). Regra canônica: sdr_fez/closer_fez excluem "Não teve reunião", ganho vem do AC field 87.';
