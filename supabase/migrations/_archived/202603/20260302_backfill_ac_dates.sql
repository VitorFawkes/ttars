-- Backfill de datas em cards oriundos do Active Campaign
-- Problema: cards importados do AC têm created_at = data do import (2025-06-04)
--           e stage_entered_at = NULL
-- Solução:
--   created_at       ← deal[create_date_iso] do evento deal_add mais antigo
--   stage_entered_at ← date_time do evento mais recente onde deal[stageid] = stage atual
--   fallback          ← se não houver evento de stage, usar created_at do AC
--
-- Segurança: só atualiza cards com external_source = 'active_campaign'
--            COALESCE garante que não sobrescreve com NULL

WITH ac_created AS (
  -- Data real de criação do deal no AC (deal[create_date_iso] do deal_add mais antigo)
  SELECT DISTINCT ON (payload->>'deal[id]')
    payload->>'deal[id]'                              AS deal_external_id,
    (payload->>'deal[create_date_iso]')::timestamptz  AS ac_created_at
  FROM integration_events
  WHERE event_type = 'deal_add'
    AND payload->>'deal[id]'          IS NOT NULL
    AND payload->>'deal[create_date_iso]' IS NOT NULL
  ORDER BY payload->>'deal[id]', created_at ASC  -- mais antigo = data real de criação
),
ac_stage_entered AS (
  -- Momento mais recente em que o card entrou no seu stage atual
  -- Chave: deal_external_id (texto) para poder fazer JOIN sem referenciar a tabela-alvo
  SELECT DISTINCT ON (c.external_id)
    c.external_id                               AS deal_external_id,
    (ie.payload->>'date_time')::timestamptz     AS stage_entered_at
  FROM cards c
  JOIN integration_stage_map sm
    ON  sm.internal_stage_id = c.pipeline_stage_id
    AND sm.integration_id    = 'a2141b92-561f-4514-92b4-9412a068d236'
    AND sm.direction         = 'inbound'
    AND sm.external_stage_id ~ '^\d+$'          -- só IDs numéricos reais do AC (exclui seeds)
  JOIN integration_events ie
    ON  ie.payload->>'deal[id]'      = c.external_id
    AND ie.payload->>'deal[stageid]' = sm.external_stage_id
    AND ie.event_type IN ('deal_add', 'deal_update', 'deal_state')
  WHERE c.external_source = 'active_campaign'
  ORDER BY c.external_id, ie.created_at DESC    -- mais recente = última vez que entrou neste stage
)
UPDATE cards c
SET
  created_at       = COALESCE(acd.ac_created_at, c.created_at),
  stage_entered_at = COALESCE(
                       ase.stage_entered_at,   -- quando entrou no stage atual (AC)
                       acd.ac_created_at,       -- fallback: data de criação do AC
                       c.created_at             -- fallback final
                     )
FROM ac_created acd
LEFT JOIN ac_stage_entered ase ON ase.deal_external_id = acd.deal_external_id
WHERE c.external_id     = acd.deal_external_id
  AND c.external_source = 'active_campaign';
