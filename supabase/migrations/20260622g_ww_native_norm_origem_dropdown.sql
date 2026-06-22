-- ============================================================================
-- 20260622g_ww_native_norm_origem_dropdown.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2, funil-4): dropdown de Origem (native) poluído com strings
-- cruas de campanha do utm_source — "Conversão | RMKT | Hard Sale | Black | IG |
-- Estático", "Gadsense", "Chatgpt.com", "Wedding_Leads_Ads_RMKT", etc.
--
-- ESCOPO: só Analytics 2 (native). NÃO altera _ww_ac_norm_origem (compartilhado com
-- Analytics 1/AC e com 2 migrations anteriores — alto risco). Em vez disso, cria um
-- wrapper NOVO _ww_native_norm_origem que aplica as limpezas extras e DELEGA o resto
-- ao normalizador base (preserva 100% das regras de 20260530c/d). A view native passa
-- a usar o wrapper.
--
-- Limpezas extras (validadas contra os valores crus reais; 24 linhas → ~11 baldes):
--  - caminhos de campanha (" | ", "rmkt", "hard sale") → "Anúncios pagos"
--    (ANTES de delegar: as strings contêm o token "IG" e virariam Instagram por engano)
--  - tiktok → TikTok · chatgpt/openai → ChatGPT · linktree → Linktree
--  - "...casamento" → Indicação · adsense/gadsense → Google · activecampaign → Outros
-- Zero mutação de dados.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._ww_native_norm_origem(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE v text := lower(btrim(COALESCE(p_raw, '')));
BEGIN
  IF v = '' THEN RETURN 'Desconhecida'; END IF;
  -- caminhos de campanha / anúncios pagos ANTES de tudo (token "IG" não vira Instagram)
  IF v LIKE '% | %' OR v LIKE '%rmkt%' OR v LIKE '%hard sale%' THEN RETURN 'Anúncios pagos'; END IF;
  IF v LIKE '%tiktok%' OR v LIKE '%tik tok%' THEN RETURN 'TikTok'; END IF;
  IF v LIKE '%chatgpt%' OR v LIKE '%openai%'  THEN RETURN 'ChatGPT'; END IF;
  IF v LIKE '%linktree%' OR v LIKE '%linktr%' THEN RETURN 'Linktree'; END IF;
  IF v LIKE '%casamento%'                     THEN RETURN 'Indicação'; END IF;
  IF v LIKE '%adsense%' OR v LIKE '%gadsense%' THEN RETURN 'Google'; END IF;
  IF v LIKE '%activecampaign%'                THEN RETURN 'Outros'; END IF;
  -- resto: normalizador base (instagram/leadster/facebook/google/site/indicação/else)
  RETURN public._ww_ac_norm_origem(p_raw);
END $function$;

-- View recria do corpo da 20260622d, mudando SÓ a chamada de origem (base → wrapper native).
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
                  OR COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopment%'
                THEN 'Elopement'
                WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') = '' AND c.titulo ILIKE 'elopement%'
                THEN 'Elopement'
                ELSE 'DW' END AS v_tipo,
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
       AND c.test_agent_id IS NULL
       AND c.titulo NOT ILIKE '%teste%'
       AND NOT (c.external_id IS NULL
                AND (c.titulo ILIKE '%(via sofia)%' OR lower(btrim(c.titulo)) = 'mcqueen'))
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
    -- ORIGEM: usa o wrapper native (limpa o dropdown); base intacta p/ Analytics 1.
    _ww_native_norm_origem(COALESCE(NULLIF(b.produto_data->>'ww_sdr_como_conheceu',''), NULLIF(b.utm_source,'')))     AS origem,
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
