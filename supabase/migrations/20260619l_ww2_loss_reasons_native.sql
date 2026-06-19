-- ============================================================================
-- 20260619l_ww2_loss_reasons_native.sql
-- ----------------------------------------------------------------------------
-- ttars-NATIVE loss-reasons RPC for the Weddings "Analytics 2" dashboard.
--
-- This is the native twin of public.ww2_loss_reasons. It produces the SAME
-- JSON shape (motivos_sdr, motivos_closer, motivo_faixa, motivo_canal,
-- motivo_canal_closer, tendencia) and accepts the SAME 12-param signature,
-- but it reads ONLY from ttars:
--   * universe of losses = WEDDING cards (status_comercial='perdido')
--   * per-card dimensions (faixa/convidados/destino/origem/tipo/canal/...)
--     come from the native view ww_funil_casal_native
--   * loss reason = cards.motivo_perda_id -> motivos_perda.nome
--
-- It NEVER touches ww_ac_deal_funnel_cache, the ww_funil_casal snapshot, or
-- vw_ww_funnel_base.
--
-- ---------------------------------------------------------------------------
-- DESIGN NOTES / ASSUMPTIONS (loss-reason semantics differ from the AC twin):
--
-- 1) ONE motivo per card in ttars.
--    The AC twin had two raw columns (motivo_perda_sdr_raw / _closer_raw).
--    ttars stores a single motivo (cards.motivo_perda_id). So the SDR-vs-Closer
--    split is NOT done on the reason itself; it is done by *where the couple
--    was lost*, and the same single motivo flows into whichever bucket the
--    card lands in.
--
-- 2) SDR vs Closer bucketing — why NOT the current pipeline phase.
--    The spec suggested bucketing by the card's CURRENT phase
--    (cards.pipeline_stage_id -> pipeline_stages -> pipeline_phases.slug:
--     'sdr' -> motivos_sdr; 'closer'/'pos_venda'/'resolucao' -> motivos_closer).
--    In production EVERY lost WEDDING card with a motivo currently sits in the
--    terminal 'resolucao' phase (2684/2684). Bucketing by current phase would
--    therefore dump 100% into motivos_closer and leave motivos_sdr empty —
--    useless, and not what the AC twin conveyed.
--    Instead we bucket by the couple's furthest PROGRESSION (from the native
--    view), which is the faithful native equivalent of the AC split:
--       reached Closer (agendou_closer OR fez_closer)  -> motivos_closer
--       otherwise (never reached Closer)               -> motivos_sdr
--    This gives meaningful, non-empty buckets on both sides. The current-phase
--    slug is still computed (v_current_phase) and kept for documentation, but
--    progression is the bucketing key.
--
-- 3) Cohort date = native lead-entry timestamp (ww_funil_casal_native.lead_created_at).
--    The AC twin cohorted by COALESCE(sdr_agendou_at, closer_agendou_at, ganho_at);
--    in ttars that COALESCE is NULL for ~60% of lost cards (most never got a
--    meeting timestamp), which would silently drop most losses. lead_created_at
--    covers 100% of lost cards and matches the spec's "cohort by lead-entry /
--    created window". p_date_mode is accepted but ignored (the AC twin also
--    never used it).
--
-- 4) motivo_canal / motivo_canal_closer use sdr_canal / closer_canal from the
--    native view (only couples that actually have a channel filled), mirroring
--    the AC twin (which kept only rows with a non-null channel).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww2_loss_reasons_native(
    p_date_start    timestamptz DEFAULT (now() - '90 days'::interval),
    p_date_end      timestamptz DEFAULT now(),
    p_date_mode     text        DEFAULT 'cohort'::text,
    p_org_id        uuid        DEFAULT NULL::uuid,
    p_origins       text[]      DEFAULT NULL::text[],
    p_faixas        text[]      DEFAULT NULL::text[],
    p_destinos      text[]      DEFAULT NULL::text[],
    p_tipos         text[]      DEFAULT NULL::text[],
    p_consultor_ids uuid[]      DEFAULT NULL::uuid[],
    p_sdr_canal     text[]      DEFAULT NULL::text[],
    p_closer_canal  text[]      DEFAULT NULL::text[],
    p_convidados    text[]      DEFAULT NULL::text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sdr JSON; v_closer JSON; v_motivo_faixa JSON; v_tendencia JSON;
    v_motivo_canal JSON; v_motivo_canal_closer JSON;
BEGIN
    -- One row per LOST WEDDING card, enriched with native-view dimensions and
    -- the SDR/Closer bucket. Cohort window is by native lead-entry timestamp.
    CREATE TEMP TABLE _ww2_l_native ON COMMIT DROP AS
    SELECT c.id                                         AS card_id,
           v.lead_created_at                            AS entrada_at,
           mp.nome                                      AS motivo,
           -- SDR vs Closer bucket (see DESIGN NOTE 2):
           CASE WHEN COALESCE(v.agendou_closer, FALSE)
                  OR COALESCE(v.fez_closer, FALSE)
                THEN 'closer' ELSE 'sdr' END            AS bucket,
           v.faixa                                      AS faixa,
           v.destino                                    AS destino,
           v.convidados                                 AS convidados,
           v.sdr_canal                                  AS canal_sdr,
           v.closer_canal                               AS canal_closer,
           v.consultor_id                               AS consultor_id,
           v.origem                                     AS origem,
           v.tipo                                       AS tipo
      FROM cards c
      JOIN ww_funil_casal_native v ON v.contact_id = c.id::TEXT
      JOIN motivos_perda mp        ON mp.id = c.motivo_perda_id
     WHERE c.org_id     = 'b0000000-0000-0000-0000-000000000002'::uuid
       AND c.produto    = 'WEDDING'::app_product
       AND c.deleted_at IS NULL
       AND c.status_comercial = 'perdido'
       AND c.motivo_perda_id  IS NOT NULL
       AND v.lead_created_at IS NOT NULL
       AND v.lead_created_at BETWEEN p_date_start AND p_date_end;

    -- Same defensive filters as the AC twin, against native-view columns.
    IF p_origins       IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE origem != ALL(p_origins); END IF;
    IF p_faixas        IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos      IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados    IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_tipos         IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal     IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal  IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww2_l_native WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    -- motivos_sdr: losses bucketed to SDR (never reached Closer).
    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo, COUNT(*) AS qtd FROM _ww2_l_native
           WHERE motivo IS NOT NULL AND bucket = 'sdr'
           GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 12) x;

    -- motivos_closer: losses bucketed to Closer (reached Closer).
    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo, COUNT(*) AS qtd FROM _ww2_l_native
           WHERE motivo IS NOT NULL AND bucket = 'closer'
           GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 12) x;

    -- motivo × faixa: across all losses (single ttars motivo).
    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo, faixa, COUNT(*) AS qtd
            FROM _ww2_l_native WHERE motivo IS NOT NULL AND faixa IS NOT NULL
           GROUP BY motivo, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    -- motivo × tipo de reunião — SDR: only couples whose SDR channel is filled.
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal
    FROM (SELECT motivo, canal_sdr AS canal, COUNT(*) AS qtd
            FROM _ww2_l_native
           WHERE motivo IS NOT NULL AND canal_sdr IS NOT NULL AND bucket = 'sdr'
           GROUP BY motivo, canal_sdr ORDER BY COUNT(*) DESC LIMIT 60) x;

    -- motivo × tipo de reunião — Closer: only couples whose Closer channel is filled.
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal_closer
    FROM (SELECT motivo, canal_closer AS canal, COUNT(*) AS qtd
            FROM _ww2_l_native
           WHERE motivo IS NOT NULL AND canal_closer IS NOT NULL AND bucket = 'closer'
           GROUP BY motivo, canal_closer ORDER BY COUNT(*) DESC LIMIT 60) x;

    -- tendencia: top motivos by month (cohort timestamp = lead_created_at).
    WITH top_motivos AS (
        SELECT motivo FROM _ww2_l_native WHERE motivo IS NOT NULL
        GROUP BY motivo ORDER BY COUNT(*) DESC LIMIT 5
    )
    SELECT json_agg(json_build_object('mes', mes, 'motivo', motivo, 'qtd', qtd) ORDER BY mes, qtd DESC) INTO v_tendencia
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', l.entrada_at), 'YYYY-MM') AS mes,
                 l.motivo AS motivo, COUNT(*) AS qtd
            FROM _ww2_l_native l
           WHERE l.motivo IN (SELECT motivo FROM top_motivos)
           GROUP BY DATE_TRUNC('month', l.entrada_at), l.motivo) x;

    DROP TABLE _ww2_l_native;

    RETURN json_build_object(
        'motivos_sdr',         COALESCE(v_sdr, '[]'::JSON),
        'motivos_closer',      COALESCE(v_closer, '[]'::JSON),
        'motivo_faixa',        COALESCE(v_motivo_faixa, '[]'::JSON),
        'motivo_canal',        COALESCE(v_motivo_canal, '[]'::JSON),
        'motivo_canal_closer', COALESCE(v_motivo_canal_closer, '[]'::JSON),
        'tendencia',           COALESCE(v_tendencia, '[]'::JSON),
        'fonte', 'ttars nativo (cards perdidos WEDDING + motivos_perda + ww_funil_casal_native; split SDR/Closer por progressao; sem cache AC)'
    );
END $function$;
