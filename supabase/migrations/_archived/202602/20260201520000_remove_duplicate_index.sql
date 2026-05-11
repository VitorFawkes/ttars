-- ============================================================
-- Migration: Remove Duplicate Index (FASE 7)
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: Indice duplicado em integration_catalog detectado pelo
-- Supabase Linter.
--
-- RISCO: BAIXO - Remove indice redundante
-- ROLLBACK: Recriar indice (documentado abaixo)
-- ============================================================

-- Remover indice duplicado se existir
DROP INDEX IF EXISTS integration_catalog_upsert_idx;

-- ============================================================
-- ROLLBACK SCRIPT (se precisar reverter):
-- ============================================================
/*
CREATE INDEX integration_catalog_upsert_idx
ON integration_catalog (integration_id, external_id);
*/
