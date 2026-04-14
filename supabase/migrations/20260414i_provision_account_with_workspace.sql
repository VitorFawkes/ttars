-- Platform Admin — Chunk 2: fluxo de provisionamento completo
-- Nova RPC que cria account (parent) + primeiro workspace (child) atomicamente.
-- Substitui o fluxo antigo onde apenas uma org flat era criada e o admin tinha
-- que criar workspace manual depois do primeiro login.
--
-- Accounts antigas (flat) continuam funcionando. Novas contas sempre nascem no
-- modelo parent+child correto.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.provision_account_with_workspace(
  p_account_name TEXT,
  p_account_slug TEXT,
  p_admin_email TEXT,
  p_workspace_name TEXT DEFAULT NULL,
  p_workspace_slug TEXT DEFAULT NULL,
  p_template TEXT DEFAULT 'generic_3phase',
  p_product_name TEXT DEFAULT 'Principal',
  p_product_slug TEXT DEFAULT 'TRIPS'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_workspace_id UUID;
  v_workspace_name TEXT;
  v_workspace_slug TEXT;
  v_invite_token TEXT;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins podem provisionar contas'
      USING ERRCODE = '42501';
  END IF;

  -- Default: workspace herda nome da conta e slug "account-main"
  v_workspace_name := COALESCE(p_workspace_name, p_account_name);
  v_workspace_slug := COALESCE(p_workspace_slug, p_account_slug || '-main');

  -- Validar slugs únicos antes de começar
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = p_account_slug) THEN
    RAISE EXCEPTION 'Slug % já está em uso', p_account_slug USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_workspace_slug) THEN
    RAISE EXCEPTION 'Slug de workspace % já está em uso', v_workspace_slug USING ERRCODE = '23505';
  END IF;

  -- =========================================================================
  -- 1. Criar account (parent, minimal — só billing/admin)
  -- =========================================================================
  INSERT INTO organizations (id, name, slug, active, status, parent_org_id,
                             shares_contacts_with_children, branding, settings)
  VALUES (
    gen_random_uuid(), p_account_name, p_account_slug, true, 'active',
    NULL,   -- account não tem pai
    FALSE,  -- sharing default OFF; admin liga no onboarding se tiver 2+ workspaces
    '{"primary_color": "#4f46e5", "accent_color": "#0d9488"}',
    '{"default_currency": "BRL", "timezone": "America/Sao_Paulo", "date_format": "dd/MM/yyyy"}'
  )
  RETURNING id INTO v_account_id;

  -- =========================================================================
  -- 2. Criar workspace (child, com todo setup operacional via provision_workspace)
  -- =========================================================================
  v_workspace_id := provision_workspace(
    p_tenant_id      := v_account_id,
    p_name           := v_workspace_name,
    p_slug           := v_workspace_slug,
    p_admin_email    := p_admin_email,
    p_template       := p_template,
    p_product_name   := p_product_name,
    p_product_slug   := p_product_slug
  );

  -- Pegar o invite token recém-criado pela provision_workspace
  SELECT token INTO v_invite_token
  FROM invitations
  WHERE org_id = v_workspace_id AND email = p_admin_email
  ORDER BY created_at DESC
  LIMIT 1;

  -- Audit log
  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(), 'account.create', 'organization', v_account_id,
    jsonb_build_object(
      'account_name', p_account_name,
      'account_slug', p_account_slug,
      'workspace_id', v_workspace_id,
      'workspace_slug', v_workspace_slug,
      'admin_email', p_admin_email
    )
  );

  RETURN jsonb_build_object(
    'account_id', v_account_id,
    'workspace_id', v_workspace_id,
    'account_slug', p_account_slug,
    'workspace_slug', v_workspace_slug,
    'invite_token', v_invite_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_account_with_workspace(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.provision_account_with_workspace IS
  'Provisionamento completo: cria account (parent) + primeiro workspace (child) '
  'com pipeline/produto/roles, + convida admin. Substitui o fluxo antigo onde o '
  'admin precisava criar workspace manual após o primeiro login. Platform admin only.';
