-- ============================================
-- Custom Reports & Dashboards — Schema
-- ============================================

-- 1. Relatórios salvos
CREATE TABLE IF NOT EXISTS custom_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    config JSONB NOT NULL,            -- IQR: Intermediate Query Representation
    visualization JSONB NOT NULL,      -- tipo de gráfico + config visual
    created_by UUID NOT NULL REFERENCES profiles(id),
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'team', 'everyone')),
    is_template BOOLEAN NOT NULL DEFAULT FALSE,
    category TEXT,
    pinned BOOLEAN DEFAULT FALSE,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_owner ON custom_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_custom_reports_visibility ON custom_reports(visibility);
CREATE INDEX IF NOT EXISTS idx_custom_reports_template ON custom_reports(is_template) WHERE is_template = TRUE;

-- 2. Dashboards
CREATE TABLE IF NOT EXISTS custom_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    global_filters JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES profiles(id),
    visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'team', 'everyone')),
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_owner ON custom_dashboards(created_by);

-- 3. Widgets (relatórios dentro de dashboards)
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES custom_dashboards(id) ON DELETE CASCADE,
    report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
    grid_x INT NOT NULL DEFAULT 0,
    grid_y INT NOT NULL DEFAULT 0,
    grid_w INT NOT NULL DEFAULT 6 CHECK (grid_w BETWEEN 2 AND 12),
    grid_h INT NOT NULL DEFAULT 4 CHECK (grid_h BETWEEN 2 AND 8),
    title_override TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widgets_dashboard ON dashboard_widgets(dashboard_id);

-- 4. RLS
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Reports: ver próprios + visíveis para todos/time
CREATE POLICY "reports_select" ON custom_reports FOR SELECT TO authenticated
    USING (
        created_by = auth.uid()
        OR visibility = 'everyone'
        OR (visibility = 'team' AND created_by IN (
            SELECT p.id FROM profiles p
            WHERE p.team_id = (SELECT p2.team_id FROM profiles p2 WHERE p2.id = auth.uid())
        ))
        OR is_template = TRUE
    );

CREATE POLICY "reports_insert" ON custom_reports FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "reports_update" ON custom_reports FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "reports_delete" ON custom_reports FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- Dashboards: mesma lógica
CREATE POLICY "dashboards_select" ON custom_dashboards FOR SELECT TO authenticated
    USING (
        created_by = auth.uid()
        OR visibility = 'everyone'
        OR (visibility = 'team' AND created_by IN (
            SELECT p.id FROM profiles p
            WHERE p.team_id = (SELECT p2.team_id FROM profiles p2 WHERE p2.id = auth.uid())
        ))
    );

CREATE POLICY "dashboards_insert" ON custom_dashboards FOR INSERT TO authenticated
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "dashboards_update" ON custom_dashboards FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "dashboards_delete" ON custom_dashboards FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- Widgets: acesso via dashboard
CREATE POLICY "widgets_select" ON dashboard_widgets FOR SELECT TO authenticated
    USING (
        dashboard_id IN (SELECT id FROM custom_dashboards)
    );

CREATE POLICY "widgets_insert" ON dashboard_widgets FOR INSERT TO authenticated
    WITH CHECK (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
    );

CREATE POLICY "widgets_update" ON dashboard_widgets FOR UPDATE TO authenticated
    USING (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
    );

CREATE POLICY "widgets_delete" ON dashboard_widgets FOR DELETE TO authenticated
    USING (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
    );

-- 5. Updated_at trigger
CREATE OR REPLACE FUNCTION update_custom_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_custom_reports_updated_at
    BEFORE UPDATE ON custom_reports
    FOR EACH ROW EXECUTE FUNCTION update_custom_reports_updated_at();

CREATE TRIGGER trg_custom_dashboards_updated_at
    BEFORE UPDATE ON custom_dashboards
    FOR EACH ROW EXECUTE FUNCTION update_custom_reports_updated_at();
