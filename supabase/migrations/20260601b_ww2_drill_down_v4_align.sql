-- ============================================================================
-- Analytics-Weddings — ww2_drill_down v4 (ALINHA o drill com os agregados)
--
-- PROBLEMA (verificado em prod 2026-06-01): o drawer de drill mostrava
-- "0 casais encontrados" porque SELECIONAVA os casais com lógica DIFERENTE da
-- que os agregados usavam pra CONTAR. 5 divergências corrigidas aqui:
--
--   1. Normalizador strict — agregados (ww_funil_*, ww_drift_*, ww_qualidade_lead)
--      bucketam com _ww2_norm_*_strict; o drill usava _ww2_norm_faixa/_ww2_norm_destino
--      (non-strict) → labels diferentes → `!= p_faixa` apagava tudo.
--      Ex prod: "Nordeste"→"Nordeste Brasileiro" (1047 cards), "+R$500 mil"→"Mais de R$500 mil" (68).
--   2. Convidados — não existia p_convidados. Agora bucketado com _ww2_norm_conv_strict.
--   3. date_mode — drill era sempre cohort (created_at). Agora honra cohort/throughput
--      espelhando ww_funil_conversao_v1 (no_periodo).
--   4. Ganho — p_status='ganho' mantinha só status_comercial='ganho' (6 cards na base
--      inteira!). Closes reais = status_comercial='ganho' OR ww_closer_data_ganho IS NOT NULL
--      (75). Realinhado com a definição canônica do funil. ← causa do print Itália+100-200mil.
--   5. Origem permanece via _ww2_norm_origem (mesma fn que o agregado de marketing usa).
--
-- Preserva todos os campos enriquecidos da v3 (contato_*, ac_deal_id, data_venda,
-- monde_venda, tipo_casamento, campaign/medium/content, dias_parado, motivo_perda).
--
-- Regra de ouro (ver memory/feedback_ww_drill_down_mismatch.md): o drill DEVE
-- selecionar casais com a MESMA lógica que o agregado contou.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, INT);

CREATE FUNCTION public.ww2_drill_down(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_stage_id   UUID DEFAULT NULL,
    p_phase_slug TEXT DEFAULT NULL,
    p_status     TEXT DEFAULT NULL,
    p_faixa      TEXT DEFAULT NULL,
    p_destino    TEXT DEFAULT NULL,
    p_origem     TEXT DEFAULT NULL,
    p_consultor_id UUID DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_convidados TEXT DEFAULT NULL,        -- NOVO v4
    p_date_mode  TEXT DEFAULT 'cohort',    -- NOVO v4 ('cohort' | 'throughput')
    p_limit      INT DEFAULT 50,
    p_offset     INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww2_d ON COMMIT DROP AS
    SELECT c.id, c.titulo, c.created_at, c.updated_at, c.valor_estimado, c.valor_final,
           c.status_comercial, c.dono_atual_id, c.pessoa_principal_id,
           s.nome AS stage_name, COALESCE(ph.label, ph.name) AS phase_label, ph.slug AS phase_slug,
           pr.nome AS dono_nome,
           co.nome AS contato_nome,
           co.email AS contato_email,
           co.telefone AS contato_telefone,
           CASE WHEN co.external_source = 'active_campaign' THEN co.external_id ELSE NULL END AS contato_external_id,
           NULLIF(c.marketing_data->>'active_campaign_id','') AS ac_deal_id,
           -- v4: normalizadores STRICT (mesmos dos agregados) + convidados
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form')  AS faixa,
           _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')    AS destino,
           _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo_casamento,
           c.produto_data->>'ww_motivo_perda_sdr' AS motivo_sdr,
           c.produto_data->>'ww_motivo_perda_closer' AS motivo_closer,
           NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ AS data_venda,
           NULLIF(c.produto_data->>'ww_closer_monde_venda','') AS monde_venda,
           COALESCE(NULLIF(c.marketing_data->>'utm_campaign',''), NULLIF(c.marketing_data->'card'->>'utm_campaign','')) AS campaign,
           COALESCE(NULLIF(c.marketing_data->>'utm_medium',''),   NULLIF(c.marketing_data->'card'->>'utm_medium','')) AS medium,
           COALESCE(NULLIF(c.marketing_data->>'utm_content',''),  NULLIF(c.marketing_data->'card'->>'utm_content','')) AS content,
           -- v4: marco "ganho" canônico (alinhado com ww_funil_conversao_v1)
           (c.status_comercial = 'ganho' OR NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS is_ganho,
           -- v4: timestamps p/ date_mode = throughput (mesmos campos do funil)
           CASE WHEN c.produto_data->>'ww_sdr_data_reuniao' ~ '^\d{4}-\d{2}-\d{2}'
                THEN (CASE WHEN c.produto_data->>'ww_sdr_data_reuniao' ~ 'T' THEN (c.produto_data->>'ww_sdr_data_reuniao')::TIMESTAMPTZ
                           ELSE ((c.produto_data->>'ww_sdr_data_reuniao') || 'T00:00:00Z')::TIMESTAMPTZ END) END AS ts_sdr_reuniao,
           CASE WHEN c.produto_data->>'ww_sdr_data_qualificacao' ~ '^\d{4}-\d{2}-\d{2}'
                THEN (CASE WHEN c.produto_data->>'ww_sdr_data_qualificacao' ~ 'T' THEN (c.produto_data->>'ww_sdr_data_qualificacao')::TIMESTAMPTZ
                           ELSE ((c.produto_data->>'ww_sdr_data_qualificacao') || 'T00:00:00Z')::TIMESTAMPTZ END) END AS ts_sdr_qualif,
           CASE WHEN c.produto_data->>'ww_closer_data_reuniao' ~ '^\d{4}-\d{2}-\d{2}'
                THEN (CASE WHEN c.produto_data->>'ww_closer_data_reuniao' ~ 'T' THEN (c.produto_data->>'ww_closer_data_reuniao')::TIMESTAMPTZ
                           ELSE ((c.produto_data->>'ww_closer_data_reuniao') || 'T00:00:00Z')::TIMESTAMPTZ END) END AS ts_closer_reuniao,
           CASE WHEN c.produto_data->>'ww_closer_data_ganho' ~ '^\d{4}-\d{2}-\d{2}'
                THEN (CASE WHEN c.produto_data->>'ww_closer_data_ganho' ~ 'T' THEN (c.produto_data->>'ww_closer_data_ganho')::TIMESTAMPTZ
                           ELSE ((c.produto_data->>'ww_closer_data_ganho') || 'T00:00:00Z')::TIMESTAMPTZ END) END AS ts_closer_ganho,
           EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
      LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id;

    -- v4: filtro de PERÍODO conforme date_mode (espelha ww_funil_conversao_v1)
    IF p_date_mode = 'throughput' THEN
        DELETE FROM _ww2_d WHERE NOT (
               (created_at        BETWEEN p_date_start AND p_date_end)
            OR (ts_sdr_reuniao    BETWEEN p_date_start AND p_date_end)
            OR (ts_sdr_qualif     BETWEEN p_date_start AND p_date_end)
            OR (ts_closer_reuniao BETWEEN p_date_start AND p_date_end)
            OR (ts_closer_ganho   BETWEEN p_date_start AND p_date_end)
            OR (status_comercial = 'ganho' AND updated_at BETWEEN p_date_start AND p_date_end)
        );
    ELSE
        DELETE FROM _ww2_d WHERE NOT (created_at BETWEEN p_date_start AND p_date_end);
    END IF;

    IF p_stage_id IS NOT NULL THEN
        DELETE FROM _ww2_d WHERE id NOT IN (
            SELECT t.id FROM _ww2_d t JOIN cards c2 ON c2.id=t.id WHERE c2.pipeline_stage_id = p_stage_id);
    END IF;
    IF p_phase_slug IS NOT NULL THEN DELETE FROM _ww2_d WHERE phase_slug != p_phase_slug; END IF;
    IF p_status IS NOT NULL THEN
        IF p_status IN ('ganho', 'fechado_efetivo') THEN
            -- v4: "ganho/fechado" = definição canônica do funil (não só status_comercial)
            DELETE FROM _ww2_d WHERE NOT is_ganho;
        ELSE
            DELETE FROM _ww2_d WHERE status_comercial != p_status OR status_comercial IS NULL;
        END IF;
    END IF;
    IF p_faixa IS NOT NULL THEN DELETE FROM _ww2_d WHERE faixa IS NULL OR faixa != p_faixa; END IF;
    IF p_destino IS NOT NULL THEN DELETE FROM _ww2_d WHERE destino IS NULL OR destino != p_destino; END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww2_d WHERE convidados IS NULL OR convidados != p_convidados; END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww2_d WHERE origem != p_origem; END IF;
    IF p_consultor_id IS NOT NULL THEN DELETE FROM _ww2_d WHERE dono_atual_id != p_consultor_id; END IF;
    IF p_motivo_perda IS NOT NULL THEN DELETE FROM _ww2_d WHERE COALESCE(motivo_sdr,'') != p_motivo_perda AND COALESCE(motivo_closer,'') != p_motivo_perda; END IF;

    SELECT COUNT(*) INTO v_total FROM _ww2_d;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT id, titulo, created_at, updated_at, valor_estimado, valor_final,
               status_comercial, stage_name, phase_label, dono_nome,
               faixa, destino, origem, dias_parado,
               COALESCE(motivo_sdr, motivo_closer) AS motivo_perda,
               pessoa_principal_id AS contato_id,
               contato_nome, contato_email, contato_telefone, contato_external_id,
               ac_deal_id,
               data_venda, monde_venda, tipo_casamento,
               campaign, medium, content
          FROM _ww2_d ORDER BY created_at DESC
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww2_d;
    RETURN json_build_object('total', v_total, 'limit', p_limit, 'offset', p_offset, 'rows', COALESCE(v_rows, '[]'::JSON));
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, INT) TO authenticated;
