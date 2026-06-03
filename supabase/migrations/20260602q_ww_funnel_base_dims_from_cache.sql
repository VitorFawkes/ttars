-- 20260602q — vw_ww_funnel_base: dimensões declaradas (faixa/convidados/destino/tipo/origem)
-- passam a vir do CACHE ACTIVE (ww_ac_deal_funnel_cache.*_raw), não mais de cards.produto_data.
--
-- POR QUÊ: Analytics-Weddings deve usar SOMENTE ActiveCampaign. Essas dims vinham do card do
-- CRM (ww_mkt_*_form), que fica defasado. O cache do Active já tem o mesmo dado nativo
-- (faixa_raw/convidados_raw/destino_raw/tipo_casamento) com cobertura melhor (89% vs card).
--
-- SEGURANÇA: CREATE OR REPLACE VIEW preserva colunas (nome/ordem/tipo idênticos) → NÃO derruba
-- as funções dependentes (ww2_overview, ww_v2_drift_venda, ww_funil_perfil_slot, ww2_journey).
-- Universo permanece idêntico (mesmo LEFT JOIN cards, mesmo org_id do card) → visual estável.
-- Só a FONTE das 6 dimensões muda (card → cache). Demais colunas inalteradas.

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
  -- DIMENSÕES DECLARADAS — agora do CACHE ACTIVE (antes: cards.produto_data->>'ww_mkt_*_form')
  _ww2_norm_faixa_strict(fc.faixa_raw)      AS faixa,
  _ww2_norm_conv_strict (fc.convidados_raw) AS convidados,
  _ww2_norm_dest_strict (fc.destino_raw)    AS destino,
  -- destino_final (destino "vendido") não existe no Active → usa o declarado como melhor proxy
  _ww2_norm_dest_strict (fc.destino_raw)    AS destino_final,
  _ww_ac_norm_origem(COALESCE(NULLIF(fc.utm_source, ''), fc.origem_conversao)) AS origem,
  -- tipo normalizado para os rótulos que o frontend usa ('DW' / 'Elopment')
  CASE
    WHEN fc.tipo_casamento ILIKE '%elop%' THEN 'Elopment'
    WHEN NULLIF(fc.tipo_casamento, '') IS NOT NULL THEN 'DW'
    ELSE NULL
  END                                       AS tipo,
  COALESCE(c.created_at, fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at) AS data_entrada
FROM ww_ac_deal_funnel_cache fc
LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign'
  AND c.deleted_at IS NULL AND c.archived_at IS NULL AND c.produto::TEXT = 'WEDDING'
WHERE fc.is_ww;

COMMENT ON VIEW public.vw_ww_funnel_base IS
  'Universo canonico Weddings: 1 linha por deal AC com is_ww=TRUE. Marcos + realidade (376/121) + dimensoes declaradas (faixa/convidados/destino/tipo/origem) AGORA do cache Active (nao mais cards.produto_data). LEFT JOIN card so para link/colunas legacy. Fonte unica para Analytics-Weddings.';
