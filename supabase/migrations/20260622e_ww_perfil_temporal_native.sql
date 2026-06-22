-- ============================================================================
-- 20260622e_ww_perfil_temporal_native.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2): a aba "Visão geral" → bloco "Perfil dos leads"
-- (sub-views "Ao longo do tempo" e "Por categoria") usava ww_perfil_temporal,
-- que NÃO tinha versão _native e lê a view do ActiveCampaign (ww_funil_casal).
-- Em Analytics 2 (native) isso misturava fonte AC com as RPCs nativas no MESMO
-- card (a sub-view "Cruzamento" ao lado já é nativa).
--
-- Cria ww_perfil_temporal_native = clone EXATO de ww_perfil_temporal (def viva,
-- 20260618c), mudando SÓ a fonte: FROM ww_funil_casal → FROM ww_funil_casal_native.
-- Mesma assinatura (18 params) e mesmo shape JSON. O hook useWwPerfilTemporal passa
-- a ser variant-aware (rpcName) para chamar esta função em native.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_perfil_temporal_native(
    p_date_start timestamp with time zone DEFAULT (now() - '365 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL::uuid,
    p_dim text DEFAULT 'destino'::text,
    p_marco text DEFAULT 'entrou'::text,
    p_granularidade text DEFAULT 'month'::text,
    p_date_mode text DEFAULT 'cohort'::text,
    p_origins text[] DEFAULT NULL::text[],
    p_tipos text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[],
    p_faixas text[] DEFAULT NULL::text[],
    p_convidados text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[],
    p_status_lead text DEFAULT NULL::text,
    p_max_buckets integer DEFAULT 8,
    p_buckets text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := COALESCE(p_org_id, requesting_org_id());
  v_trunc text := CASE WHEN p_granularidade = 'day' THEN 'day' WHEN p_granularidade = 'week' THEN 'week' ELSE 'month' END;
  v_lblfmt text := CASE WHEN p_granularidade = 'month' THEN 'MM/YYYY' ELSE 'DD/MM' END;
  v_series json; v_cat json; v_tops json; v_all json; v_total int;
BEGIN
  CREATE TEMP TABLE _pp ON COMMIT DROP AS
  SELECT
    COALESCE(NULLIF(TRIM(CASE p_dim
      WHEN 'faixa'      THEN c.faixa
      WHEN 'convidados' THEN c.convidados
      WHEN 'destino'    THEN c.destino
      WHEN 'origem'     THEN c.origem
      WHEN 'tipo'       THEN c.tipo_entrada
      ELSE c.destino END), ''), 'Não informado') AS bucket,
    COALESCE(c.entrou_valido, FALSE)  AS entrou_valido,
    c.lead_created_at,
    COALESCE(c.fez_sdr, FALSE)        AS fez_sdr,        c.fez_sdr_at,
    COALESCE(c.agendou_closer, FALSE) AS agendou_closer, c.agendou_closer_at,
    COALESCE(c.fez_closer, FALSE)     AS fez_closer,     c.fez_closer_at,
    COALESCE(c.ganho, FALSE)          AS ganho,          c.ganho_at,
    COALESCE(c.is_perdido, FALSE)     AS is_perdido
  FROM ww_funil_casal_native c
  WHERE c.org_id = v_org
    AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
    AND (p_tipos IS NULL         OR c.tipo_entrada = ANY(p_tipos))
    AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
    AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
    AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
    AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
    AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
    AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
    AND (p_status_lead IS NULL
         OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
         OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

  -- Tabela "por categoria": funil COHORT por bucket (leads criados no período).
  SELECT COALESCE(json_agg(json_build_object(
      'bucket', bucket, 'entrou', entrou, 'fez_sdr', fez_sdr, 'marcou_closer', marcou_closer,
      'fez_closer', fez_closer, 'ganho', ganho,
      'taxa_pct', CASE WHEN entrou > 0 THEN ROUND(100.0 * ganho / entrou, 1) END
    ) ORDER BY entrou DESC, ganho DESC), '[]'::json) INTO v_cat
  FROM (
    SELECT bucket,
      COUNT(*) FILTER (WHERE entrou_valido)                                    AS entrou,
      COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho)  AS fez_sdr,
      COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho)             AS marcou_closer,
      COUNT(*) FILTER (WHERE fez_closer OR ganho)                              AS fez_closer,
      COUNT(*) FILTER (WHERE ganho)                                           AS ganho
    FROM _pp
    WHERE lead_created_at BETWEEN p_date_start AND p_date_end
    GROUP BY bucket
  ) q
  WHERE entrou > 0 OR fez_sdr > 0 OR ganho > 0;

  -- Evento do marco escolhido (data + se atingiu) por MODO.
  CREATE TEMP TABLE _ev ON COMMIT DROP AS
  SELECT bucket,
    CASE WHEN p_date_mode = 'throughput' THEN
      CASE p_marco
        WHEN 'entrou'        THEN (CASE WHEN entrou_valido  AND lead_created_at   BETWEEN p_date_start AND p_date_end THEN lead_created_at   END)
        WHEN 'fez_sdr'       THEN (CASE WHEN fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end THEN fez_sdr_at        END)
        WHEN 'marcou_closer' THEN (CASE WHEN agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end THEN agendou_closer_at END)
        WHEN 'fez_closer'    THEN (CASE WHEN fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end THEN fez_closer_at     END)
        WHEN 'ganho'         THEN (CASE WHEN ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end THEN ganho_at          END)
      END
    ELSE
      (CASE WHEN lead_created_at BETWEEN p_date_start AND p_date_end AND (
         CASE p_marco
           WHEN 'entrou'        THEN entrou_valido
           WHEN 'fez_sdr'       THEN (fez_sdr OR agendou_closer OR fez_closer OR ganho)
           WHEN 'marcou_closer' THEN (agendou_closer OR fez_closer OR ganho)
           WHEN 'fez_closer'    THEN (fez_closer OR ganho)
           WHEN 'ganho'         THEN ganho
           ELSE FALSE
         END) THEN lead_created_at END)
    END AS ev_date
  FROM _pp;
  DELETE FROM _ev WHERE ev_date IS NULL;

  SELECT COUNT(*) INTO v_total FROM _ev;

  -- Universo completo de buckets (com total) — alimenta o seletor da UI.
  SELECT COALESCE(json_agg(json_build_object('bucket', bucket, 'total', n) ORDER BY n DESC), '[]'::json) INTO v_all
  FROM (SELECT bucket, COUNT(*) n FROM _ev GROUP BY bucket) z;

  -- Buckets a plotar: os escolhidos (p_buckets) OU o top p_max_buckets.
  IF p_buckets IS NOT NULL THEN
    CREATE TEMP TABLE _top ON COMMIT DROP AS SELECT DISTINCT bucket FROM _ev WHERE bucket = ANY(p_buckets);
  ELSE
    CREATE TEMP TABLE _top ON COMMIT DROP AS
    SELECT bucket FROM (SELECT bucket, COUNT(*) n FROM _ev GROUP BY bucket ORDER BY n DESC LIMIT GREATEST(1, p_max_buckets)) t;
  END IF;

  SELECT COALESCE(json_agg(bucket ORDER BY n DESC), '[]'::json) INTO v_tops
  FROM (SELECT e.bucket, COUNT(*) n FROM _ev e JOIN _top USING (bucket) GROUP BY e.bucket) z;

  -- Série temporal. Com p_buckets: só os escolhidos (sem "Outros"). Sem: top + "Outros".
  IF p_buckets IS NOT NULL THEN
    WITH mapped AS (
      SELECT date_trunc(v_trunc, e.ev_date) AS b, e.bucket AS bk
      FROM _ev e JOIN _top t ON t.bucket = e.bucket
    ),
    agg AS (SELECT b, bk, COUNT(*) n FROM mapped GROUP BY b, bk)
    SELECT COALESCE(json_agg(json_build_object(
        'periodo', to_char(b, 'YYYY-MM-DD'), 'label', to_char(b, v_lblfmt), 'bucket', bk, 'n', n
      ) ORDER BY b), '[]'::json) INTO v_series FROM agg;
  ELSE
    WITH mapped AS (
      SELECT date_trunc(v_trunc, e.ev_date) AS b,
             CASE WHEN t.bucket IS NOT NULL THEN e.bucket ELSE 'Outros' END AS bk
      FROM _ev e LEFT JOIN _top t ON t.bucket = e.bucket
    ),
    agg AS (SELECT b, bk, COUNT(*) n FROM mapped GROUP BY b, bk)
    SELECT COALESCE(json_agg(json_build_object(
        'periodo', to_char(b, 'YYYY-MM-DD'), 'label', to_char(b, v_lblfmt), 'bucket', bk, 'n', n
      ) ORDER BY b), '[]'::json) INTO v_series FROM agg;
  END IF;

  RETURN json_build_object(
    'dim', p_dim, 'marco', p_marco, 'granularidade', v_trunc, 'date_mode', p_date_mode,
    'total_marco', v_total,
    'buckets_top', v_tops,
    'buckets_all', v_all,
    'series', v_series,
    'por_categoria', v_cat
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.ww_perfil_temporal_native(timestamptz,timestamptz,uuid,text,text,text,text,text[],text[],uuid[],text[],text[],text[],text[],text[],text,integer,text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
