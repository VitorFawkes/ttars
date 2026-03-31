-- Migration: Cleanup - delete Marketing from pipeline_phases if it exists
-- Marketing should be a regular section (managed via Section Manager), not a pipeline phase

-- Delete the Marketing phase if it exists
DELETE FROM pipeline_phases WHERE name = 'Marketing';

-- Note: Users can create their own Marketing section via the Section Manager UI
-- The DynamicSectionWidget will render any section created there automatically
