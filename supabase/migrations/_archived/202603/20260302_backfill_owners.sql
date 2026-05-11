-- Backfill de owners em cards TRIPS oriundos do Active Campaign
-- Pré-requisito: migration 20260302_planner_user_map.sql já aplicada
-- Lógica: encontrar o deal[owner] mais recente nos integration_events e resolver via integration_user_map
-- Garantia: só preenche campos NULL — não sobrescreve atribuições manuais existentes

WITH latest_owner AS (
  -- Para cada AC deal ID, pegar o owner do evento mais recente que tenha deal[owner] preenchido
  SELECT DISTINCT ON (payload->>'deal[id]')
    payload->>'deal[id]'    AS deal_external_id,
    COALESCE(
      NULLIF(payload->>'deal[owner]', ''),
      NULLIF(payload->>'owner_id',   ''),
      NULLIF(payload->>'owner',      '')
    )                        AS ac_owner_id
  FROM integration_events
  WHERE event_type IN ('deal_add', 'deal_update', 'deal_state')
    AND payload->>'deal[id]' IS NOT NULL
    AND COALESCE(
          NULLIF(payload->>'deal[owner]', ''),
          NULLIF(payload->>'owner_id',   ''),
          NULLIF(payload->>'owner',      '')
        ) IS NOT NULL
    AND COALESCE(
          NULLIF(payload->>'deal[owner]', ''),
          NULLIF(payload->>'owner_id',   ''),
          NULLIF(payload->>'owner',      '')
        ) <> '0'
  ORDER BY payload->>'deal[id]', created_at DESC
),
resolved AS (
  -- Resolver ac_owner_id → CRM profile UUID via integration_user_map
  SELECT
    lo.deal_external_id,
    um.internal_user_id  AS owner_uuid,
    ps.fase              AS stage_fase
  FROM latest_owner lo
  JOIN integration_user_map um
    ON  um.external_user_id = lo.ac_owner_id
    AND um.integration_id   = 'a2141b92-561f-4514-92b4-9412a068d236'
  JOIN cards c
    ON  c.external_id     = lo.deal_external_id
    AND c.external_source = 'active_campaign'
  JOIN pipeline_stages ps
    ON  ps.id = c.pipeline_stage_id
  WHERE
    c.dono_atual_id    IS NULL
    OR c.vendas_owner_id   IS NULL
    OR c.sdr_owner_id      IS NULL
    OR c.concierge_owner_id IS NULL
)
UPDATE cards c
SET
  dono_atual_id       = CASE
                          WHEN c.dono_atual_id IS NULL THEN r.owner_uuid
                          ELSE c.dono_atual_id
                        END,
  vendas_owner_id     = CASE
                          WHEN r.stage_fase = 'Planner'
                               AND c.vendas_owner_id IS NULL
                          THEN r.owner_uuid
                          ELSE c.vendas_owner_id
                        END,
  sdr_owner_id        = CASE
                          WHEN r.stage_fase = 'SDR'
                               AND c.sdr_owner_id IS NULL
                          THEN r.owner_uuid
                          ELSE c.sdr_owner_id
                        END,
  concierge_owner_id  = CASE
                          WHEN r.stage_fase IN ('Pós-venda', 'Resolução')
                               AND c.concierge_owner_id IS NULL
                          THEN r.owner_uuid
                          ELSE c.concierge_owner_id
                        END
FROM resolved r
WHERE c.external_id     = r.deal_external_id
  AND c.external_source = 'active_campaign';
