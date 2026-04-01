-- Fix: requirement_type column had DEFAULT 'field' and NOT NULL constraint,
-- which caused ALL visibility rows to look like action requirements.
--
-- This migration:
-- 1. Removes NOT NULL constraint and DEFAULT from requirement_type
-- 2. Sets requirement_type=NULL on rows that are purely visibility configs
-- 3. Preserves rows where is_required=true (actual action requirements)

-- Step 1: Allow NULLs and remove default
ALTER TABLE stage_field_config
  ALTER COLUMN requirement_type DROP NOT NULL,
  ALTER COLUMN requirement_type DROP DEFAULT;

-- Step 2: Set NULL on visibility-only rows (is_required=false)
UPDATE stage_field_config
SET requirement_type = NULL
WHERE is_required = false;
