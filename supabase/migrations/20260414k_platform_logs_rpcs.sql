-- Platform Admin — Chunk 4: RPCs para leitura cross-org de logs técnicos
-- Essas tabelas são globais (service_role only no RLS). As RPCs liberam
-- leitura somente para platform admin.

SET search_path = public;

-- =========================================================================
-- platform_list_webhook_logs
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_webhook_logs(
  p_limit INT DEFAULT 100,
  p_source TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  source TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT w.id, w.source, w.payload, w.created_at
  FROM webhook_logs w
  WHERE (p_source IS NULL OR w.source = p_source)
  ORDER BY w.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_webhook_logs(INT, TEXT) TO authenticated;

-- =========================================================================
-- platform_list_integration_outbox
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_integration_outbox(
  p_limit INT DEFAULT 100,
  p_status TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  destination TEXT,
  entity_type TEXT,
  internal_id UUID,
  action TEXT,
  status TEXT,
  retry_count INT,
  error_log TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT o.id, o.destination, o.entity_type, o.internal_id, o.action,
         o.status, o.retry_count, o.error_log, o.created_at
  FROM integration_outbox o
  WHERE (p_status IS NULL OR o.status = p_status)
  ORDER BY o.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_integration_outbox(INT, TEXT) TO authenticated;

-- =========================================================================
-- platform_list_integration_alerts
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_integration_alerts(
  p_limit INT DEFAULT 100,
  p_unresolved_only BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
  id UUID,
  rule_key TEXT,
  status TEXT,
  context JSONB,
  org_id UUID,
  org_name TEXT,
  fired_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.rule_key, a.status, a.context,
         a.org_id, o.name AS org_name,
         a.fired_at, a.acknowledged_at, a.resolved_at
  FROM integration_health_alerts a
  LEFT JOIN organizations o ON o.id = a.org_id
  WHERE (NOT p_unresolved_only OR a.resolved_at IS NULL)
  ORDER BY a.fired_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_integration_alerts(INT, BOOLEAN) TO authenticated;

-- =========================================================================
-- platform_list_integration_pulse: status atual por canal
-- =========================================================================
CREATE OR REPLACE FUNCTION public.platform_list_integration_pulse()
RETURNS TABLE (
  channel TEXT,
  label TEXT,
  last_event_at TIMESTAMPTZ,
  event_count_24h INT,
  event_count_7d INT,
  last_error_at TIMESTAMPTZ,
  error_count_24h INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Apenas platform admins' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.channel, p.label, p.last_event_at,
         p.event_count_24h, p.event_count_7d,
         p.last_error_at, p.error_count_24h
  FROM integration_health_pulse p
  ORDER BY p.last_event_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_list_integration_pulse() TO authenticated;
