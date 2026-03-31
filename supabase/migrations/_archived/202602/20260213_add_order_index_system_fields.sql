-- Add order_index to system_fields for field ordering within sections
ALTER TABLE system_fields ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Initialize with current alphabetical order per section
WITH ranked AS (
  SELECT key, ROW_NUMBER() OVER (PARTITION BY section ORDER BY label) as rn
  FROM system_fields
  WHERE active = true
)
UPDATE system_fields
SET order_index = ranked.rn
FROM ranked
WHERE system_fields.key = ranked.key;
