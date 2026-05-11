-- Drop FK constraint on stage_section_config.section_key
-- Allows composite keys like trip_info:sdr, trip_info:planner for per-phase visibility control
ALTER TABLE stage_section_config
DROP CONSTRAINT IF EXISTS stage_section_config_section_key_fkey;
