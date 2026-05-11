-- =========================================================================
-- Analytics v2 — Saved Views (Explorar)
--
-- Tabela para salvar visões personalizadas no Explorar
-- Isolamento: org_id + user_id. RLS: user vê só suas visões.
-- 3 Suns: user_id FK → profiles(id)
-- =========================================================================

CREATE TABLE public.analytics_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Estado serializado da consulta (pivot manual + filtros)
  query_spec JSONB NOT NULL,
  -- Ex: {
  --   "measure": "sum_revenue",
  --   "group_by": "destino",
  --   "cross_with": null,
  --   "filters": { "product": "TRIPS" },
  --   "from": "2026-04-01",
  --   "to": "2026-04-25"
  -- }

  -- Visualização preferida para esta consulta
  viz TEXT NOT NULL DEFAULT 'table',
  -- Enum: 'table', 'bar', 'line', 'heatmap'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(org_id, user_id, name)
);

COMMENT ON TABLE analytics_saved_views IS 'Visões salvas do Explorar por usuário. Isolamento: org_id + user_id.';
COMMENT ON COLUMN analytics_saved_views.query_spec IS 'JSON serializado: measure, group_by, cross_with, filters, from, to.';

-- =========================================================================
-- RLS: user vê só suas visões
-- =========================================================================
ALTER TABLE analytics_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_saved_views_own ON analytics_saved_views TO authenticated
  USING (org_id = requesting_org_id() AND user_id = auth.uid())
  WITH CHECK (org_id = requesting_org_id() AND user_id = auth.uid());

CREATE POLICY analytics_saved_views_service ON analytics_saved_views TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================================
-- RPC 1: save_analytics_view — salvar ou atualizar
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_analytics_view(
  p_name TEXT,
  p_query_spec JSONB,
  p_viz TEXT DEFAULT 'table',
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_user UUID := auth.uid();
  v_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- UPSERT: se existe com mesmo name, atualizar. Senão, INSERT.
  INSERT INTO analytics_saved_views (
    org_id, user_id, name, description, query_spec, viz
  ) VALUES (
    v_org, v_user, p_name, p_description, p_query_spec, p_viz
  )
  ON CONFLICT (org_id, user_id, name) DO UPDATE SET
    description = COALESCE(EXCLUDED.description, analytics_saved_views.description),
    query_spec = EXCLUDED.query_spec,
    viz = EXCLUDED.viz,
    updated_at = NOW()
  RETURNING analytics_saved_views.id, analytics_saved_views.created_at INTO v_id, v_created_at;

  RETURN jsonb_build_object(
    'id', v_id,
    'name', p_name,
    'created_at', v_created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_analytics_view(TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- =========================================================================
-- RPC 2: list_analytics_views — listar visões do user
-- =========================================================================
CREATE OR REPLACE FUNCTION public.list_analytics_views()
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  query_spec JSONB,
  viz TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, name, description, query_spec, viz, created_at, updated_at
  FROM analytics_saved_views
  WHERE org_id = requesting_org_id()
    AND user_id = auth.uid()
  ORDER BY updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_analytics_views() TO authenticated;

-- =========================================================================
-- RPC 3: delete_analytics_view — deletar visão
-- =========================================================================
CREATE OR REPLACE FUNCTION public.delete_analytics_view(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  DELETE FROM analytics_saved_views
  WHERE id = p_id
    AND org_id = requesting_org_id()
    AND user_id = auth.uid()
  RETURNING true INTO v_deleted;

  RETURN COALESCE(v_deleted, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_analytics_view(UUID) TO authenticated;

-- =========================================================================
-- Index para queries rápidas
-- =========================================================================
CREATE INDEX idx_analytics_saved_views_org_user
  ON analytics_saved_views(org_id, user_id, updated_at DESC);

-- =========================================================================
-- Trigger: atualizar updated_at
-- =========================================================================
CREATE OR REPLACE FUNCTION trg_update_analytics_saved_views_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analytics_saved_views_update_ts
  BEFORE UPDATE ON analytics_saved_views
  FOR EACH ROW
  EXECUTE FUNCTION trg_update_analytics_saved_views_timestamp();

-- =========================================================================
-- FIM: Analytics Saved Views
-- =========================================================================
