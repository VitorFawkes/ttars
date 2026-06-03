-- 20260603f — Classificação canônica DW × Elopement (regra combinada + token único)
--
-- POR QUÊ: hoje o "tipo" de casamento sai de DUAS fontes que discordam:
--   • vw_ww_funnel_base.tipo = campo declarado 30 (vazio em 94% → só 16 Elopements)
--   • ww_funil_casal.tipo    = esteira "Elopment Wedding" (grupo 12 → 1.448 Elopements, correto)
-- E o token está escrito diferente ('Elopment' na view/_ww_norm_tipo × 'Elopement' no casal),
-- o que faz qualquer filtro casar com NADA (zero silencioso).
--
-- O QUE FAZ:
--   1) _ww_norm_tipo passa a devolver o token canônico 'Elopement' (era 'Elopment').
--   2) vw_ww_funnel_base.tipo passa a usar a REGRA COMBINADA ("os dois combinados"):
--        Elopement  ⇐ passou na esteira 12 (is_elopement_pipeline) OU declarou 'elop' no campo 30
--        DW         ⇐ qualquer outro lead de casamento (a view já é WHERE is_ww)
--      Conserta de uma vez ww2_overview, ww_v2_drift_venda (incl. breakdown_tipo) e ww_drift_combos,
--      que lêem essa coluna.
--
-- SEGURANÇA: CREATE OR REPLACE VIEW preserva nome/ordem/tipo das colunas → não derruba dependentes.
--   Só a coluna `tipo` muda de FONTE (e ganha cobertura ~100% em vez de 6%). Demais colunas idênticas
--   à 20260602q. _ww_norm_tipo mantém assinatura (TEXT)→TEXT.

-- ───────────────────────── 1) token canônico no normalizador ─────────────────────────
CREATE OR REPLACE FUNCTION public._ww_norm_tipo(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(p_raw));
    IF v LIKE '%elop%' THEN RETURN 'Elopement'; END IF;
    IF v LIKE '%dw%' OR v LIKE '%destination%' OR v LIKE '%convidados%' OR v LIKE '%praia%' THEN RETURN 'DW'; END IF;
    RETURN NULL;
END $$;

-- ───────────────────────── 2) vw_ww_funnel_base com tipo combinado ─────────────────────────
CREATE OR REPLACE VIEW public.vw_ww_funnel_base AS
SELECT
  fc.ac_deal_id, fc.contact_id, fc.pipeline_group_id, fc.deal_title, fc.is_ww,
  fc.sdr_agendou_at IS NOT NULL AS marcou_sdr,
  fc.sdr_fez AS fez_sdr,
  fc.closer_agendou_at IS NOT NULL AS marcou_closer,
  fc.closer_fez AS fez_closer,
  fc.ganho_at IS NOT NULL AS ganho,
  fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at,
  fc.sdr_canal, fc.closer_canal,
  -- Realidade do casal (Welcome Form - Contact 376/121 com fallback Deal 62)
  fc.real_orcamento_raw, fc.real_orcamento_parsed,
  fc.real_convidados_raw, fc.real_convidados_parsed, fc.real_convidados_fonte,
  -- Vínculo CRM (opcional, pode ser NULL) — usado SÓ para link de navegação e colunas legacy
  c.id AS card_id, c.org_id,
  c.created_at AS card_created_at,
  c.status_comercial, c.valor_final, c.titulo AS card_titulo,
  c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
  -- DIMENSÕES DECLARADAS — do CACHE ACTIVE (cards.produto_data foi aposentado aqui em 20260602q)
  _ww2_norm_faixa_strict(fc.faixa_raw)      AS faixa,
  _ww2_norm_conv_strict (fc.convidados_raw) AS convidados,
  _ww2_norm_dest_strict (fc.destino_raw)    AS destino,
  _ww2_norm_dest_strict (fc.destino_raw)    AS destino_final,
  _ww_ac_norm_origem(COALESCE(NULLIF(fc.utm_source, ''), fc.origem_conversao)) AS origem,
  -- TIPO CANÔNICO COMBINADO (esteira 12 OU campo declarado) → token 'Elopement'/'DW'
  CASE
    WHEN COALESCE(fc.is_elopement_pipeline, FALSE) OR fc.tipo_casamento ILIKE '%elop%'
      THEN 'Elopement'
    ELSE 'DW'
  END                                       AS tipo,
  COALESCE(c.created_at, fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at) AS data_entrada
FROM ww_ac_deal_funnel_cache fc
LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign'
  AND c.deleted_at IS NULL AND c.archived_at IS NULL AND c.produto::TEXT = 'WEDDING'
WHERE fc.is_ww;

COMMENT ON VIEW public.vw_ww_funnel_base IS
  'Universo canonico Weddings: 1 linha por deal AC com is_ww=TRUE. Marcos + realidade (376/121) + dimensoes declaradas do cache Active. tipo = regra combinada (esteira 12 OU campo declarado) com token Elopement/DW. LEFT JOIN card so para link/colunas legacy. Fonte unica para Analytics-Weddings.';
