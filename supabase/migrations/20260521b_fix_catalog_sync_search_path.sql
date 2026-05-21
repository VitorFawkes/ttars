-- ============================================================
-- Migration: Fix trigger proposal_library_sync_search — search_path
-- Data: 2026-05-21
-- Autor: Vitor (via Claude)
--
-- BUG continuação: trigger BEFORE INSERT/UPDATE em proposal_library
-- usa `unaccent()` sem qualificar schema. Quando o trigger é invocado
-- via trigger `proposal_items_auto_catalog` (que roda com SET
-- search_path = ''), `unaccent` não é encontrado e falha com:
--   ERROR: 42883: function unaccent(text) does not exist
--
-- FIX: usar `public.unaccent` qualificado.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION proposal_library_sync_search()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.region_search := CASE
    WHEN NEW.region IS NOT NULL THEN lower(public.unaccent(NEW.region))
    ELSE NULL
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMIT;
