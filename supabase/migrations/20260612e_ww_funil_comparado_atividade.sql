-- 20260612e — Funil Comparado: modo "Data de entrada" conta o que ACONTECEU no período
--
-- BUG (print do Vitor, 2026-06-14): com o MESMO filtro (período 01–14/06 + "Data de entrada"
-- + tipo DW), a Visão Geral mostrava 92 → 27 → 14 → 9 → 7 → 0 e o Funil Comparado mostrava
-- 101 → 31 → 17 → 12 → 7 → 0. Reproduzido na base real (ww_funil_casal, org Weddings).
--
-- CAUSA: no modo throughput o ww_funil_conversao_v1 montava um POOL = "qualquer evento no
-- período" — entrou = 101 incluía 9 casais criados ANTES do período, só porque tinham uma
-- reunião MARCADA na janela (6 pela 1ª reunião, 5 pela reunião closer, 9 distintos) — e contava
-- as etapas como flags CUMULATIVAS ("já alcançou alguma vez"), sem amarrar à janela. Já o
-- ww2_overview (Visão Geral) e o ww_drill_casais contam cada etapa pela DATA do próprio evento
-- dentro do período ("marcada × aconteceu"). O funil era o único fora do padrão — tanto que
-- clicar "Marcou SDR 31" no Funil Comparado já abria a lista do drill com 27 (número ≠ lista).
--
-- DECISÃO do Vitor (2026-06-14, AskUserQuestion): "o que aconteceu no período". Alinha o
-- throughput do ww_funil_conversao_v1 à MESMA régua do ww2_overview / ww_drill_casais:
--   entrou        = criados na janela
--   marcou_sdr    = agendou_sdr    com agendou_sdr_at    na janela
--   fez_sdr       = fez_sdr        com fez_sdr_at        na janela
--   marcou_closer = agendou_closer com agendou_closer_at na janela
--   fez_closer    = fez_closer     com fez_closer_at     na janela
--   ganho         = ganho          com ganho_at          na janela   (já era assim)
-- Equivalência com a Visão Geral: o pool throughput passa a aceitar QUALQUER uma das 6 datas de
-- evento na janela (antes faltavam fez_sdr_at e fez_closer_at). Como casal fora desse pool
-- contribui 0 em todas as etapas, contar dentro do pool dá exatamente o mesmo que o ww2_overview
-- conta sobre a org inteira. Validado em Python sobre a base real: 92/27/14/9/7/0 (= Visão Geral).
--
-- ═══ REBASE conferido (TOP-5 #5) — cadeia relida; cada correção incremental PRESERVADA ═══
--   • 20260528a  base (pool, marcos, filtros)                          → mantido
--   • 20260531e  "_monotonico": etapas cumulativas p/ passagem ≤ 100%  → mantido NO COHORT.
--       No throughput a contagem passa a ser por evento (pode dar passagem > 100%, p.ex.
--       marcou_closer > fez_sdr) — é a régua que a Visão Geral JÁ usa e que o Vitor escolheu.
--       O objetivo do 20260531e (funil de safra limpo) continua intacto no modo cohort.
--   • 20260602f/m  ler do cache → ww_funil_casal                       → mantido (lê do casal)
--   • 20260603c  ganho throughput = ganho_at na janela                 → mantido (m_g throughput)
--   • 20260603h  filtro de tipo                                        → mantido (p_tipos)
--   • 20260611a  canais SDR/Closer via _ww_norm_canal_strict           → mantido
--   • 20260612a  + p_status_lead (aberto|perdido); idioma DROP+CREATE  → mantido (def viva relida)
-- Assinatura INALTERADA (13 args). DROP+CREATE (idioma do 20260612a) + REVOKE/GRANT.
-- Único consumidor: useWwFunilConversao → aba Funil Comparado.

DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT); -- def viva 20260612a

CREATE FUNCTION public.ww_funil_conversao_v1(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_convidados TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_bt INT:=0; v_ft INT:=0; v_df INT; v_dc INT; v_dd INT; v_ac JSON;
BEGIN
    -- ⚠️ Filtro de canal redefine o universo: só casais que FIZERAM a reunião por aquele canal.
    --    As etapas anteriores à reunião ficam triviais (100%) — a leitura útil é DALI PRA FRENTE.
    -- throughput: cada marco conta pela DATA do próprio evento na janela (régua do ww2_overview/drill).
    -- cohort:     safra criada na janela; marcos CUMULATIVOS (chegou na etapa OU além — 20260531e).
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
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
      FROM ww_funil_casal c
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
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    SELECT COUNT(*) FILTER (WHERE m_entrou) INTO v_bt FROM _pool;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE m_entrou),
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
    SELECT COUNT(*) FILTER (WHERE m_entrou) INTO v_ft FROM _filt;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE m_entrou),
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
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww_funil_conversao_v1 IS
  'Funil de conversão Weddings (aba Funil comparado). cohort = safra criada na janela, marcos cumulativos (20260531e). throughput = o que ACONTECEU na janela: cada marco pela data do próprio evento (mesma régua do ww2_overview v8 e do ww_drill_casais) — número clicado = lista do drill. 20260612e.';


-- ═══════════════ ww_funil_ranking_combo: matriz "Funil por perfil" da MESMA aba ═══════════════
-- A matriz (em cima do Funil comparado) tem que contar com a MESMA régua do funil (acima) e do
-- drill. Antes, no throughput, só `ganho` era datado; agendou_sdr/fez_sdr/agendou_closer/fez_closer
-- ficavam como flags cumulativas "já alcançou alguma vez" → inflavam SDR/Closer e divergiam do funil
-- e da lista do drill na MESMA tela. Agora cada etapa conta pela data do próprio evento (throughput)
-- ou cumulativa dentro da safra (cohort), idêntico ao ww_funil_conversao_v1.
-- BÔNUS (isolamento de workspace): a versão anterior lia ww_funil_casal SEM filtro de org_id
-- (p_org_id existia mas era ignorado). Agora filtra por org_id = COALESCE(p_org_id, requesting_org_id()).
-- REBASE (TOP-5 #5): def viva = 20260612a (relida verbatim). Assinatura inalterada → DROP+CREATE.

DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT); -- def viva 20260612a

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
    p_destinos     TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_rows JSON; v_total INT:=0; v_dims TEXT[]; v_p0 NUMERIC:=0; v_bt INT:=0; v_bg INT:=0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d WHERE d IN ('faixa','convidados','destino','canal_sdr','canal_closer')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           COALESCE(c.lead_created_at BETWEEN p_date_start AND p_date_end, FALSE) AS k_entrou,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_sdr    AND c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_sdr OR c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_msdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_sdr        AND c.fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_sdr OR c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_fsdr,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.agendou_closer AND c.agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.agendou_closer OR c.fez_closer OR c.ganho, FALSE) END AS k_mclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.fez_closer     AND c.fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.fez_closer OR c.ganho, FALSE) END AS k_fclo,
           CASE WHEN p_date_mode='throughput'
                THEN COALESCE(c.ganho          AND c.ganho_at          BETWEEN p_date_start AND p_date_end, FALSE)
                ELSE COALESCE(c.ganho, FALSE) END AS k_g
      FROM ww_funil_casal c
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
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    SELECT COUNT(*) FILTER (WHERE k_entrou) INTO v_total FROM _pool;
    SELECT COUNT(*) FILTER (WHERE k_entrou), COUNT(*) FILTER (WHERE k_g) INTO v_bt, v_bg FROM _pool;
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
            SELECT g_faixa, g_conv, g_dest, g_csdr, g_cclo,
                   COUNT(*) FILTER (WHERE k_entrou) AS entrou,
                   COUNT(*) FILTER (WHERE k_msdr) AS m_sdr,
                   COUNT(*) FILTER (WHERE k_fsdr) AS f_sdr,
                   COUNT(*) FILTER (WHERE k_mclo) AS m_cl,
                   COUNT(*) FILTER (WHERE k_fclo) AS f_cl,
                   COUNT(*) FILTER (WHERE k_g) AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN COALESCE(faixa, 'Não informado') END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN COALESCE(convidados, 'Não informado') END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN COALESCE(destino, 'Não informado') END AS g_dest,
                       CASE WHEN 'canal_sdr'=ANY(v_dims) THEN COALESCE(canal_sdr, 'Não informado') END AS g_csdr,
                       CASE WHEN 'canal_closer'=ANY(v_dims) THEN COALESCE(canal_closer, 'Não informado') END AS g_cclo,
                       k_entrou, k_msdr, k_fsdr, k_mclo, k_fclo, k_g
                FROM _pool
            ) sel GROUP BY g_faixa, g_conv, g_dest, g_csdr, g_cclo
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww_funil_ranking_combo IS
  'Matriz "Funil por perfil" (aba Funil comparado). Mesma régua do ww_funil_conversao_v1: cohort = safra cumulativa; throughput = cada etapa pela data do próprio evento. Filtra por org_id (isolamento). 20260612e.';
