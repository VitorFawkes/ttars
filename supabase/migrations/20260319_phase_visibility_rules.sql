-- Phase Visibility Rules: configura quais fases cada fase pode ver além da própria
-- Semântica: (source=Planner, target=Pos-Venda) = "quem está no Planner também vê Pós-Venda"

CREATE TABLE public.phase_visibility_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_phase_id UUID NOT NULL REFERENCES pipeline_phases(id) ON DELETE CASCADE,
    target_phase_id UUID NOT NULL REFERENCES pipeline_phases(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_phase_id, target_phase_id),
    CHECK (source_phase_id != target_phase_id)
);

-- Index para busca rápida por source_phase_id (caso de uso principal)
CREATE INDEX idx_phase_visibility_source ON phase_visibility_rules(source_phase_id);

-- RLS
ALTER TABLE phase_visibility_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_visibility_rules_read"
    ON phase_visibility_rules FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "phase_visibility_rules_admin_insert"
    ON phase_visibility_rules FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "phase_visibility_rules_admin_delete"
    ON phase_visibility_rules FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
