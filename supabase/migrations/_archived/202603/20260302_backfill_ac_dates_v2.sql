-- Backfill de datas em cards AC — v2
-- Corrige: ac_created agora usa qualquer evento com deal[create_date_iso],
--          não só deal_add (cobre cards bulk-importados sem evento de criação)
-- Lógica:
--   created_at       ← deal[create_date_iso] mais antigo de qualquer evento
--   stage_entered_at ← date_time do evento mais recente com deal[stageid] = stage atual
--   fallback          ← se stage não encontrado, usar created_at do AC

WITH ac_created AS (
  -- Data real de criação do deal no AC — usa o deal[create_date_iso] mais antigo
  -- encontrado em qualquer evento (deal_add, deal_update, deal_state)
  -- Cobre tanto cards com deal_add quanto bulk-importados que só têm deal_update
  SELECT DISTINCT ON (payload->>'deal[id]')
    payload->>'deal[id]'                              AS deal_external_id,
    (payload->>'deal[create_date_iso]')::timestamptz  AS ac_created_at
  FROM integration_events
  WHERE event_type IN ('deal_add', 'deal_update', 'deal_state')
    AND payload->>'deal[id]'              IS NOT NULL
    AND payload->>'deal[create_date_iso]' IS NOT NULL
    AND NULLIF(payload->>'deal[create_date_iso]', '') IS NOT NULL
  ORDER BY payload->>'deal[id]',
           (payload->>'deal[create_date_iso]')::timestamptz ASC  -- mais antigo = data original
),
ac_stage_entered AS (
  -- Quando o card entrou no seu stage atual (cruza via integration_stage_map)
  SELECT DISTINCT ON (c.external_id)
    c.external_id                               AS deal_external_id,
    (ie.payload->>'date_time')::timestamptz     AS stage_entered_at
  FROM cards c
  JOIN integration_stage_map sm
    ON  sm.internal_stage_id = c.pipeline_stage_id
    AND sm.integration_id    = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND sm.direction         = 'inbound'
    AND sm.external_stage_id ~ '^\d+$'
  JOIN integration_events ie
    ON  ie.payload->>'deal[id]'      = c.external_id
    AND ie.payload->>'deal[stageid]' = sm.external_stage_id
    AND ie.event_type IN ('deal_add', 'deal_update', 'deal_state')
  WHERE c.external_source = 'active_campaign'
  ORDER BY c.external_id, ie.created_at DESC
)
UPDATE cards c
SET
  created_at       = COALESCE(acd.ac_created_at, c.created_at),
  stage_entered_at = COALESCE(
                       ase.stage_entered_at,   -- quando entrou no stage atual (AC events)
                       acd.ac_created_at,       -- fallback: data de criação do AC
                       c.created_at             -- fallback final
                     )
FROM ac_created acd
LEFT JOIN ac_stage_entered ase ON ase.deal_external_id = acd.deal_external_id
WHERE c.external_id     = acd.deal_external_id
  AND c.external_source = 'active_campaign';
