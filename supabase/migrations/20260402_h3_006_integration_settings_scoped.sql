-- H3-006: Add org_id + produto scoping to integration_settings
-- Allows per-org and per-product settings (e.g., feature flags per product)
--
-- Strategy: Add columns without changing PK. PK remains (key) for backward compat.
-- A new UNIQUE index on (org_id, COALESCE(produto,'__GLOBAL__'), key) allows
-- product-scoped settings. Existing global settings get produto = NULL.
--
-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_integration_settings_org_produto_key;
-- ALTER TABLE integration_settings DROP COLUMN IF EXISTS produto;
-- ALTER TABLE integration_settings DROP COLUMN IF EXISTS org_id;
-- Restore get_outbound_setting to original version (see _archived/202602/20260202100000)

-- =============================================================================
-- ADD COLUMNS
-- =============================================================================
ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id)
  DEFAULT 'a0000000-0000-0000-0000-000000000001';

ALTER TABLE integration_settings
  ADD COLUMN IF NOT EXISTS produto TEXT DEFAULT NULL;

-- Backfill
UPDATE integration_settings
SET org_id = 'a0000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

ALTER TABLE integration_settings ALTER COLUMN org_id SET NOT NULL;

-- Index para lookups scoped (PK permanece 'key' por ora para backward compat)
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_settings_org_produto_key
  ON integration_settings(org_id, COALESCE(produto, '__GLOBAL__'), key);

CREATE INDEX IF NOT EXISTS idx_integration_settings_org_id
  ON integration_settings(org_id);

-- =============================================================================
-- UPDATE get_outbound_setting() to be org-aware
-- Uses SECURITY DEFINER to bypass RLS (called from triggers)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_outbound_setting(p_key text)
RETURNS text AS $$
DECLARE
    v_value text;
    v_org_id uuid;
BEGIN
    -- Tenta pegar org_id do JWT, fallback para Welcome Group
    v_org_id := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID,
      'a0000000-0000-0000-0000-000000000001'::UUID
    );

    SELECT value INTO v_value
    FROM public.integration_settings
    WHERE key = p_key
      AND org_id = v_org_id
      AND produto IS NULL;  -- settings globais da org

    RETURN COALESCE(v_value, '');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- NEW: get_product_setting() for product-scoped settings
-- Falls back to org-global if no product-specific setting exists
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_product_setting(p_key text, p_produto text DEFAULT NULL)
RETURNS text AS $$
DECLARE
    v_value text;
    v_org_id uuid;
BEGIN
    v_org_id := COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id')::UUID,
      'a0000000-0000-0000-0000-000000000001'::UUID
    );

    -- Tenta product-specific primeiro
    IF p_produto IS NOT NULL THEN
        SELECT value INTO v_value
        FROM public.integration_settings
        WHERE key = p_key
          AND org_id = v_org_id
          AND produto = p_produto;
    END IF;

    -- Fallback para org-global
    IF v_value IS NULL THEN
        SELECT value INTO v_value
        FROM public.integration_settings
        WHERE key = p_key
          AND org_id = v_org_id
          AND produto IS NULL;
    END IF;

    RETURN v_value;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_product_setting(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_setting(text, text) TO service_role;

COMMENT ON FUNCTION public.get_product_setting IS
  'Retorna setting por org e produto. Se produto fornecido, tenta product-specific primeiro, '
  'fallback para org-global. Usa JWT claim para determinar org.';
