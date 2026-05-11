-- ============================================================================
-- MIGRATION: cards_hierarchy_audit RPC
-- Date: 2026-05-07
--
-- Função leve de auditoria para o smoke test (.claude/hooks/schema-smoke-test.sh)
-- detectar hierarquia inconsistente em cards (cross-org ou cross-produto).
-- Esperado: sempre 0. Se subir, é regressão no trigger de validação ou em
-- alguma RPC nova que escreve parent_card_id.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS cards_hierarchy_violation_count();

CREATE OR REPLACE FUNCTION cards_hierarchy_violation_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM cards c
    JOIN cards p ON p.id = c.parent_card_id
    WHERE c.parent_card_id IS NOT NULL
      AND c.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND (
          c.org_id IS DISTINCT FROM p.org_id
          OR c.produto IS DISTINCT FROM p.produto
          OR c.pipeline_id IS DISTINCT FROM p.pipeline_id
          OR p.card_type = 'sub_card'
          OR c.id = p.id
      );
$$;

GRANT EXECUTE ON FUNCTION cards_hierarchy_violation_count TO authenticated, service_role;

COMMIT;
