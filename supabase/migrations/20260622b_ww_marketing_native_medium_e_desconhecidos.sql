-- ============================================================================
-- 20260622b_ww_marketing_native_medium_e_desconhecidos.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2 native) — aba Marketing, 2 correções pequenas:
--
-- 3a) Medium sem normalização: "linktree" e "linketree" (e "insta") contavam
--     como valores distintos no por_medium. Cria _ww_norm_medium() (espelho de
--     _ww_ac_norm_origem, 20260530d) e aplica na leitura do medium.
--
-- 3b) por_campaign / por_medium EXCLUÍAM 'Desconhecida'/'Desconhecido' enquanto
--     por_origem mantém. Isso somia categorias e fazia os totais não fecharem.
--     Remove a exclusão: o balde "sem UTM" agora aparece (igual ao por_origem).
--
-- Recria ww2_marketing_native partindo da def viva (20260619n), mudando SÓ
-- esses 2 pontos. Mesma assinatura e mesmo shape JSON.
-- ============================================================================

-- 3a — normalizador de medium (lower+trim, canonicaliza grafias conhecidas).
CREATE OR REPLACE FUNCTION public._ww_norm_medium(v text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN NULL
    WHEN lower(btrim(v)) IN ('linketree','linktree','linktr.ee','linktree.ee') THEN 'linktree'
    WHEN lower(btrim(v)) IN ('insta','instagram','ig') THEN 'instagram'
    WHEN lower(btrim(v)) IN ('fb','facebook','meta') THEN 'facebook'
    ELSE lower(btrim(v))
  END;
$$;

CREATE OR REPLACE FUNCTION public.ww2_marketing_native(
    p_date_start    timestamptz DEFAULT (now() - '30 days'::interval),
    p_date_end      timestamptz DEFAULT now(),
    p_date_mode     text        DEFAULT 'cohort'::text,
    p_org_id        uuid        DEFAULT NULL::uuid,
    p_origins       text[]      DEFAULT NULL::text[],
    p_faixas        text[]      DEFAULT NULL::text[],
    p_destinos      text[]      DEFAULT NULL::text[],
    p_tipos         text[]      DEFAULT NULL::text[],
    p_consultor_ids uuid[]      DEFAULT NULL::uuid[],
    p_sdr_canal     text[]      DEFAULT NULL::text[],
    p_closer_canal  text[]      DEFAULT NULL::text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_mn ON COMMIT DROP AS
    SELECT v.contact_id,
           v.lead_created_at                                          AS entrada_at,
           v.ganho_at,
           v.fez_sdr_at                                               AS qualif_at,
           v.valor_final                                              AS valor_pac,
           v.origem                                                   AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida')       AS campaign,
           -- 3a: medium normalizado (linktree/linketree, insta, fb…)
           COALESCE(public._ww_norm_medium(c.utm_medium), 'Desconhecido') AS medium,
           v.faixa                                                    AS faixa,
           v.tipo_entrada                                             AS tipo,
           _ww_norm_canal_strict(v.sdr_canal)                         AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal)                      AS canal_closer,
           COALESCE(v.ganho, FALSE)                                   AS fechado
      FROM ww_funil_casal_native v
      JOIN cards c ON c.id = v.contact_id::uuid
     WHERE v.org_id = v_org_id
       AND COALESCE(v.entrou_valido, FALSE)
       AND v.lead_created_at BETWEEN p_date_start AND p_date_end;

    IF p_origins      IS NOT NULL THEN DELETE FROM _ww2_mn WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas       IS NOT NULL THEN DELETE FROM _ww2_mn WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos        IS NOT NULL THEN DELETE FROM _ww2_mn WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal    IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_mn t USING ww_funil_casal_native v
         WHERE v.contact_id = t.contact_id
           AND (v.consultor_id IS NULL OR v.consultor_id != ALL(p_consultor_ids));
    END IF;

    -- POR ORIGEM (idêntico ao original — mantém "Desconhecida")
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
          FROM _ww2_mn
         GROUP BY origem) x;

    -- 3b: POR CAMPAIGN — NÃO exclui mais 'Desconhecida' (totais fecham); top 15
    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_mn GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    -- 3b: POR MEDIUM — NÃO exclui mais 'Desconhecido' (totais fecham); top 10
    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_mn GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- FUNIL POR ORIGEM (top 5) — inalterado
    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_mn GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_mn;

    RETURN json_build_object(
        'por_origem',   COALESCE(v_por_origem,   '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium',   COALESCE(v_por_medium,   '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON),
        'fonte', 'native (ttars): pool = ww_funil_casal_native (cohort por lead_created_at + entrou_valido); UTM = cards.utm_* via id=contact_id; medium normalizado; desconhecidos mantidos'
    );
END $function$;
