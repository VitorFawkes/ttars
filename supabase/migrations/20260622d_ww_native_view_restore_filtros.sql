-- ============================================================================
-- 20260622d_ww_native_view_restore_filtros.sql
-- ----------------------------------------------------------------------------
-- FIX (regressão do PR #153 / 20260622c): ao recriar a view ww_funil_casal_native
-- partindo da baseline velha 20260619b, a 20260622c DESFEZ 3 correções que a def
-- viva (20260619d + 20260619g) tinha — violação da regra #5 do CLAUDE.md:
--   (1) exclusão de cards de TESTE        (test_agent_id / título 'teste')   — 20260619d
--   (2) exclusão de probes da Sofia/mcqueen (sem deal)                       — 20260619g
--   (3) classificação Elopement-por-título (quando ww_tipo_casamento vazio)  — 20260619g (+312 cards)
--
-- Confirmado em prod (antes deste fix): 41 cards de teste, 56 probes "(via Sofia)",
-- 312 cards "Elopement |" classificados como DW. A view alimenta as 5+ RPCs *_native,
-- então a contaminação vaza pras 7 abas do Analytics 2.
--
-- Esta migration recria a view a partir do CORPO VIVO (20260622c — mantém a melhoria
-- de `origem` = COALESCE(campo declarado, utm_source) e a MESMA ordem de colunas, então
-- CREATE OR REPLACE passa) e RE-ADICIONA só os 3 trechos perdidos. Zero mutação de dados.
-- ============================================================================

BEGIN;

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
           -- (3) RESTAURADO de 20260619g: Elopement pelo prefixo do título quando o campo está vazio.
           -- Tolerante à grafia "Elopment" (sem o 2º 'e') que aparece no campo em prod (2 cards).
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
       -- (1) RESTAURADO de 20260619d: exclui lixo de teste (mantém leads reais sem deal no Active)
       AND c.test_agent_id IS NULL
       AND c.titulo NOT ILIKE '%teste%'
       -- (2) RESTAURADO de 20260619g: exclui probes da Sofia/mcqueen sem deal (não derruba lead real)
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
    -- ORIGEM (mantém o fix da 20260622c): campo declarado OU utm_source rastreado.
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

COMMENT ON VIEW public.ww_funil_casal_native IS
  'Clone NATIVO de ww_funil_casal (1 linha/card WEDDING). Exclui teste/probes (20260619d/g), classifica Elopement por título, origem = COALESCE(declarado, utm_source). Restaura filtros perdidos na 20260622c. Migration 20260622d.';

COMMIT;

NOTIFY pgrst, 'reload schema';
