-- Platform Admin — Chunk 5: RPCs para catálogos globais
-- Lê tabelas globais (activity_categories, integration_*, system_fields) como
-- platform admin (sem depender de RLS, que é service_role only).
-- CRUD para activity_categories (a única editada com alguma frequência).

SET search_path = public;

CREATE OR REPLACE FUNCTION public.platform_global_catalog_counts()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'activity_categories',        (SELECT COUNT(*) FROM activity_categories),
    'integration_field_catalog',  (SELECT COUNT(*) FROM integration_field_catalog),
    'integration_provider_catalog',(SELECT COUNT(*) FROM integration_provider_catalog),
    'integration_health_rules',   (SELECT COUNT(*) FROM integration_health_rules),
    'system_fields',              (SELECT COUNT(*) FROM system_fields)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_global_catalog_counts() TO authenticated;

-- =========================================================================
-- activity_categories CRUD (PK=key text, colunas: key, label, scope, visible, ordem)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_activity_categories()
RETURNS SETOF activity_categories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM activity_categories ORDER BY ordem, label;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_list_activity_categories() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_upsert_activity_category(
  p_key TEXT,
  p_label TEXT,
  p_scope TEXT DEFAULT 'all',
  p_visible BOOLEAN DEFAULT TRUE,
  p_ordem INT DEFAULT 100
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  INSERT INTO activity_categories (key, label, scope, visible, ordem)
  VALUES (p_key, p_label, p_scope, p_visible, p_ordem)
  ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    scope = EXCLUDED.scope,
    visible = EXCLUDED.visible,
    ordem = EXCLUDED.ordem;

  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'global_catalog.activity_category.upsert', 'activity_category', NULL,
          jsonb_build_object('key', p_key, 'label', p_label, 'visible', p_visible));

  RETURN p_key;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_upsert_activity_category(TEXT, TEXT, TEXT, BOOLEAN, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_delete_activity_category(p_key TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;
  DELETE FROM activity_categories WHERE key = p_key;
  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'global_catalog.activity_category.delete', 'activity_category', NULL,
          jsonb_build_object('key', p_key));
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_delete_activity_category(TEXT) TO authenticated;
