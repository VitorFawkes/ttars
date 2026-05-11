-- Extend chk_valid_requirement_type to include 'rule' and 'document' types
-- These types are already used in the codebase (GovernanceConsole, useQualityGate)
-- but the constraint was never updated to allow them.

ALTER TABLE stage_field_config
    DROP CONSTRAINT IF EXISTS chk_valid_requirement_type;

ALTER TABLE stage_field_config
    ADD CONSTRAINT chk_valid_requirement_type
        CHECK (requirement_type IN ('field', 'proposal', 'task', 'rule', 'document'));
