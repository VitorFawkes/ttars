-- ============================================================================
-- MIGRATION: permitir descartar pontuação SDR em rascunho sem âncora
-- Date: 2026-05-25
--
-- Antes: CHECK exigia âncora (telefone/contato/card) para qualquer status ≠ rascunho.
-- Bug: ao excluir um rascunho órfão (sem âncora), o UPDATE status='descartado'
-- violava chk_sdr_qual_anchor — SDR ficava travada sem como apagar.
--
-- Agora: rascunho E descartado podem ter tudo NULL. Só finalizado exige âncora
-- (mantém garantia que dado registrado tenha a quem se referir).
-- ============================================================================

BEGIN;

ALTER TABLE sdr_qualifications
  DROP CONSTRAINT IF EXISTS chk_sdr_qual_anchor;

ALTER TABLE sdr_qualifications
  ADD CONSTRAINT chk_sdr_qual_anchor CHECK (
    status IN ('rascunho', 'descartado')
    OR contato_id IS NOT NULL
    OR card_id IS NOT NULL
    OR telefone_normalizado IS NOT NULL
  );

COMMIT;
