-- Tabela de metas para Analytics v2
-- Permite ao usuário configurar metas de receita por produto e período

CREATE TABLE IF NOT EXISTS analytics_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  month DATE NOT NULL,
  target_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  CONSTRAINT analytics_targets_org_produto_metric_month_unique
    UNIQUE (org_id, produto, metric_key, month),
  CONSTRAINT analytics_targets_month_first_day CHECK (DATE_TRUNC('month', month)::DATE = month)
);

-- RLS: Usuários veem só metas da sua org
ALTER TABLE analytics_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_targets_org_read ON analytics_targets
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

CREATE POLICY analytics_targets_org_write ON analytics_targets
  FOR INSERT TO authenticated
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY analytics_targets_org_update ON analytics_targets
  FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY analytics_targets_org_delete ON analytics_targets
  FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());

-- service_role pode tudo
CREATE POLICY analytics_targets_service_all ON analytics_targets
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Índices para performance
CREATE INDEX idx_analytics_targets_org_produto_month
  ON analytics_targets(org_id, produto, month);

CREATE INDEX idx_analytics_targets_metric_key
  ON analytics_targets(metric_key);

COMMENT ON TABLE analytics_targets IS 'Metas configuráveis para dashboards analytics v2. Não é tabela global, isolada por org_id.';
