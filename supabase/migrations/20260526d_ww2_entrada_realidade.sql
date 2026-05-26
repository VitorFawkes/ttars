-- ============================================================================
-- Analytics Weddings — RPC dedicada a Entrada × Realidade
--
-- Análise robusta de 3 dimensões: Convidados, Investimento, Destino.
-- Para cada uma:
--   - Matriz de transição N×N (entrada → refinado)
--   - Sumário por categoria de entrada: manteve, subiu, desceu, sem refinado
--   - Top transições (X disse Y, virou Z)
--   - Drift: leads consistentemente subem/descem da faixa?
--
-- Para investimento, também:
--   - Distribuição do VALOR REAL do pacote (R$) por faixa de entrada
--   - Mediana, p25, p75, médio, mínimo, máximo
--
-- p_only_fechados: TRUE = analisar só leads que fecharam, FALSE = todos.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww2_entrada_realidade(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '365 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_only_fechados BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_convidados JSON;
    v_investimento JSON;
    v_destino JSON;
    v_total INT;
    v_total_fechados INT;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'pipeline WEDDING não encontrado'); END IF;

    -- Pool
    CREATE TEMP TABLE _ww2_er ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.status_comercial, c.valor_final,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS conv_entrada,
           _ww2_norm_convidados(c.produto_data->>'ww_convidados_refinado') AS conv_real,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS inv_entrada,
           _ww2_norm_faixa(c.produto_data->>'ww_investimento_refinado') AS inv_real,
           NULLIF(REPLACE(REPLACE(c.produto_data->>'ww_closer_valor_pacote', '.', ''), ',', '.'), '')::NUMERIC AS valor_pacote,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS dest_entrada,
           COALESCE(
              _ww2_norm_destino(c.produto_data->>'ww_onde_casar_refinado'),
              _ww2_norm_destino(c.produto_data->>'ww_destino')
           ) AS dest_real,
           NULLIF(c.produto_data->>'ww_destino_livre_refinado', '') AS dest_livre,
           _ww2_norm_origem(c.marketing_data) AS origem,
           ph.slug AS phase_slug,
           (c.status_comercial='ganho' OR ph.slug='pos_venda') AS fechado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_er WHERE origem != ALL(p_origins); END IF;
    IF p_only_fechados THEN DELETE FROM _ww2_er WHERE NOT fechado; END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechado) INTO v_total, v_total_fechados FROM _ww2_er;

    -- ── CONVIDADOS ──
    -- ordem: 'Apenas o casal'=1, 'Até 20'=2, '20-50'=3, '50-80'=4, '80-100'=5, '+100'=6
    WITH conv_order AS (
        SELECT * FROM (VALUES ('Apenas o casal',1),('Até 20',2),('20-50',3),('50-80',4),('80-100',5),('+100',6)) AS o(cat, ordem)
    ),
    matriz AS (
        SELECT conv_entrada, conv_real, COUNT(*) AS qtd
          FROM _ww2_er WHERE conv_entrada IS NOT NULL AND conv_real IS NOT NULL
         GROUP BY conv_entrada, conv_real
    ),
    sumario AS (
        SELECT e.conv_entrada AS entrada,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.conv_real IS NULL) AS sem_real,
               COUNT(*) FILTER (WHERE e.conv_real = e.conv_entrada) AS manteve,
               COUNT(*) FILTER (WHERE e.conv_real IS NOT NULL AND oe.ordem < orr.ordem) AS subiu,
               COUNT(*) FILTER (WHERE e.conv_real IS NOT NULL AND oe.ordem > orr.ordem) AS desceu
          FROM _ww2_er e
          LEFT JOIN conv_order oe ON oe.cat = e.conv_entrada
          LEFT JOIN conv_order orr ON orr.cat = e.conv_real
         WHERE e.conv_entrada IS NOT NULL
         GROUP BY e.conv_entrada, oe.ordem
    ),
    top_trans AS (
        SELECT conv_entrada AS de, conv_real AS para, COUNT(*) AS qtd
          FROM _ww2_er WHERE conv_entrada IS NOT NULL AND conv_real IS NOT NULL AND conv_entrada != conv_real
         GROUP BY conv_entrada, conv_real ORDER BY COUNT(*) DESC LIMIT 8
    )
    SELECT json_build_object(
        'ordem_categorias', (SELECT json_agg(cat ORDER BY ordem) FROM conv_order),
        'matriz', COALESCE((SELECT json_agg(json_build_object('entrada', conv_entrada, 'real', conv_real, 'qtd', qtd)) FROM matriz), '[]'::JSON),
        'sumario', COALESCE((SELECT json_agg(json_build_object('entrada', entrada, 'total', total, 'sem_real', sem_real, 'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
            'pct_manteve', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * manteve / (total - sem_real), 1) ELSE NULL END,
            'pct_drift_up', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * subiu / (total - sem_real), 1) ELSE NULL END,
            'pct_drift_down', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * desceu / (total - sem_real), 1) ELSE NULL END
        )) FROM sumario), '[]'::JSON),
        'top_transicoes', COALESCE((SELECT json_agg(json_build_object('de', de, 'para', para, 'qtd', qtd)) FROM top_trans), '[]'::JSON),
        'com_refinado', (SELECT COUNT(*) FROM _ww2_er WHERE conv_real IS NOT NULL),
        'com_entrada', (SELECT COUNT(*) FROM _ww2_er WHERE conv_entrada IS NOT NULL)
    ) INTO v_convidados;

    -- ── INVESTIMENTO ── (mesma estrutura + valor real do pacote)
    WITH inv_order AS (
        SELECT * FROM (VALUES ('Até R$50 mil',1),('R$50-80 mil',2),('R$50-100 mil',3),('R$80-100 mil',4),('R$100-200 mil',5),('R$200-500 mil',6),('Mais de R$500 mil',7)) AS o(cat, ordem)
    ),
    matriz AS (
        SELECT inv_entrada, inv_real, COUNT(*) AS qtd
          FROM _ww2_er WHERE inv_entrada IS NOT NULL AND inv_real IS NOT NULL
         GROUP BY inv_entrada, inv_real
    ),
    sumario AS (
        SELECT e.inv_entrada AS entrada,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.inv_real IS NULL) AS sem_real,
               COUNT(*) FILTER (WHERE e.inv_real = e.inv_entrada) AS manteve,
               COUNT(*) FILTER (WHERE e.inv_real IS NOT NULL AND oe.ordem < orr.ordem) AS subiu,
               COUNT(*) FILTER (WHERE e.inv_real IS NOT NULL AND oe.ordem > orr.ordem) AS desceu
          FROM _ww2_er e
          LEFT JOIN inv_order oe ON oe.cat = e.inv_entrada
          LEFT JOIN inv_order orr ON orr.cat = e.inv_real
         WHERE e.inv_entrada IS NOT NULL
         GROUP BY e.inv_entrada, oe.ordem
    ),
    valor_dist AS (
        SELECT inv_entrada,
               COUNT(*) FILTER (WHERE valor_pacote > 0) AS amostra,
               ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pacote) FILTER (WHERE valor_pacote > 0)::NUMERIC, 0) AS p25,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_pacote) FILTER (WHERE valor_pacote > 0)::NUMERIC, 0) AS p50,
               ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pacote) FILTER (WHERE valor_pacote > 0)::NUMERIC, 0) AS p75,
               ROUND(AVG(valor_pacote) FILTER (WHERE valor_pacote > 0)::NUMERIC, 0) AS media,
               MIN(valor_pacote) FILTER (WHERE valor_pacote > 0) AS minv,
               MAX(valor_pacote) FILTER (WHERE valor_pacote > 0) AS maxv
          FROM _ww2_er WHERE inv_entrada IS NOT NULL GROUP BY inv_entrada
    ),
    top_trans AS (
        SELECT inv_entrada AS de, inv_real AS para, COUNT(*) AS qtd
          FROM _ww2_er WHERE inv_entrada IS NOT NULL AND inv_real IS NOT NULL AND inv_entrada != inv_real
         GROUP BY inv_entrada, inv_real ORDER BY COUNT(*) DESC LIMIT 8
    )
    SELECT json_build_object(
        'ordem_categorias', (SELECT json_agg(cat ORDER BY ordem) FROM inv_order),
        'matriz', COALESCE((SELECT json_agg(json_build_object('entrada', inv_entrada, 'real', inv_real, 'qtd', qtd)) FROM matriz), '[]'::JSON),
        'sumario', COALESCE((SELECT json_agg(json_build_object('entrada', entrada, 'total', total, 'sem_real', sem_real, 'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
            'pct_manteve', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * manteve / (total - sem_real), 1) ELSE NULL END,
            'pct_drift_up', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * subiu / (total - sem_real), 1) ELSE NULL END,
            'pct_drift_down', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * desceu / (total - sem_real), 1) ELSE NULL END
        )) FROM sumario), '[]'::JSON),
        'top_transicoes', COALESCE((SELECT json_agg(json_build_object('de', de, 'para', para, 'qtd', qtd)) FROM top_trans), '[]'::JSON),
        'valor_pacote_por_faixa', COALESCE((SELECT json_agg(json_build_object('entrada', inv_entrada, 'amostra', amostra, 'p25', p25, 'mediana', p50, 'p75', p75, 'media', media, 'minimo', minv, 'maximo', maxv)) FROM valor_dist WHERE amostra > 0), '[]'::JSON),
        'com_refinado', (SELECT COUNT(*) FROM _ww2_er WHERE inv_real IS NOT NULL),
        'com_entrada', (SELECT COUNT(*) FROM _ww2_er WHERE inv_entrada IS NOT NULL),
        'com_valor_real', (SELECT COUNT(*) FROM _ww2_er WHERE valor_pacote > 0)
    ) INTO v_investimento;

    -- ── DESTINO ──
    WITH matriz AS (
        SELECT dest_entrada, dest_real, COUNT(*) AS qtd
          FROM _ww2_er WHERE dest_entrada IS NOT NULL AND dest_real IS NOT NULL
         GROUP BY dest_entrada, dest_real
    ),
    sumario AS (
        SELECT e.dest_entrada AS entrada,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.dest_real IS NULL) AS sem_real,
               COUNT(*) FILTER (WHERE e.dest_real IS NOT NULL AND LOWER(e.dest_real) = LOWER(e.dest_entrada)) AS manteve,
               COUNT(*) FILTER (WHERE e.dest_real IS NOT NULL AND LOWER(e.dest_real) != LOWER(e.dest_entrada)) AS mudou,
               (SELECT dest_real FROM _ww2_er j2 WHERE j2.dest_entrada = e.dest_entrada AND j2.dest_real IS NOT NULL AND LOWER(j2.dest_real) != LOWER(e.dest_entrada)
                GROUP BY dest_real ORDER BY COUNT(*) DESC LIMIT 1) AS mais_comum_quando_muda
          FROM _ww2_er e
         WHERE e.dest_entrada IS NOT NULL
         GROUP BY e.dest_entrada
        HAVING COUNT(*) >= 3
    ),
    top_trans AS (
        SELECT dest_entrada AS de, dest_real AS para, COUNT(*) AS qtd
          FROM _ww2_er WHERE dest_entrada IS NOT NULL AND dest_real IS NOT NULL AND LOWER(dest_entrada) != LOWER(dest_real)
         GROUP BY dest_entrada, dest_real ORDER BY COUNT(*) DESC LIMIT 10
    ),
    destino_livre AS (
        -- Quem disse "Outro" no formulário e depois escreveu o que é
        SELECT dest_livre, COUNT(*) AS qtd
          FROM _ww2_er WHERE dest_entrada = 'Outro' AND dest_livre IS NOT NULL
         GROUP BY dest_livre ORDER BY COUNT(*) DESC LIMIT 10
    )
    SELECT json_build_object(
        'matriz', COALESCE((SELECT json_agg(json_build_object('entrada', dest_entrada, 'real', dest_real, 'qtd', qtd)) FROM matriz), '[]'::JSON),
        'sumario', COALESCE((SELECT json_agg(json_build_object('entrada', entrada, 'total', total, 'sem_real', sem_real, 'manteve', manteve, 'mudou', mudou,
            'pct_manteve', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * manteve / (total - sem_real), 1) ELSE NULL END,
            'pct_mudou', CASE WHEN total - sem_real > 0 THEN ROUND(100.0 * mudou / (total - sem_real), 1) ELSE NULL END,
            'mais_comum_quando_muda', mais_comum_quando_muda
        ) ORDER BY total DESC) FROM sumario), '[]'::JSON),
        'top_transicoes', COALESCE((SELECT json_agg(json_build_object('de', de, 'para', para, 'qtd', qtd)) FROM top_trans), '[]'::JSON),
        'destino_livre_quando_outro', COALESCE((SELECT json_agg(json_build_object('texto', dest_livre, 'qtd', qtd)) FROM destino_livre), '[]'::JSON),
        'com_refinado', (SELECT COUNT(*) FROM _ww2_er WHERE dest_real IS NOT NULL),
        'com_entrada', (SELECT COUNT(*) FROM _ww2_er WHERE dest_entrada IS NOT NULL)
    ) INTO v_destino;

    DROP TABLE _ww2_er;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'only_fechados', p_only_fechados,
        'total_leads', v_total, 'total_fechados', v_total_fechados,
        'convidados', v_convidados,
        'investimento', v_investimento,
        'destino', v_destino
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_entrada_realidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], BOOLEAN) TO authenticated;
