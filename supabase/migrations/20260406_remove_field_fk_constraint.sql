-- Remove FK constraint from stage_field_config.field_key
-- field_key stores both system field slugs (for type='field') and rule keys
-- (for type='rule', e.g. 'lost_reason_required', 'contato_principal_required').
-- The FK to system_fields blocks inserting rule keys that are not in that table.
ALTER TABLE stage_field_config
    DROP CONSTRAINT IF EXISTS stage_field_config_field_key_fkey;
