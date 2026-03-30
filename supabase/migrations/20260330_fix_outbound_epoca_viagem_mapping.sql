-- ============================================================================
-- Fix: epoca_viagem mapeado para Field 56 (SDR WT - Motivo de Perda) no outbound
--
-- O mapeamento inbound já foi corrigido em 20260303_fix_deal_field_mappings.sql,
-- mas o outbound (integration_outbound_field_map) ficou com epoca_viagem → 56.
-- Isso faz com que field_update de epoca_viagem sobrescreva o motivo de perda
-- no AC, e a automação #90 reverta o deal para Open.
--
-- Não existe campo AC equivalente para epoca_viagem, então desativamos.
-- ============================================================================

UPDATE integration_outbound_field_map
SET is_active = false
WHERE internal_field = 'epoca_viagem'
  AND external_field_id = '56';
