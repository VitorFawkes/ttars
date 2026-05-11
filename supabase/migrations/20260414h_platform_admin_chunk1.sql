-- Platform Admin — Chunk 1: toggle de compartilhamento + workspace_count na listagem
--
-- 1. RPC platform_set_sharing_flag: platform admin liga/desliga
--    organizations.shares_contacts_with_children de uma account.
-- 2. Atualiza platform_list_organizations para retornar workspace_count real.

SET search_path = public;

-- =========================================================================
-- 1. platform_set_sharing_flag
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_set_sharing_flag(
  p_org_id UUID,
  p_enable BOOLEAN
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_parent BOOLEAN;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins podem alterar esse flag';
  END IF;

  SELECT parent_org_id IS NULL INTO v_is_parent
  FROM organizations WHERE id = p_org_id;

  IF v_is_parent IS NULL THEN
    RAISE EXCEPTION 'Organização não encontrada';
  END IF;

  IF NOT v_is_parent THEN
    RAISE EXCEPTION 'Flag só pode ser setado em account (org pai). Este ID é workspace.';
  END IF;

  UPDATE organizations
  SET shares_contacts_with_children = p_enable,
      updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor,
    CASE WHEN p_enable THEN 'org.sharing_enabled' ELSE 'org.sharing_disabled' END,
    'organization', p_org_id,
    jsonb_build_object('shares_contacts_with_children', p_enable)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_sharing_flag(UUID, BOOLEAN) TO authenticated;

-- =========================================================================
-- 2. platform_list_organizations — adicionar workspace_count
-- =========================================================================
-- Primeiro, checar se a RPC existe e recriar com workspace_count.
-- A versão atual não retorna workspace_count (aparece zerado na UI).
DROP FUNCTION IF EXISTS public.platform_list_organizations();
CREATE OR REPLACE FUNCTION public.platform_list_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  logo_url TEXT,
  shares_contacts_with_children BOOLEAN,
  workspace_count BIGINT,
  user_count BIGINT,
  card_count BIGINT,
  open_card_count BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins podem listar organizações';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    o.status,
    o.active,
    o.created_at,
    o.suspended_at,
    o.suspended_reason,
    o.logo_url,
    o.shares_contacts_with_children,
    (SELECT COUNT(*) FROM organizations w WHERE w.parent_org_id = o.id) AS workspace_count,
    (SELECT COUNT(*) FROM profiles p WHERE p.org_id = o.id) AS user_count,
    (SELECT COUNT(*) FROM cards c WHERE c.org_id = o.id) AS card_count,
    (SELECT COUNT(*) FROM cards c WHERE c.org_id = o.id
       AND COALESCE(c.status_comercial, 'aberto') = 'aberto') AS open_card_count,
    (SELECT MAX(c.updated_at) FROM cards c WHERE c.org_id = o.id) AS last_activity
  FROM organizations o
  WHERE o.parent_org_id IS NULL  -- só accounts na listagem top-level
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_organizations() TO authenticated;
