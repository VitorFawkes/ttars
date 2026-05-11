-- Backfill de datas — v3 (patch final)
-- Para cards AC que ainda não têm stage_entered_at após v1 e v2:
-- sem eventos no integration_events → usar created_at como fallback
UPDATE cards
SET stage_entered_at = created_at
WHERE external_source = 'active_campaign'
  AND stage_entered_at IS NULL;
