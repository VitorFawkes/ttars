-- 20260611b — Auditoria 100%: drill honesto + blocos mortos ganham dados + filtros valendo em TODA a aba
--
-- Origem: auditoria multi-agente 2026-06-11 (27 achados confirmados). Os 5 consertos de banco:
--
-- 1) ww2_drill_down: a lista de casais IGNORAVA os filtros da barra (só aceitava valores únicos
--    por célula). Ganha filtros em ARRAY (origens/faixas/destinos/convidados/tipos/consultores)
--    + canal SDR/Closer (via join com o cache do Active). Params antigos preservados (células).
-- 2) ww2_marketing: p_origins filtrava SÓ o bloco "por origem" — campanhas/medium/funil por
--    origem ignoravam (filtro mentiroso). Passa a valer no pool inteiro.
-- 3) ww_funil_ranking_combo: a matriz "Funil por perfil" ignorava os chips de investimento/
--    convidados/destino (a manchete respeitava, a matriz não — números divergiam na mesma tela).
--    Ganha p_faixas/p_convidados/p_destinos como FILTRO de pool.
-- 4) ww2_overview: 'conversoes' e 'alertas' eram '[]' fixos desde 20260528o — a UI dizia
--    "Nenhum lead parado. Tudo fluindo." SEM CALCULAR NADA (dado falso). Implementados:
--    conversões = marcos cumulativos da safra; alertas = cards abertos parados >7d do recorte.
-- 5) ww_qualidade_lead: dizia "faixa/convidados DECLARADOS" mas usava orçamento/convidados REAIS
--    (cobertura 2%/23%); por_destino/heatmap/cruzamentos/evolução/comparação eram vazios fixos
--    (6 blocos mortos na tela). Reescrita: dimensões DECLARADAS strict (87%+), todos os blocos
--    implementados, tickets continuam vindo do orçamento real dos fechados.
--
-- REBASE conferido (TOP-5 #5) — TODAS as migrations anteriores relidas nesta sessão:
--   • drill: base = def VIVA v4 (20260601b, pg_get_functiondef em prod 2026-06-11). Mudança aditiva.
--   • ww2_marketing / ww_funil_ranking_combo: base = 20260611a (promovida hoje; def viva).
--   • ww2_overview: base = 20260611a ← 20260602r, que documenta a supersessão de 20260528n/20260525e
--     ("nenhuma correção é revertida"). conversoes/alertas eram '[]' fixos desde 20260528o.
--   • ww_qualidade_lead: cadeia 20260526g → 20260527u (cruzamentos/evolução/comparação/outros)
--     → 20260528x → 20260530c (universo AC; ZEROU os blocos da 527u "pra não inflar migration")
--     → 20260530f (consolidação dinâmica p/ amostra mínima do orçamento REAL) → 20260603g (+tipos)
--     → 20260608a (+canal, def viva = base). Esta versão RESTAURA os blocos da 527u sobre o
--     universo AC com dimensões DECLARADAS; a consolidação da 530f (pedida quando a fonte real
--     tinha ~25 casais) é substituída pelo bucket "Outros (amostra pequena)" da 527u — mesmo
--     objetivo (não exibir bucket quase vazio), fonte agora com 87%+ de cobertura. Helpers
--     _ww_ac_join_* ficam no banco (sem uso aqui; nada é dropado).
--
-- Assinaturas que mudam usam DROP+CREATE; recriações revisadas idem (padrão 20260603g).
-- Grants: authenticated + service_role; REVOKE PUBLIC/anon.

-- ═══════════════ 1) ww2_drill_down: filtros em array + canal (base v4 20260601b) ═══════════════
DROP FUNCTION IF EXISTS public.ww2_drill_down(timestamptz, timestamptz, uuid, uuid, text, text, text, text, text, uuid, text, text, text, integer, integer);

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
    p_convidados TEXT DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort',
    p_limit      INT DEFAULT 50,
    p_offset     INT DEFAULT 0,
    -- filtros da BARRA (arrays; convivem com os singulares de célula via AND)
    p_origins         TEXT[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados_list TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
           -- v5: tipo pela regra combinada (esteira 12 do Active OU campo declarado) p/ filtro em array
           _ww_tipo_combinado(fc.is_elopement_pipeline, c.produto_data->>'ww_tipo_casamento') AS tipo_combinado,
           -- v5: canal das reuniões vem do espelho do Active (cache)
           _ww_norm_canal_strict(fc.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(fc.closer_canal)    AS canal_closer,
           c.produto_data->>'ww_motivo_perda_sdr' AS motivo_sdr,
           c.produto_data->>'ww_motivo_perda_closer' AS motivo_closer,
           NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ AS data_venda,
           NULLIF(c.produto_data->>'ww_closer_monde_venda','') AS monde_venda,
           COALESCE(NULLIF(c.marketing_data->>'utm_campaign',''), NULLIF(c.marketing_data->'card'->>'utm_campaign','')) AS campaign,
           COALESCE(NULLIF(c.marketing_data->>'utm_medium',''),   NULLIF(c.marketing_data->'card'->>'utm_medium','')) AS medium,
           COALESCE(NULLIF(c.marketing_data->>'utm_content',''),  NULLIF(c.marketing_data->'card'->>'utm_content','')) AS content,
           (c.status_comercial = 'ganho' OR NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS is_ganho,
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
      LEFT JOIN ww_ac_deal_funnel_cache fc ON fc.ac_deal_id = c.external_id AND c.external_source = 'active_campaign'
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
            DELETE FROM _ww2_d WHERE NOT is_ganho;
        ELSE
            DELETE FROM _ww2_d WHERE status_comercial != p_status OR status_comercial IS NULL;
        END IF;
    END IF;
    -- singulares (clique em célula/linha específica)
    IF p_faixa IS NOT NULL THEN DELETE FROM _ww2_d WHERE faixa IS NULL OR faixa != p_faixa; END IF;
    IF p_destino IS NOT NULL THEN DELETE FROM _ww2_d WHERE destino IS NULL OR destino != p_destino; END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww2_d WHERE convidados IS NULL OR convidados != p_convidados; END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww2_d WHERE origem != p_origem; END IF;
    IF p_consultor_id IS NOT NULL THEN DELETE FROM _ww2_d WHERE dono_atual_id != p_consultor_id; END IF;
    IF p_motivo_perda IS NOT NULL THEN DELETE FROM _ww2_d WHERE COALESCE(motivo_sdr,'') != p_motivo_perda AND COALESCE(motivo_closer,'') != p_motivo_perda; END IF;
    -- arrays (filtros ativos na barra da aba) — v5
    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_d WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_d WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_d WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados_list IS NOT NULL THEN DELETE FROM _ww2_d WHERE convidados IS NULL OR convidados != ALL(p_convidados_list); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_d WHERE tipo_combinado IS NULL OR tipo_combinado != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww2_d WHERE dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_d WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_d WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

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
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_drill_down(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 2) ww2_marketing: p_origins vale no POOL inteiro (base 20260611a) ═══════════════
DROP FUNCTION IF EXISTS public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[], text[], text[]);

CREATE FUNCTION public.ww2_marketing(
    p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort',
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_faixas text[] DEFAULT NULL,
    p_destinos text[] DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_consultor_ids uuid[] DEFAULT NULL,
    p_sdr_canal text[] DEFAULT NULL,
    p_closer_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_m ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           c.sdr_agendou_at AS qualif_at,
           c.real_orcamento_parsed AS valor_pac,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida') AS campaign,
           COALESCE(NULLIF(c.utm_medium, ''), 'Desconhecido') AS medium,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechado
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    -- AUDITORIA 2026-06-11: p_origins agora vale pro POOL (todos os blocos), não só "por origem"
    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_m WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_m WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos  IS NOT NULL THEN DELETE FROM _ww2_m WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_m WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_m WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT json_agg(json_build_object(
        'origem', origem, 'leads', leads, 'qualificados', qualif, 'fechados', fechados,
        'taxa_qualif', taxa_q, 'taxa_fechamento', taxa_f, 'ticket_medio', ticket,
        'tempo_qualif_medio_dias', tempo_q
    ) ORDER BY leads DESC) INTO v_por_origem
    FROM (SELECT origem,
                 COUNT(*) AS leads,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE qualif_at IS NOT NULL)/COUNT(*),1) ELSE 0 END AS taxa_q,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa_f,
                 ROUND(COALESCE(AVG(valor_pac) FILTER (WHERE fechado AND valor_pac>0), 0)::NUMERIC, 0) AS ticket,
                 ROUND(AVG(EXTRACT(EPOCH FROM (qualif_at - entrada_at))/86400) FILTER (WHERE qualif_at IS NOT NULL AND qualif_at >= entrada_at)::NUMERIC, 1) AS tempo_q
          FROM _ww2_m
         GROUP BY origem) x;

    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_m WHERE campaign != 'Desconhecida' GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_m WHERE medium != 'Desconhecido' GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_m GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_m;
    RETURN json_build_object(
        'por_origem', COALESCE(v_por_origem, '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium', COALESCE(v_por_medium, '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + filtros origem/tipo/canal no pool inteiro)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[], text[], text[]) TO authenticated, service_role;

-- ═══════════════ 3) ww_funil_ranking_combo: chips de perfil passam a FILTRAR a matriz (base 20260611a) ═══════════════
DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]);

CREATE FUNCTION public.ww_funil_ranking_combo(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_dimensoes  TEXT[] DEFAULT ARRAY['faixa'],
    p_origins    TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_faixas       TEXT[] DEFAULT NULL,
    p_convidados   TEXT[] DEFAULT NULL,
    p_destinos     TEXT[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE v_rows JSON; v_total INT:=0; v_dims TEXT[]; v_p0 NUMERIC:=0; v_bt INT:=0; v_bg INT:=0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d WHERE d IN ('faixa','convidados','destino','canal_sdr','canal_closer')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           agendou_sdr AS m_msdr, fez_sdr AS m_fsdr, agendou_closer AS m_mclo, fez_closer AS m_fclo,
           (CASE WHEN p_date_mode='throughput' THEN (ganho AND ganho_at BETWEEN p_date_start AND p_date_end) ELSE ganho END) AS m_g
      FROM ww_funil_casal c
     WHERE (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       -- AUDITORIA 2026-06-11: chips de perfil agora cortam a matriz também (antes só a manchete)
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos));

    SELECT COUNT(*) INTO v_total FROM _pool;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE m_g) INTO v_bt, v_bg FROM _pool;
    v_p0 := CASE WHEN v_bt>0 THEN v_bg::NUMERIC/v_bt ELSE 0 END;

    SELECT json_agg(json_build_object('faixa',faixa,'convidados',convidados,'destino',destino,
             'canal_sdr',canal_sdr,'canal_closer',canal_closer,'label',label,
             'entrou',entrou,'marcou_sdr',m_sdr,'fez_sdr',f_sdr,'marcou_closer',m_cl,'fez_closer',f_cl,'ganho',ganho,'taxa_pct',taxa_pct)
           ORDER BY score DESC, entrou DESC) INTO v_rows
    FROM (
        SELECT g_faixa AS faixa, g_conv AS convidados, g_dest AS destino, g_csdr AS canal_sdr, g_cclo AS canal_closer,
               concat_ws(' · ', g_faixa, g_conv, g_dest, g_csdr, g_cclo) AS label, entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
               ROUND(100.0*ganho/NULLIF(entrou,0),1) AS taxa_pct, (ganho + 15*v_p0)/(entrou+15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest, g_csdr, g_cclo, COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g) AS m_sdr,
                   COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g) AS f_sdr,
                   COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g) AS m_cl,
                   COUNT(*) FILTER (WHERE m_fclo OR m_g) AS f_cl,
                   COUNT(*) FILTER (WHERE m_g) AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN COALESCE(faixa, 'Não informado') END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN COALESCE(convidados, 'Não informado') END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN COALESCE(destino, 'Não informado') END AS g_dest,
                       CASE WHEN 'canal_sdr'=ANY(v_dims) THEN COALESCE(canal_sdr, 'Não informado') END AS g_csdr,
                       CASE WHEN 'canal_closer'=ANY(v_dims) THEN COALESCE(canal_closer, 'Não informado') END AS g_cclo,
                       m_msdr,m_fsdr,m_mclo,m_fclo,m_g
                FROM _pool
            ) sel GROUP BY g_faixa, g_conv, g_dest, g_csdr, g_cclo
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 4) ww2_overview: conversões e alertas REAIS (base 20260611a; mesma assinatura) ═══════════════
DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]);

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
    p_closer_canal TEXT[] DEFAULT NULL
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
           _ww_norm_canal_strict(sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at, closer_agendou_at, ganho_at
      FROM vw_ww_funnel_base;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww2_pool WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
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

    -- FUNIL — 100% Active: deals da vw_ww_funnel_base por marco.
    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order, 'phase_slug', phase_slug,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'is_won', is_won, 'is_lost', is_lost,
        'leads_count', leads_count
    ) ORDER BY phase_order) INTO v_funnel
    FROM (
        SELECT 'SDR (Pré-Venda)'::TEXT AS phase_label, 1 AS phase_order, 'sdr'::TEXT AS phase_slug,
               NULL::UUID AS stage_id, NULL::TEXT AS stage_name, 1 AS stage_order,
               TRUE AS stage_active, FALSE AS is_won, FALSE AS is_lost,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND NOT marcou_closer AND NOT fez_closer)::INT AS leads_count
          FROM _ww2_pool
        UNION ALL
        SELECT 'Closer', 2, 'closer', NULL::UUID, NULL::TEXT, 1, TRUE, FALSE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND (marcou_closer OR fez_closer))::INT
          FROM _ww2_pool
        UNION ALL
        SELECT 'Pós-Venda', 3, 'pos_venda', NULL::UUID, NULL::TEXT, 1, TRUE, TRUE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND ganho)::INT
          FROM _ww2_pool
    ) sc;

    -- AUDITORIA 2026-06-11: conversões REAIS — marcos cumulativos da SAFRA do período
    -- (mesma régua do funil v1: cada etapa conta quem chegou nela OU além).
    WITH cohort AS (
        SELECT * FROM _ww2_pool WHERE created_at >= p_date_start AND created_at <= p_date_end
    ),
    m AS (
        SELECT COUNT(*) AS entrou,
               COUNT(*) FILTER (WHERE marcou_sdr OR fez_sdr OR marcou_closer OR fez_closer OR ganho) AS marcou_sdr,
               COUNT(*) FILTER (WHERE fez_sdr OR marcou_closer OR fez_closer OR ganho) AS fez_sdr,
               COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR ganho) AS marcou_closer,
               COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
               COUNT(*) FILTER (WHERE ganho) AS ganho
          FROM cohort
    ),
    passos AS (
        SELECT t.* FROM m,
        LATERAL (VALUES
            ('Entrou'::TEXT,          1, m.entrou,        NULL::NUMERIC),
            ('Marcou 1ª reunião',     2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
            ('Fez 1ª reunião',        3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
            ('Marcou closer',         4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
            ('Fez closer',            5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
            ('Ganhou',                6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
        ) AS t(phase_label, phase_order, leads, taxa)
        WHERE m.entrou > 0
    )
    SELECT COALESCE(json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order,
        'leads', leads, 'taxa_vs_anterior', taxa
    ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
    FROM passos;

    -- AUDITORIA 2026-06-11: alertas REAIS — cards ABERTOS do recorte filtrado, parados > 7 dias,
    -- top 8. (Lista vem do CRM — é onde existe card pra abrir; o recorte segue o pool do Active.)
    SELECT COALESCE(json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado
          FROM cards c
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.id IN (SELECT card_id FROM _ww2_pool WHERE card_id IS NOT NULL)
           AND (c.status_comercial IS NULL OR c.status_comercial NOT IN ('ganho','perdido'))
           AND COALESCE(ph.slug,'') NOT IN ('resolucao','pos_venda')
           AND GREATEST(c.updated_at, c.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at)) DESC
         LIMIT 8
    ) a;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', COALESCE(v_conv, '[]'::JSON),
        'alertas', COALESCE(v_alertas, '[]'::JSON),
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v6 — conversões por marcos cumulativos + alertas de cards do recorte)'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings — KPIs + funil 100% Active. v6: conversões por marcos cumulativos (safra) + alertas reais de cards parados >7d no recorte filtrado.';

-- ═══════════════ 5) ww_qualidade_lead: dimensões DECLARADAS de verdade + todos os blocos vivos ═══════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]);

CREATE FUNCTION public.ww_qualidade_lead(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_date_mode text DEFAULT 'cohort',
    p_event_stage_id uuid DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 3,
    p_sdr_canal text[] DEFAULT NULL,
    p_closer_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_of JSON; v_od JSON; v_oc JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_heatmap JSON; v_cruz JSON; v_evolucao JSON; v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww2_norm_faixa_strict(c.faixa_raw)      AS faixa,
           _ww2_norm_conv_strict(c.convidados_raw)  AS conv_bucket,
           _ww2_norm_dest_strict(c.destino_raw)     AS destino,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::text) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
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
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', COUNT(*) FILTER (WHERE destino IS NOT NULL),
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa (declarada strict; ordem canônica; pequenos → outros) ──
    WITH g AS (
        SELECT faixa AS cat,
               CASE faixa WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 2
                          WHEN 'R$80-100 mil' THEN 3 WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5
                          WHEN '+R$500 mil' THEN 6 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_faixa, v_of FROM g;

    -- ── por_destino (declarado strict) ──
    WITH g AS (
        SELECT destino AS cat, COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE destino IS NOT NULL GROUP BY destino
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_destino, v_od FROM g;

    -- ── por_convidados (declarado strict; ordem canônica) ──
    WITH g AS (
        SELECT conv_bucket AS cat,
               CASE conv_bucket WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                                WHEN '50-80' THEN 4 WHEN '50-100' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_convidados, v_oc FROM g;

    -- ── conversão por tipo de reunião (universo = quem FEZ a reunião) ──
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_sdr
    FROM (SELECT canal_sdr AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_sdr IS NOT NULL GROUP BY canal_sdr) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_closer
    FROM (SELECT canal_closer AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_closer IS NOT NULL GROUP BY canal_closer) g;

    -- ── heatmap faixa × destino (era '[]' fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'destino', destino, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
        'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0)
    )), '[]'::json) INTO v_heatmap
    FROM (SELECT faixa, destino, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm
            FROM _ww_ql WHERE faixa IS NOT NULL AND destino IS NOT NULL
           GROUP BY faixa, destino HAVING COUNT(*) >= v_min) g;

    -- ── cruzamentos (eram NULL fixo) — {linha, coluna, entraram, fecharam, taxa_pct} ──
    SELECT json_build_object(
      'faixa_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND origem IS NOT NULL
               GROUP BY faixa, origem HAVING COUNT(*) >= v_min) a),
      'destino_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', destino, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT destino, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE destino IS NOT NULL AND origem IS NOT NULL
               GROUP BY destino, origem HAVING COUNT(*) >= v_min) a),
      'faixa_x_tipo', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', tipo, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, tipo, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND tipo IS NOT NULL
               GROUP BY faixa, tipo HAVING COUNT(*) >= v_min) a),
      'convidados_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', conv_bucket, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT conv_bucket, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE conv_bucket IS NOT NULL AND origem IS NOT NULL
               GROUP BY conv_bucket, origem HAVING COUNT(*) >= v_min) a)
    ) INTO v_cruz;

    -- ── evolução mensal por faixa (era NULL fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'mes', mes, 'categoria', faixa, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY mes), '[]'::json) INTO v_evolucao
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', entrada_at), 'YYYY-MM') AS mes, faixa,
                 COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa IS NOT NULL
           GROUP BY DATE_TRUNC('month', entrada_at), faixa) g;

    -- ── quem ENTRA × quem FECHA (era NULL fixo) — % de entrada vs % dos fechamentos + lift ──
    WITH dims AS (
        SELECT 'faixa'::TEXT AS dim, faixa AS cat, fechou FROM _ww_ql WHERE faixa IS NOT NULL
        UNION ALL SELECT 'destino', destino, fechou FROM _ww_ql WHERE destino IS NOT NULL
        UNION ALL SELECT 'convidados', conv_bucket, fechou FROM _ww_ql WHERE conv_bucket IS NOT NULL
        UNION ALL SELECT 'origem', origem, fechou FROM _ww_ql WHERE origem IS NOT NULL
        UNION ALL SELECT 'tipo', tipo, fechou FROM _ww_ql WHERE tipo IS NOT NULL
    ),
    tot AS (SELECT dim, COUNT(*) AS t_e, COUNT(*) FILTER (WHERE fechou) AS t_f FROM dims GROUP BY dim),
    cat AS (SELECT dim, cat, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f FROM dims GROUP BY dim, cat),
    linhas AS (
        SELECT c.dim, c.cat, c.e, c.f,
               CASE WHEN t.t_e > 0 THEN ROUND(100.0 * c.e / t.t_e, 1) END AS e_pct,
               CASE WHEN t.t_f > 0 THEN ROUND(100.0 * c.f / t.t_f, 1) END AS f_pct
          FROM cat c JOIN tot t ON t.dim = c.dim
         WHERE c.e >= v_min
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::json) INTO v_comparacao
    FROM (
        SELECT dim, json_agg(json_build_object(
            'categoria', cat,
            'entrada_qtd', e, 'entrada_pct', e_pct,
            'fechou_qtd', f, 'fechou_pct', f_pct,
            'lift', CASE WHEN e_pct IS NULL OR e_pct = 0 OR f_pct IS NULL THEN NULL
                         ELSE ROUND((f_pct / e_pct)::numeric, 2) END
        ) ORDER BY e DESC) AS dados
          FROM linhas GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', json_build_object('faixa', v_of, 'destino', v_od, 'convidados', v_oc),
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', v_heatmap,
        'cruzamentos', v_cruz,
        'evolucao_mensal_por_faixa', v_evolucao,
        'comparacao_entrada_vs_fechamento', v_comparacao,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC; dimensões DECLARADAS strict; tickets do orçamento real dos fechados)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]) TO authenticated, service_role;
