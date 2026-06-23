-- ============================================================================
-- 20260622a_ww2_loss_reasons_native_motivo_real.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2 native): a aba "Motivos de perda" mostrava 100%
-- "Perdido via ActiveCampaign". Causa: ww2_loss_reasons_native lia o motivo de
-- cards.motivo_perda_id -> motivos_perda.nome, que o integration-process seta
-- SEMPRE no motivo genérico ("Perdido via ActiveCampaign").
--
-- O motivo REAL já está no card, sincronizado do AC (campo 56 SDR / 47 Closer)
-- via field-mapping 20260525a:
--   cards.produto_data->>'ww_motivo_perda_sdr'
--   cards.produto_data->>'ww_motivo_perda_closer'
-- Cobertura: ~82% dos perdidos WEDDING têm motivo real (ex: "Não concordou/não
-- pagou a taxa de serviço", "Fechou com outra assessoria", "Não respondeu mais").
--
-- Esta migration RECRIA ww2_loss_reasons_native partindo da def viva (20260619l)
-- e muda SÓ a fonte do motivo: passa a ler os dois campos do produto_data
-- (espelhando o gêmeo AC public.ww2_loss_reasons em 20260525e:634-673), com
-- bucket SDR/Closer pelo campo preenchido. Mesma assinatura (12 params) e MESMO
-- shape JSON (motivos_sdr, motivos_closer, motivo_faixa, motivo_canal,
-- motivo_canal_closer, tendencia, fonte).
--
-- Sem backfill: o dado já está nos cards. Os ~18% sem motivo no produto_data
-- simplesmente não entram nas listas (motivo IS NOT NULL), igual ao gêmeo AC.
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
    -- One row per LOST WEDDING card. O motivo REAL vem do produto_data (sync AC
    -- campo 56/47), separado em SDR e Closer pela coluna preenchida. As demais
    -- dimensões (faixa/destino/convidados/canal/consultor/origem/tipo) vêm da
    -- view nativa. Coorte por lead_created_at (cobre 100% dos perdidos).
    CREATE TEMP TABLE _ww2_l_native ON COMMIT DROP AS
    SELECT c.id                                                         AS card_id,
           v.lead_created_at                                            AS entrada_at,
           NULLIF(trim(c.produto_data->>'ww_motivo_perda_sdr'),'')      AS motivo_sdr,
           NULLIF(trim(c.produto_data->>'ww_motivo_perda_closer'),'')   AS motivo_closer,
           -- motivo "efetivo" p/ cruzamentos (Closer vence: perda mais avançada)
           COALESCE(NULLIF(trim(c.produto_data->>'ww_motivo_perda_closer'),''),
                    NULLIF(trim(c.produto_data->>'ww_motivo_perda_sdr'),''))  AS motivo,
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
     WHERE c.org_id     = 'b0000000-0000-0000-0000-000000000002'::uuid
       AND c.produto    = 'WEDDING'::app_product
       AND c.deleted_at IS NULL
       AND c.status_comercial = 'perdido'
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

    -- motivos_sdr: motivo real do campo SDR (ww_motivo_perda_sdr).
    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww2_l_native
           WHERE motivo_sdr IS NOT NULL
           GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 12) x;

    -- motivos_closer: motivo real do campo Closer (ww_motivo_perda_closer).
    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww2_l_native
           WHERE motivo_closer IS NOT NULL
           GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 12) x;

    -- motivo × faixa: usa o motivo efetivo (cobre perdas SDR e Closer).
    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo, faixa, COUNT(*) AS qtd
            FROM _ww2_l_native WHERE motivo IS NOT NULL AND faixa IS NOT NULL
           GROUP BY motivo, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    -- motivo × tipo de reunião — SDR: motivo SDR + canal SDR preenchidos.
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal
    FROM (SELECT motivo_sdr AS motivo, canal_sdr AS canal, COUNT(*) AS qtd
            FROM _ww2_l_native
           WHERE motivo_sdr IS NOT NULL AND canal_sdr IS NOT NULL
           GROUP BY motivo_sdr, canal_sdr ORDER BY COUNT(*) DESC LIMIT 60) x;

    -- motivo × tipo de reunião — Closer: motivo Closer + canal Closer preenchidos.
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal_closer
    FROM (SELECT motivo_closer AS motivo, canal_closer AS canal, COUNT(*) AS qtd
            FROM _ww2_l_native
           WHERE motivo_closer IS NOT NULL AND canal_closer IS NOT NULL
           GROUP BY motivo_closer, canal_closer ORDER BY COUNT(*) DESC LIMIT 60) x;

    -- tendencia: top motivos efetivos por mês (coorte = lead_created_at).
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
        'fonte', 'ttars nativo (cards perdidos WEDDING; motivo real de produto_data ww_motivo_perda_sdr/closer; dimensoes de ww_funil_casal_native)'
    );
END $function$;
