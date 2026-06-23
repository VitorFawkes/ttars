-- ============================================================================
-- 20260622c_ww_native_origem_utm.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2 native) — aba Marketing: 86% origem "Desconhecida".
--
-- Causas:
--  (A) cards.utm_* só preenchido em ~33% dos cards WEDDING. O sync existente
--      (ww_sync_analytics_fields_from_cache, 20260619i + cron 20260619e) casa
--      card↔cache por cards.external_id (UM deal). Mas o UTM mora no CONTATO do
--      Active; o deal específico apontado pelo external_id muitas vezes tem UTM
--      vazio no cache, enquanto OUTRO deal do mesmo casal tem. Teto ~33%.
--  (B) A view ww_funil_casal_native deriva `origem` SÓ de
--      produto_data->>'ww_sdr_como_conheceu' (preenchido em ~18%), ignorando o
--      utm_source já espelhado no card.
--
-- Correções:
--  PARTE 1 — Backfill robusto: casa card → seu deal → CONTATO → QUALQUER deal
--            is_ww do mesmo contato com UTM não-vazio. fill-empty-only.
--  PARTE 2 — View passa a derivar origem de COALESCE(campo manual, utm_source),
--            normalizando UMA vez (NULLIF antes, porque _ww_ac_norm_origem('')
--            devolve 'Desconhecida', não NULL → não dá pra encadear no COALESCE).
--
-- Recria a VIEW partindo da def viva (20260619b), mudando SÓ a linha de `origem`.
-- Demais colunas idênticas e na mesma ordem (a view alimenta 5 RPCs *_native).
-- ============================================================================

BEGIN;

-- PARTE 1 — Backfill contact-level dos cards.utm_* a partir do cache.
-- Marca a origem da escrita como 'integration' p/ não disparar push/cadência.
SELECT set_config('app.update_source', 'integration', true);

WITH best AS (
    SELECT mycard.id AS card_id,
           (array_agg(NULLIF(btrim(fc2.utm_source),   '') ORDER BY fc2.synced_at DESC)
              FILTER (WHERE NULLIF(btrim(fc2.utm_source),'')   IS NOT NULL))[1] AS utm_source,
           (array_agg(NULLIF(btrim(fc2.utm_medium),   '') ORDER BY fc2.synced_at DESC)
              FILTER (WHERE NULLIF(btrim(fc2.utm_medium),'')   IS NOT NULL))[1] AS utm_medium,
           (array_agg(NULLIF(btrim(fc2.utm_campaign), '') ORDER BY fc2.synced_at DESC)
              FILTER (WHERE NULLIF(btrim(fc2.utm_campaign),'') IS NOT NULL))[1] AS utm_campaign
      FROM cards mycard
      JOIN ww_ac_deal_funnel_cache fc1 ON fc1.ac_deal_id = mycard.external_id
      JOIN ww_ac_deal_funnel_cache fc2 ON fc2.contact_id = fc1.contact_id AND fc2.is_ww
     WHERE mycard.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
       AND mycard.produto = 'WEDDING'
       AND mycard.deleted_at IS NULL
       AND mycard.external_id IS NOT NULL
     GROUP BY mycard.id
)
UPDATE public.cards c
   SET utm_source   = CASE WHEN COALESCE(c.utm_source,'')=''   THEN best.utm_source   ELSE c.utm_source   END,
       utm_medium   = CASE WHEN COALESCE(c.utm_medium,'')=''   THEN best.utm_medium   ELSE c.utm_medium   END,
       utm_campaign = CASE WHEN COALESCE(c.utm_campaign,'')='' THEN best.utm_campaign ELSE c.utm_campaign END
  FROM best
 WHERE c.id = best.card_id
   AND (
        (COALESCE(c.utm_source,'')=''   AND best.utm_source   IS NOT NULL)
     OR (COALESCE(c.utm_medium,'')=''   AND best.utm_medium   IS NOT NULL)
     OR (COALESCE(c.utm_campaign,'')='' AND best.utm_campaign IS NOT NULL)
   );

-- PARTE 2 — View: origem agora prioriza o campo declarado e cai pro utm_source.
CREATE OR REPLACE VIEW public.ww_funil_casal_native AS
WITH stage_entry AS (
    SELECT a.card_id,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Reunião Agendada')  AS sdr_agendada_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Reunião Realizada') AS sdr_realizada_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = '1ª Reunião')         AS closer_1a_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Em contato')         AS closer_contato_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Contrato enviado')   AS closer_contrato_at,
           MIN(a.created_at) FILTER (WHERE a.metadata->>'new_stage_name' = 'Em negociação')      AS closer_negociacao_at
      FROM activities a
     WHERE a.tipo = 'stage_changed'
       AND a.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
     GROUP BY a.card_id
),
base AS (
    SELECT c.*,
           se.sdr_agendada_at, se.sdr_realizada_at, se.closer_1a_at,
           se.closer_contato_at, se.closer_contrato_at, se.closer_negociacao_at,
           COALESCE(c.vendas_owner_id, c.sdr_owner_id, c.dono_atual_id) AS v_consultor_id,
           CASE WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopement%'
                THEN 'Elopement' ELSE 'DW' END AS v_tipo,
           public._ww_native_ts(c.produto_data->>'ww_sdr_data_reuniao')    AS f_sdr_data,
           NULLIF(trim(c.produto_data->>'ww_sdr_como_reuniao'), '')         AS f_sdr_como,
           public._ww_native_ts(c.produto_data->>'ww_closer_data_reuniao') AS f_closer_data,
           NULLIF(trim(c.produto_data->>'ww_closer_como_reuniao'), '')      AS f_closer_como,
           public._ww_native_ts(c.produto_data->>'ww_closer_data_ganho')   AS f_ganho_data
      FROM cards c
      LEFT JOIN stage_entry se ON se.card_id = c.id
     WHERE c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
       AND c.produto = 'WEDDING'
       AND c.deleted_at IS NULL
)
SELECT
    b.org_id, b.id::text AS contact_id, b.titulo AS deal_title,
    b.v_tipo AS tipo, (b.v_tipo = 'Elopement') AS is_elopement,
    b.created_at AS lead_created_at,
    b.closer_1a_at AS entrou_closer_at,
    b.closer_1a_at AS entrou_1a_reuniao_at,
    b.closer_contrato_at AS entrou_contrato_enviado_at,
    b.closer_negociacao_at AS entrou_negociacao_at,
    NULL::timestamptz AS entrou_op_futura_at,
    NULL::timestamptz AS entrou_planejamento_at,
    NULL::timestamptz AS entrou_producao_at,
    NULL::timestamptz AS entrou_controle_at,
    NULL::timestamptz AS elopement_assinatura_at,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at)                          AS sdr_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_sdr_como_reuniao')      AS sdr_canal,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at)          AS closer_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_closer_como_reuniao')   AS closer_canal,
    (COALESCE(b.f_sdr_data, b.sdr_agendada_at) IS NOT NULL)            AS agendou_sdr,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at)                         AS agendou_sdr_at,
    (b.f_sdr_como IS NOT NULL OR b.sdr_realizada_at IS NOT NULL)       AS fez_sdr,
    COALESCE(CASE WHEN b.f_sdr_como IS NOT NULL THEN b.f_sdr_data END, b.sdr_realizada_at, b.f_sdr_data) AS fez_sdr_at,
    CASE WHEN b.f_sdr_como IS NOT NULL THEN 'campo_analytics' ELSE 'ttars_stage_log' END AS fez_sdr_fonte,
    (COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) IS NOT NULL) AS agendou_closer,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at)          AS agendou_closer_at,
    CASE WHEN b.f_closer_data IS NOT NULL THEN 'campo_analytics' ELSE 'ttars' END AS agendou_closer_fonte,
    (b.f_closer_como IS NOT NULL OR b.closer_contato_at IS NOT NULL)   AS fez_closer,
    COALESCE(CASE WHEN b.f_closer_como IS NOT NULL THEN b.f_closer_data END, b.closer_contato_at) AS fez_closer_at,
    CASE WHEN b.f_closer_como IS NOT NULL THEN 'campo_analytics' ELSE 'ttars' END AS fez_closer_fonte,
    (b.f_ganho_data IS NOT NULL OR b.status_comercial = 'ganho')      AS ganho,
    COALESCE(b.f_ganho_data,
             CASE WHEN b.status_comercial='ganho'
                  THEN COALESCE(b.data_fechamento::timestamptz, b.ganho_planner_at, b.updated_at) END) AS ganho_at,
    CASE WHEN b.f_ganho_data IS NOT NULL THEN 'campo_analytics' ELSE 'ttars_status' END AS ganho_fonte,
    (b.status_comercial = 'perdido')                                  AS is_perdido,
    now() AS refreshed_at,
    _ww2_norm_faixa_strict(COALESCE(b.produto_data->>'ww_orcamento_faixa', b.produto_data->>'ww_mkt_orcamento_form'))                                          AS faixa,
    _ww2_norm_conv_strict(COALESCE(b.produto_data->>'ww_num_convidados', b.produto_data->>'ww_mkt_convidados_form', b.produto_data->>'ww_convidados_refinado')) AS convidados,
    _ww2_norm_dest_strict(COALESCE(b.produto_data->>'ww_destino', b.produto_data->>'ww_mkt_destino_form', b.produto_data->>'ww_onde_casar_refinado'))           AS destino,
    -- ORIGEM (FIX 2): campo declarado na qualificação OU utm_source rastreado.
    -- COALESCE nos valores CRUS (normaliza 1x), porque _ww_ac_norm_origem('') => 'Desconhecida'.
    _ww_ac_norm_origem(COALESCE(NULLIF(b.produto_data->>'ww_sdr_como_conheceu',''), NULLIF(b.utm_source,'')))         AS origem,
    b.v_consultor_id AS consultor_id,
    p.nome AS consultor_nome,
    (b.v_tipo <> 'Elopement') AS entrou_sdr,
    (b.v_tipo = 'Elopement')  AS entrou_elopement,
    b.v_tipo AS tipo_entrada,
    TRUE AS entrou_valido,
    b.valor_final AS valor_final
  FROM base b
  LEFT JOIN profiles p ON p.id = b.v_consultor_id;

GRANT SELECT ON public.ww_funil_casal_native TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
