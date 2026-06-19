-- ============================================================================
-- WEDDINGS — Destino: usar o formulário (deal 28) como entrada de ww_destino
-- ============================================================================
-- Handoff §ACTIVE, inconsistência #5: "form preenche deal 28; o 'destino
-- confirmado' é deal 121. Usar o 28 como entrada."
--
-- Estado hoje (mapa inbound, pipelines WEDDING 1=SDR/3=Closer/4=Pós-venda):
--   deal 121 (destino confirmado) → ww_destino            (campo canônico da tela)
--   deal 28  (form "Onde quer casar?*") → ww_mkt_destino_form  (campo de marketing)
--
-- A spec quer o oposto: ww_destino = o que o CASAL pediu no form (desejo), não o
-- destino já confirmado/fechado. Então TROCAMOS as duas chaves:
--   deal 28  → ww_destino           (entrada = desejo do casal, como pede a spec)
--   deal 121 → ww_mkt_destino_form  (confirmado vai pro bucket de fallback, sem perda)
--
-- POR QUE NÃO QUEBRA O ANALYTICS: o funil nativo (20260619b) classifica destino com
--   _ww2_norm_dest_strict(COALESCE(ww_destino, ww_mkt_destino_form, ww_onde_casar_refinado)).
--   Continua lendo ww_destino primeiro — que passa a refletir o desejo do form (correto
--   pra "destino desejado"), e mantém o confirmado como fallback. Score é ai_subjective,
--   não depende do campo.
--
-- ISOLAMENTO: mexe SÓ no mapa inbound dos pipelines WEDDING (1,3,4). NÃO toca pipeline 8
--   (Trips, deal 28 → 'pessoas'). Afeta apenas sincronizações FUTURAS (não reescreve dado
--   já gravado). Backfill é passo opcional à parte.
-- REVERSÍVEL: só troca local_field_key. AC integração a2141b92-…; org das maps …a001.
-- ============================================================================

BEGIN;

-- deal 28 (form) → campo canônico ww_destino
UPDATE public.integration_field_map
SET local_field_key = 'ww_destino', updated_at = now()
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND source = 'active_campaign' AND entity_type = 'deal' AND direction = 'inbound'
  AND external_field_id = '28'
  AND external_pipeline_id IN ('1','3','4');

-- deal 121 (confirmado) → bucket de marketing/fallback ww_mkt_destino_form
UPDATE public.integration_field_map
SET local_field_key = 'ww_mkt_destino_form', updated_at = now()
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND source = 'active_campaign' AND entity_type = 'deal' AND direction = 'inbound'
  AND external_field_id = '121'
  AND external_pipeline_id IN ('1','3','4');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (REST):
--   integration_field_map?entity_type=eq.deal&direction=eq.inbound
--     &external_field_id=in.(28,121)&external_pipeline_id=in.(1,3,4)
--     &select=external_field_id,external_pipeline_id,local_field_key
--   Esperado: 28 → ww_destino (3 linhas), 121 → ww_mkt_destino_form (3 linhas).
-- ============================================================================
