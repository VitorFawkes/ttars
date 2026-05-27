-- ============================================================================
-- Analytics-Weddings — Onda 1: helper get_ac_app_url
--
-- Lê a configuração ACTIVECAMPAIGN_API_URL de integration_settings (por org)
-- e converte o subdomínio da API (api-us1.com) para o app URL (activehosted.com).
--
-- Ex.: 'https://welcometrips.api-us1.com'
--      → 'https://welcometrips.activehosted.com'
--
-- Usado pelo frontend (Analytics-Weddings) pra montar deep-link de contato no
-- ActiveCampaign: <app_url>/app/contacts/<external_id>
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ac_app_url(p_org_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
  v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
  v_api_url TEXT;
  v_app_url TEXT;
BEGIN
  -- Busca primeiro no workspace; se não tiver, no parent (account).
  SELECT value INTO v_api_url
    FROM integration_settings
   WHERE org_id = v_org_id AND key = 'ACTIVECAMPAIGN_API_URL'
   LIMIT 1;

  IF v_api_url IS NULL THEN
    SELECT i.value INTO v_api_url
      FROM organizations o
      JOIN integration_settings i ON i.org_id = o.parent_org_id
     WHERE o.id = v_org_id AND i.key = 'ACTIVECAMPAIGN_API_URL'
     LIMIT 1;
  END IF;

  IF v_api_url IS NULL OR TRIM(v_api_url) = '' THEN
    RETURN NULL;
  END IF;

  -- Tira trailing slash e converte .api-us1.com -> .activehosted.com
  v_api_url := regexp_replace(v_api_url, '/+$', '');
  v_app_url := regexp_replace(v_api_url, '\.api-us1\.com.*$', '.activehosted.com');

  -- Garante esquema https (defensivo)
  IF v_app_url !~* '^https?://' THEN
    v_app_url := 'https://' || v_app_url;
  END IF;

  RETURN v_app_url;
END $func$;

GRANT EXECUTE ON FUNCTION public.get_ac_app_url(UUID) TO authenticated;
