-- 20260619n_ww2_marketing_native.sql
-- Analytics 2 / Weddings — versão NATIVA (ttars) do RPC ww2_marketing.
--
-- Original (ww2_marketing) lê ww_ac_deal_funnel_cache (universo AC).
-- Esta versão lê SOMENTE fontes nativas do ttars:
--   * Pool de leads:  ww_funil_casal_native (1 linha / card WEDDING)
--   * UTM (campaign/medium/source): cards.utm_* via JOIN cards.id = view.contact_id::uuid
--
-- Mesma assinatura e mesmo shape de JSON do original
-- (por_origem, por_campaign, por_medium, funil_origem, fonte).
--
-- Mapeamento de campos (original -> nativo):
--   origem        -> view.origem (já normalizado pela view; NÃO reaplicar _ww_ac_norm_origem)
--   qualif_at     -> view.fez_sdr_at   (qualificado = fez_sdr)
--   fechado       -> view.ganho
--   ticket (valor)-> view.valor_final
--   campaign      -> cards.utm_campaign (NULL/'' -> 'Desconhecida', excluído de por_campaign)
--   medium        -> cards.utm_medium   (NULL/'' -> 'Desconhecido',  excluído de por_medium)
--   canal_sdr/closer -> _ww_norm_canal_strict(view.sdr_canal / view.closer_canal)
--   período       -> anchor em lead_created_at + entrou_valido (padrão nativo, igual ww2_overview_native)
--
-- SECURITY DEFINER, SET search_path = public.

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
    -- Pool por CASAL (card) — fonte 100% nativa.
    -- Período: cohort por lead_created_at + entrada válida (padrão ww2_overview_native).
    CREATE TEMP TABLE _ww2_mn ON COMMIT DROP AS
    SELECT v.contact_id,
           v.lead_created_at                                      AS entrada_at,
           v.ganho_at,
           v.fez_sdr_at                                           AS qualif_at,
           v.valor_final                                          AS valor_pac,
           v.origem                                               AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida')   AS campaign,
           COALESCE(NULLIF(c.utm_medium, ''),   'Desconhecido')   AS medium,
           v.faixa                                                AS faixa,
           v.tipo_entrada                                         AS tipo,
           _ww_norm_canal_strict(v.sdr_canal)                     AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal)                  AS canal_closer,
           COALESCE(v.ganho, FALSE)                               AS fechado
      FROM ww_funil_casal_native v
      JOIN cards c ON c.id = v.contact_id::uuid
     WHERE v.org_id = v_org_id
       AND COALESCE(v.entrou_valido, FALSE)
       AND v.lead_created_at BETWEEN p_date_start AND p_date_end;

    -- Filtros aplicados ao POOL inteiro (todos os blocos), igual ao original (auditoria 2026-06-11).
    IF p_origins      IS NOT NULL THEN DELETE FROM _ww2_mn WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas       IS NOT NULL THEN DELETE FROM _ww2_mn WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos        IS NOT NULL THEN DELETE FROM _ww2_mn WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal    IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_mn WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    -- consultor: dono do card (nativo) — sem a perna AC do original.
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_mn t USING ww_funil_casal_native v
         WHERE v.contact_id = t.contact_id
           AND (v.consultor_id IS NULL OR v.consultor_id != ALL(p_consultor_ids));
    END IF;

    -- POR ORIGEM (idêntico ao original)
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

    -- POR CAMPAIGN (cards.utm_campaign; exclui 'Desconhecida'; top 15)
    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_mn WHERE campaign != 'Desconhecida' GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    -- POR MEDIUM (cards.utm_medium; exclui 'Desconhecido'; top 10)
    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_mn WHERE medium != 'Desconhecido' GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- FUNIL POR ORIGEM (top 5)
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
        'fonte', 'native (ttars): pool = ww_funil_casal_native (cohort por lead_created_at + entrou_valido); UTM = cards.utm_* via id=contact_id'
    );
END $function$;
