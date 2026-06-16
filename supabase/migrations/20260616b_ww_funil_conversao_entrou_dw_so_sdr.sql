-- 20260616b_ww_funil_conversao_entrou_dw_so_sdr.sql
--
-- Paridade com 20260616a: aplica a MESMA regra de "entrada válida" (DW só conta se passou
-- pela esteira SDR Weddings / dealGroup 1) no ww_funil_conversao_v1 (aba Funil comparado),
-- pra bater com o ww2_overview (Visão Geral) e satisfazer a invariante 3a (paridade).
--
-- ESCOPO IDÊNTICO ao overview: gateia SÓ o "entrou" (m_entrou). Ganho e demais marcos do
-- funil ficam intactos (fechados não muda — pedido do Vitor: ajustar só o Entrou).
--
-- Base: definição VIVA de produção (pg_get_functiondef, 2026-06-16).

CREATE OR REPLACE FUNCTION public.ww_funil_conversao_v1(p_date_start timestamp with time zone DEFAULT (now() - '90 days'::interval), p_date_end timestamp with time zone DEFAULT now(), p_date_mode text DEFAULT 'cohort'::text, p_org_id uuid DEFAULT NULL::uuid, p_faixas text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           -- 20260616a: DW só "entra" se passou pela esteira SDR Weddings (group 1) no Active.
           (c.tipo <> 'DW' OR EXISTS (
              SELECT 1 FROM ww_ac_deal_funnel_cache fcv
               WHERE fcv.contact_id = c.contact_id AND fcv.is_ww AND fcv.pipeline_group_id = 1
           )) AS entrada_valida,
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

    SELECT COUNT(*) FILTER (WHERE entrada_valida AND m_entrou) INTO v_bt FROM _pool;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE entrada_valida AND m_entrou),
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
    SELECT COUNT(*) FILTER (WHERE entrada_valida AND m_entrou) INTO v_ft FROM _filt;
    SELECT json_build_object('entrou', COUNT(*) FILTER (WHERE entrada_valida AND m_entrou),
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
END $function$
;
