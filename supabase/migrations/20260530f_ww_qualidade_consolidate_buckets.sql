-- ============================================================================
-- ww_qualidade_lead — consolidação dinâmica de buckets pequenos
--
-- Pedido do Vitor (29/05): "Se tiver faixas de convidados ou investimento que
-- tem quase nada de dado, junte ela na faixa mais próxima."
--
-- Implementação (PL/pgSQL iterativo, simples):
--   1. GROUP BY bucket em ordem natural
--   2. Loop FOR acumulando até atingir min_amostra; emite linha consolidada
--   3. Bucket residual mescla com a última linha emitida (ou vira a única)
--   4. Nome final combina os labels mesclados (ex: "Até R$50 mil + R$50-80 mil")
--
-- Ticket médio/p25/p75 recalculados a partir dos VALORES BRUTOS coletados
-- (array_agg) pra que mesclagem não distorça a estatística.
--
-- CORREÇÕES PRESERVADAS de 20260530c:
--   - Universo cache AC (ww_ac_deal_funnel_cache WHERE is_ww)
--   - date_mode cohort/throughput
--   - p_event_stage_id / p_tipos como NO-OP
--   - Helpers _ww_ac_faixa_from_valor e _ww_ac_convidados_bucket reusados
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer);

-- Helper: junta labels de faixa de orçamento em um nome combinado limpo.
-- Ex: ['Até R$50 mil', 'R$50-80 mil'] → 'Até R$80 mil'
--     ['R$80-100 mil', 'R$100-200 mil'] → 'R$80-200 mil'
--     ['Mais de R$500 mil'] → 'Mais de R$500 mil'
CREATE OR REPLACE FUNCTION public._ww_ac_join_faixa_labels(p_labels text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_first text := p_labels[1];
    v_last text := p_labels[array_length(p_labels, 1)];
    v_low text;
    v_high text;
BEGIN
    IF array_length(p_labels, 1) IS NULL OR array_length(p_labels, 1) = 0 THEN
        RETURN '(sem faixa)';
    END IF;
    IF array_length(p_labels, 1) = 1 THEN
        RETURN v_first;
    END IF;
    -- Extrai "low" (Até / início do range) do primeiro
    -- Extrai "high" (final do range / "Mais de") do último
    IF v_first LIKE 'Até R$%' THEN v_low := v_first;  -- Mantém "Até R$X mil" como prefixo
    ELSE v_low := regexp_replace(v_first, ' mil$', '');  -- "R$50-80"
    END IF;
    IF v_last LIKE 'Mais de R$%' THEN v_high := v_last;  -- "Mais de R$X mil"
    ELSE v_high := regexp_replace(v_last, ' mil$', '');  -- "R$100-200"
    END IF;
    -- Casos comuns
    IF v_first LIKE 'Até R$%' AND v_last LIKE 'Mais de R$%' THEN
        RETURN 'Todas as faixas';
    ELSIF v_first LIKE 'Até R$%' THEN
        -- "Até R$X" + "R$Y-Z" → "Até R$Z mil"
        RETURN 'Até R$' || split_part(split_part(v_last, '-', 2), ' ', 1) || ' mil';
    ELSIF v_last LIKE 'Mais de R$%' THEN
        RETURN 'Mais de ' || split_part(v_first, '-', 1);
    ELSE
        -- "R$50-80" + "R$80-100" → "R$50-100 mil"
        RETURN split_part(v_first, '-', 1) || '-' || split_part(split_part(v_last, '-', 2), ' ', 1) || ' mil';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public._ww_ac_join_conv_labels(p_labels text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v_first text := p_labels[1];
    v_last text := p_labels[array_length(p_labels, 1)];
BEGIN
    IF array_length(p_labels, 1) IS NULL OR array_length(p_labels, 1) = 0 THEN
        RETURN '(sem dados)';
    END IF;
    IF array_length(p_labels, 1) = 1 THEN
        RETURN v_first;
    END IF;
    IF v_first LIKE 'Até%' AND v_last LIKE 'Mais de%' THEN
        RETURN 'Todas as faixas';
    ELSIF v_first LIKE 'Até%' THEN
        RETURN 'Até ' || split_part(v_last, '-', 2);
    ELSIF v_last LIKE 'Mais de%' THEN
        RETURN 'Mais de ' || split_part(v_first, '-', 1);
    ELSE
        RETURN split_part(v_first, '-', 1) || '-' || split_part(v_last, '-', 2);
    END IF;
END $$;

-- Helpers de agregação sobre arrays
CREATE OR REPLACE FUNCTION public._ww_ac_arr_avg(p_arr numeric[])
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT AVG(v) FROM unnest(p_arr) v WHERE v IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public._ww_ac_arr_quantile(p_arr numeric[], p_q numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT PERCENTILE_CONT(p_q) WITHIN GROUP (ORDER BY v) FROM unnest(p_arr) v WHERE v IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_date_mode text DEFAULT 'cohort',
    p_event_stage_id uuid DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 3
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_convidados JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
    -- Acumuladores pro loop de merge
    v_acc_labels TEXT[];
    v_acc_e INT;
    v_acc_f INT;
    v_acc_v NUMERIC[];
    v_out JSONB[];
    r RECORD;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_convidados_bucket(c.real_convidados_parsed) AS conv_bucket,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
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

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', 0,
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa: merge dinâmico ────────────────────────────────────────────
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT
            faixa,
            CASE faixa
                WHEN 'Até R$50 mil'      THEN 1
                WHEN 'R$50-80 mil'       THEN 2
                WHEN 'R$80-100 mil'      THEN 3
                WHEN 'R$100-200 mil'     THEN 4
                WHEN 'R$200-500 mil'     THEN 5
                WHEN 'Mais de R$500 mil' THEN 6
                ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram,
            COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(
                array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL),
                ARRAY[]::NUMERIC[]
            ) AS valores
        FROM _ww_ql
        WHERE faixa IS NOT NULL
        GROUP BY faixa
        ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa;
        v_acc_e := v_acc_e + r.entraram;
        v_acc_f := v_acc_f + r.fecharam;
        v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object(
                'labels', to_jsonb(v_acc_labels),
                'entraram', v_acc_e, 'fecharam', v_acc_f,
                'valores', to_jsonb(v_acc_v)
            );
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    -- Bucket residual: se sobrou, mescla com último emitido (ou vira único)
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object(
                'labels', to_jsonb(v_acc_labels),
                'entraram', v_acc_e, 'fecharam', v_acc_f,
                'valores', to_jsonb(v_acc_v)
            )];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') ||
                          to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') ||
                            to_jsonb(v_acc_v)
            );
        END IF;
    END IF;

    SELECT COALESCE(
        json_agg(json_build_object(
            'categoria', _ww_ac_join_faixa_labels(
                ARRAY(SELECT jsonb_array_elements_text(m->'labels'))
            ),
            'entraram', (m->>'entraram')::int,
            'fecharam', (m->>'fecharam')::int,
            'taxa_pct', CASE WHEN (m->>'entraram')::int > 0
                             THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
            'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)
            ), 0)::numeric, 0),
            'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25
            ), 0)::numeric, 0),
            'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75
            ), 0)::numeric, 0),
            'ticket_amostra', jsonb_array_length(m->'valores')
        ) ORDER BY (m->>'entraram')::int DESC),
        '[]'::json
    ) INTO v_por_faixa
    FROM unnest(v_out) m;

    -- ── por_convidados: mesma lógica ─────────────────────────────────────────
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT
            conv_bucket AS faixa,
            CASE conv_bucket
                WHEN 'Até 50'        THEN 1
                WHEN '50-100'        THEN 2
                WHEN '100-150'       THEN 3
                WHEN '150-200'       THEN 4
                WHEN '200-300'       THEN 5
                WHEN 'Mais de 300'   THEN 6
                ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram,
            COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(
                array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL),
                ARRAY[]::NUMERIC[]
            ) AS valores
        FROM _ww_ql
        WHERE conv_bucket IS NOT NULL
        GROUP BY conv_bucket
        ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa;
        v_acc_e := v_acc_e + r.entraram;
        v_acc_f := v_acc_f + r.fecharam;
        v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object(
                'labels', to_jsonb(v_acc_labels),
                'entraram', v_acc_e, 'fecharam', v_acc_f,
                'valores', to_jsonb(v_acc_v)
            );
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object(
                'labels', to_jsonb(v_acc_labels),
                'entraram', v_acc_e, 'fecharam', v_acc_f,
                'valores', to_jsonb(v_acc_v)
            )];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v)
            );
        END IF;
    END IF;

    SELECT COALESCE(
        json_agg(json_build_object(
            'categoria', _ww_ac_join_conv_labels(
                ARRAY(SELECT jsonb_array_elements_text(m->'labels'))
            ),
            'entraram', (m->>'entraram')::int,
            'fecharam', (m->>'fecharam')::int,
            'taxa_pct', CASE WHEN (m->>'entraram')::int > 0
                             THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
            'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)
            ), 0)::numeric, 0),
            'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25
            ), 0)::numeric, 0),
            'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(
                ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75
            ), 0)::numeric, 0),
            'ticket_amostra', jsonb_array_length(m->'valores')
        ) ORDER BY (m->>'entraram')::int DESC),
        '[]'::json
    ) INTO v_por_convidados
    FROM unnest(v_out) m;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa,
        'por_destino', '[]'::JSON,
        'por_convidados', v_por_convidados,
        'outros_amostra_pequena', NULL,
        'heatmap_faixa_destino', '[]'::JSON,
        'cruzamentos', NULL,
        'evolucao_mensal_por_faixa', NULL,
        'comparacao_entrada_vs_fechamento', NULL,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + consolidação dinâmica)'
    );
END $$;
