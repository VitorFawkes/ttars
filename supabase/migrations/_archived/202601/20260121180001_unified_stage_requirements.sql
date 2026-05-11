-- ============================================================================
-- Unified Stage Requirements - Extend stage_field_config
-- ============================================================================
-- Purpose: Add support for 3 requirement types: field, proposal, task
-- Author: Antigravity
-- Date: 2026-01-21
-- ============================================================================

-- Step 1: Create ENUM for type safety
DO $$ BEGIN
    CREATE TYPE requirement_type_enum AS ENUM ('field', 'proposal', 'task');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add new columns to stage_field_config
-- Using TEXT for requirement_type to avoid enum migration issues
ALTER TABLE stage_field_config 
    ADD COLUMN IF NOT EXISTS requirement_type TEXT NOT NULL DEFAULT 'field',
    ADD COLUMN IF NOT EXISTS requirement_label TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_blocking BOOLEAN DEFAULT TRUE,
    -- For proposal requirements
    ADD COLUMN IF NOT EXISTS proposal_min_status TEXT,
    -- For task requirements  
    ADD COLUMN IF NOT EXISTS task_tipo TEXT,
    ADD COLUMN IF NOT EXISTS task_require_completed BOOLEAN DEFAULT TRUE;

-- Step 3: Add CHECK constraint for valid requirement types
DO $$ BEGIN
    ALTER TABLE stage_field_config
        ADD CONSTRAINT chk_valid_requirement_type 
            CHECK (requirement_type IN ('field', 'proposal', 'task'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 4: Add constraints for type-specific required fields
DO $$ BEGIN
    ALTER TABLE stage_field_config
        ADD CONSTRAINT chk_field_requires_field_key 
            CHECK (requirement_type != 'field' OR field_key IS NOT NULL);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE stage_field_config
        ADD CONSTRAINT chk_proposal_requires_status 
            CHECK (requirement_type != 'proposal' OR proposal_min_status IS NOT NULL);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE stage_field_config
        ADD CONSTRAINT chk_task_requires_tipo 
            CHECK (requirement_type != 'task' OR task_tipo IS NOT NULL);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 5: Populate requirement_label from system_fields for existing rows
UPDATE stage_field_config sfc
SET requirement_label = (
    SELECT sf.label 
    FROM system_fields sf 
    WHERE sf.key = sfc.field_key
)
WHERE sfc.requirement_label IS NULL 
  AND sfc.field_key IS NOT NULL
  AND sfc.requirement_type = 'field';

-- Step 6: Create index for requirement_type queries
CREATE INDEX IF NOT EXISTS idx_stage_field_config_requirement_type 
    ON stage_field_config (requirement_type);

-- Step 7: Create composite index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_stage_field_config_stage_type 
    ON stage_field_config (stage_id, requirement_type);

-- Step 8: Create index for required requirements lookup
CREATE INDEX IF NOT EXISTS idx_stage_field_config_required 
    ON stage_field_config (stage_id, is_required) 
    WHERE is_required = true;

-- Step 9: Add comment for documentation
COMMENT ON TABLE stage_field_config IS 'Unified stage requirements: fields, proposals, and tasks per pipeline stage.';
COMMENT ON COLUMN stage_field_config.requirement_type IS 'Type of requirement: field (data field), proposal (min proposal status), task (completed task of type)';
COMMENT ON COLUMN stage_field_config.requirement_label IS 'Human-readable label for the requirement';
COMMENT ON COLUMN stage_field_config.proposal_min_status IS 'For proposal type: minimum status required (draft, sent, accepted, etc.)';
COMMENT ON COLUMN stage_field_config.task_tipo IS 'For task type: required task tipo (ligacao, reuniao, etc.)';
COMMENT ON COLUMN stage_field_config.task_require_completed IS 'For task type: whether the task must be completed (default: true)';
COMMENT ON COLUMN stage_field_config.is_blocking IS 'Whether this requirement blocks stage advancement (default: true)';
