-- ============================================================================
-- WEDDINGS — Analytics 2: relinkar ww_funil_casal_native nos CAMPOS do card
-- ============================================================================
-- Antes (20260619a): as marcas de reunião/ganho vinham SÓ do log de etapas novo
-- (forward-only, no ar desde 18/06) → quase vazio vs Active.
-- Agora: lê os campos do card que espelham os campos do Active que alimentam o
-- analytics (mapeados em integration_field_map), com o log de etapas como REFORÇO
-- (COALESCE), pra Calendly/etapas seguirem valendo "pra frente":
--   campo 6  → ww_sdr_data_reuniao    (SDR reunião agendada/data)
--   campo 17 → ww_sdr_como_reuniao    (SDR reunião FEITA = canal preenchido)
--   campo 18 → ww_closer_data_reuniao (Closer reunião)
--   campo 299→ ww_closer_como_reuniao (Closer reunião FEITA)
--   campo 87 → ww_closer_data_ganho   (Ganho/data)
-- Datas em produto_data são wall-clock SP (sem fuso) → interpretar como SP local
-- (memory: data_reuniao nunca leva conversão de fuso). Helper _ww_native_ts faz isso
-- com guarda contra valor inválido.
--
-- Os 5 RPCs *_native NÃO mudam (já leem a view). Frontend não muda. Aditivo.
-- NOTA: completude total depende do backfill dos campos a partir de
-- ww_ac_deal_funnel_cache (Parte 2, plano à parte).
-- ============================================================================

BEGIN;

-- Parser seguro: string de data do produto_data (SP local) → timestamptz. NULL se inválida.
CREATE OR REPLACE FUNCTION public._ww_native_ts(p text)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $fn$
BEGIN
    IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
    RETURN (p::timestamp AT TIME ZONE 'America/Sao_Paulo');
EXCEPTION WHEN others THEN
    RETURN NULL;
END
$fn$;

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
           -- campos do analytics (Active → card), datas como SP local:
           public._ww_native_ts(c.produto_data->>'ww_sdr_data_reuniao')    AS f_sdr_data,     -- campo 6
           NULLIF(trim(c.produto_data->>'ww_sdr_como_reuniao'), '')         AS f_sdr_como,     -- campo 17 (feita)
           public._ww_native_ts(c.produto_data->>'ww_closer_data_reuniao') AS f_closer_data,  -- campo 18
           NULLIF(trim(c.produto_data->>'ww_closer_como_reuniao'), '')      AS f_closer_como,  -- campo 299 (feita)
           public._ww_native_ts(c.produto_data->>'ww_closer_data_ganho')   AS f_ganho_data    -- campo 87
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
    -- entrou_* (etapas Closer) — mantém do log
    b.closer_1a_at AS entrou_closer_at,
    b.closer_1a_at AS entrou_1a_reuniao_at,
    b.closer_contrato_at AS entrou_contrato_enviado_at,
    b.closer_negociacao_at AS entrou_negociacao_at,
    NULL::timestamptz AS entrou_op_futura_at,
    NULL::timestamptz AS entrou_planejamento_at,
    NULL::timestamptz AS entrou_producao_at,
    NULL::timestamptz AS entrou_controle_at,
    NULL::timestamptz AS elopement_assinatura_at,
    -- agenda timing (lido pela agenda): campo do card OU log
    COALESCE(b.f_sdr_data, b.sdr_agendada_at)                          AS sdr_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_sdr_como_reuniao')      AS sdr_canal,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at)          AS closer_agendou_at,
    _ww_norm_canal_strict(b.produto_data->>'ww_closer_como_reuniao')   AS closer_canal,
    -- marcos SDR: campo 6 (agendou) / campo 17 (feita), reforço = etapas
    (COALESCE(b.f_sdr_data, b.sdr_agendada_at) IS NOT NULL)            AS agendou_sdr,
    COALESCE(b.f_sdr_data, b.sdr_agendada_at)                         AS agendou_sdr_at,
    (b.f_sdr_como IS NOT NULL OR b.sdr_realizada_at IS NOT NULL)       AS fez_sdr,
    COALESCE(CASE WHEN b.f_sdr_como IS NOT NULL THEN b.f_sdr_data END, b.sdr_realizada_at, b.f_sdr_data) AS fez_sdr_at,
    CASE WHEN b.f_sdr_como IS NOT NULL THEN 'campo_analytics' ELSE 'ttars_stage_log' END AS fez_sdr_fonte,
    -- marcos Closer: campo 18 (agendou) / campo 299 (feita), reforço = etapas/handoff
    (COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at) IS NOT NULL) AS agendou_closer,
    COALESCE(b.f_closer_data, b.ganho_sdr_at, b.closer_1a_at)          AS agendou_closer_at,
    CASE WHEN b.f_closer_data IS NOT NULL THEN 'campo_analytics' ELSE 'ttars' END AS agendou_closer_fonte,
    (b.f_closer_como IS NOT NULL OR b.closer_contato_at IS NOT NULL)   AS fez_closer,
    COALESCE(CASE WHEN b.f_closer_como IS NOT NULL THEN b.f_closer_data END, b.closer_contato_at) AS fez_closer_at,
    CASE WHEN b.f_closer_como IS NOT NULL THEN 'campo_analytics' ELSE 'ttars' END AS fez_closer_fonte,
    -- ganho: campo 87 OU status do ttars
    (b.f_ganho_data IS NOT NULL OR b.status_comercial = 'ganho')      AS ganho,
    COALESCE(b.f_ganho_data,
             CASE WHEN b.status_comercial='ganho'
                  THEN COALESCE(b.data_fechamento::timestamptz, b.ganho_planner_at, b.updated_at) END) AS ganho_at,
    CASE WHEN b.f_ganho_data IS NOT NULL THEN 'campo_analytics' ELSE 'ttars_status' END AS ganho_fonte,
    (b.status_comercial = 'perdido')                                  AS is_perdido,
    now() AS refreshed_at,
    -- dimensões (mesmas normalizers das RPCs)
    _ww2_norm_faixa_strict(COALESCE(b.produto_data->>'ww_orcamento_faixa', b.produto_data->>'ww_mkt_orcamento_form'))                                          AS faixa,
    _ww2_norm_conv_strict(COALESCE(b.produto_data->>'ww_num_convidados', b.produto_data->>'ww_mkt_convidados_form', b.produto_data->>'ww_convidados_refinado')) AS convidados,
    _ww2_norm_dest_strict(COALESCE(b.produto_data->>'ww_destino', b.produto_data->>'ww_mkt_destino_form', b.produto_data->>'ww_onde_casar_refinado'))           AS destino,
    _ww_ac_norm_origem(b.produto_data->>'ww_sdr_como_conheceu')                                                                                                 AS origem,
    b.v_consultor_id AS consultor_id,
    p.nome AS consultor_nome,
    (b.v_tipo <> 'Elopement') AS entrou_sdr,
    (b.v_tipo = 'Elopement')  AS entrou_elopement,
    b.v_tipo AS tipo_entrada,
    TRUE AS entrou_valido,
    b.valor_final AS valor_final
  FROM base b
  LEFT JOIN profiles p ON p.id = b.v_consultor_id;

COMMENT ON VIEW public.ww_funil_casal_native IS
  'Clone NATIVO de ww_funil_casal (1 linha/card WEDDING). Marcas lidas dos CAMPOS do card que espelham os campos do Active do analytics (6/17/18/299/87), com log de etapas como reforço (COALESCE). Migration 20260619b. Completude depende do backfill desses campos a partir de ww_ac_deal_funnel_cache (Parte 2).';

GRANT SELECT ON public.ww_funil_casal_native TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
