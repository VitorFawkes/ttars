-- Platform Admin — Chunk 3: gerenciamento de usuários por empresa
-- RPCs para platform admin:
--   - platform_list_org_users: lista users de uma account + workspaces filhas
--   - platform_set_user_active: liga/desliga o user (auth.users.banned_until + profiles.active)
--   - platform_remove_user_from_org: tira user da org (soft: active=false + limpa org_id)
-- Reset de senha é chamado direto do frontend via supabase.auth.resetPasswordForEmail.

SET search_path = public;

-- =========================================================================
-- platform_list_org_users: users da account + todos os workspaces filhos
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_org_users(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  nome TEXT,
  org_id UUID,
  org_name TEXT,
  role TEXT,
  is_admin BOOLEAN,
  is_platform_admin BOOLEAN,
  active BOOLEAN,
  banned_until TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_scope_ids UUID[];
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  -- Escopo: a própria org + workspaces filhas (se for account)
  SELECT array_agg(DISTINCT oid) INTO v_scope_ids FROM (
    SELECT p_org_id AS oid
    UNION ALL
    SELECT id FROM organizations WHERE parent_org_id = p_org_id
  ) s;

  RETURN QUERY
  SELECT
    p.id, p.email, p.nome, p.org_id,
    o.name AS org_name,
    p.role::TEXT, p.is_admin, p.is_platform_admin, p.active,
    au.banned_until,
    au.last_sign_in_at,
    p.created_at
  FROM profiles p
  JOIN organizations o ON o.id = p.org_id
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.org_id = ANY(v_scope_ids)
  ORDER BY p.active DESC, p.is_admin DESC, p.nome NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_org_users(UUID) TO authenticated;

-- =========================================================================
-- platform_set_user_active: suspender/reativar user
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_set_user_active(
  p_user_id UUID,
  p_active BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'Você não pode suspender a si mesmo';
  END IF;

  UPDATE profiles SET active = p_active, updated_at = now() WHERE id = p_user_id;

  UPDATE auth.users
  SET banned_until = CASE WHEN p_active THEN NULL ELSE 'infinity'::timestamptz END
  WHERE id = p_user_id;

  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor,
    CASE WHEN p_active THEN 'user.reactivate' ELSE 'user.suspend' END,
    'user', p_user_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_user_active(UUID, BOOLEAN, TEXT) TO authenticated;

-- =========================================================================
-- platform_remove_user_from_org: retira user da org (soft delete)
-- Sets active=false, banned_until=infinity, mantém org_id para auditoria.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_remove_user_from_org(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_org_id UUID;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo';
  END IF;

  SELECT org_id INTO v_org_id FROM profiles WHERE id = p_user_id;

  UPDATE profiles SET active = false, updated_at = now() WHERE id = p_user_id;

  UPDATE auth.users
  SET banned_until = 'infinity'::timestamptz
  WHERE id = p_user_id;

  -- Remove de org_members se houver vínculo
  DELETE FROM org_members WHERE user_id = p_user_id;

  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor, 'user.remove_from_org', 'user', p_user_id,
    jsonb_build_object('org_id', v_org_id, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_remove_user_from_org(UUID, TEXT) TO authenticated;
