-- ============================================================================
-- HOTFIX: Incluir 'team_member' em chk_valid_requirement_type
-- Date: 2026-04-17
--
-- CONTEXTO
-- A migration 20260417_team_member_requirement.sql adicionou o tipo
-- 'team_member' à função validate_stage_requirements e ao frontend
-- (GovernanceConsole, useStageRequirements, useQualityGate), mas esqueceu
-- de atualizar a CHECK constraint chk_valid_requirement_type.
--
-- Sintoma: ao marcar "pessoa de pós-venda" como requisito de uma etapa,
--   new row for relation "stage_field_config" violates check constraint
--   "chk_valid_requirement_type"
-- ============================================================================

ALTER TABLE public.stage_field_config
  DROP CONSTRAINT IF EXISTS chk_valid_requirement_type;

ALTER TABLE public.stage_field_config
  ADD CONSTRAINT chk_valid_requirement_type
    CHECK (requirement_type IN ('field', 'proposal', 'task', 'rule', 'document', 'team_member'));
