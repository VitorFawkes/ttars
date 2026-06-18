-- ============================================================================
-- WEDDINGS — Reconciliação do mapa de campos ActiveCampaign (Handoff §ACTIVE)
-- ============================================================================
-- Nomes confirmados na API do AC (GET /api/3/dealCustomFieldMeta) em 18/06:
--   deal 27 = "Quanto você pensa em investir?*" (radio faixa)  → investimento
--   deal 62 = "Pacote WW - Nº de Convidados" (number)          → convidados
--   deal 64 = "Valor fechado em contrato:" (currency)          → valor_final (já ok, sem mudança)
--
-- Mexe SÓ nos mapeamentos inbound dos pipelines WEDDING (1=SDR, 3=Closer, 4=Pós-venda).
-- NÃO toca pipeline 8 (Trips, deal 27 → 'pessoas'). Afeta apenas sincronizações FUTURAS
-- (não reescreve dados já gravados; backfill é passo opcional à parte).
--
-- 1) Investimento: deal 27 cai hoje em ww_mkt_orcamento_form (campo de marketing
--    INATIVO). Unifica no campo canônico ww_orcamento_faixa ("Orçamento", ativo na
--    Qualificação). Confirmado: nada mais escreve em ww_orcamento_faixa.
-- 2) Convidados: deal 62 cai hoje em ww_closer_valor_pacote (chave FANTASMA, sem
--    system_field). Aponta pro campo da tela ww_closer_pacote_convidados (ativo).
--
-- REVERSÍVEL (só troca local_field_key). AC integração a2141b92-…; org das maps …a001.
-- ============================================================================

BEGIN;

-- 1) Investimento → campo unificado
UPDATE public.integration_field_map
SET local_field_key = 'ww_orcamento_faixa', updated_at = now()
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND source = 'active_campaign' AND entity_type = 'deal' AND direction = 'inbound'
  AND external_field_id = '27'
  AND external_pipeline_id IN ('1','3','4');

-- 2) Convidados → campo visível na tela (corrige a chave fantasma)
UPDATE public.integration_field_map
SET local_field_key = 'ww_closer_pacote_convidados', updated_at = now()
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND source = 'active_campaign' AND entity_type = 'deal' AND direction = 'inbound'
  AND external_field_id = '62'
  AND external_pipeline_id IN ('1','3','4');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (REST):
--   integration_field_map?external_field_id=in.(27,62)&entity_type=eq.deal&direction=eq.inbound
--     &external_pipeline_id=in.(1,3,4)&select=external_field_id,external_pipeline_id,local_field_key
--   Esperado: 27→ww_orcamento_faixa (3 linhas), 62→ww_closer_pacote_convidados (3 linhas).
-- ============================================================================
