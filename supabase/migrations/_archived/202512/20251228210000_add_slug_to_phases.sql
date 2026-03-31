-- Add slug column to pipeline_phases
ALTER TABLE pipeline_phases ADD COLUMN slug text;

-- Populate slugs for known system phases
-- We use a CASE statement to map existing names to slugs
UPDATE pipeline_phases
SET slug = CASE
    WHEN name = 'SDR' THEN 'sdr'
    WHEN name = 'Planner' THEN 'planner'
    WHEN name = 'Pós-venda' THEN 'pos_venda'
    WHEN name = 'Resolução' THEN 'resolucao'
    ELSE NULL -- Should not happen for core phases, but safe fallback
END
WHERE name IN ('SDR', 'Planner', 'Pós-venda', 'Resolução');

-- Add unique constraint to slug
-- We only enforce uniqueness on non-null values
CREATE UNIQUE INDEX pipeline_phases_slug_key ON pipeline_phases (slug) WHERE slug IS NOT NULL;

-- Add comment
COMMENT ON COLUMN pipeline_phases.slug IS 'Immutable system identifier for the phase (e.g., sdr, planner). Used for code logic.';
