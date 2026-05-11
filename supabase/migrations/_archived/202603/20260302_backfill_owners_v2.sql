-- Complemento do backfill: adiciona Barbara Hadassa (AC 25) ao mapeamento
-- e atualiza seus 13 cards em fase Planner que ficaram sem vendas_owner_id
-- Motivo: AC 25 não estava em integration_user_map na rodada anterior
-- Sarah Fischer (AC 52, 5 cards SDR) não tem perfil CRM — deixar sem owner por ora

-- 1. Adicionar Barbara ao mapeamento
INSERT INTO public.integration_user_map
  (integration_id, external_user_id, internal_user_id, label, direction)
VALUES
  ('a2141b92-561f-4514-92b4-9412a068d236', '25', '19e35d92-b8df-4db1-bc98-98391cdd8fd6', 'Barbara Hadassa Terleski dos Santos', 'inbound')
ON CONFLICT (integration_id, external_user_id)
  DO UPDATE SET internal_user_id = EXCLUDED.internal_user_id,
                label            = EXCLUDED.label,
                updated_at       = now();

-- 2. Reprocessar apenas os cards cujo AC owner histórico é 25
WITH latest_owner AS (
  SELECT DISTINCT ON (payload->>'deal[id]')
    payload->>'deal[id]' AS deal_external_id,
    COALESCE(
      NULLIF(payload->>'deal[owner]', ''),
      NULLIF(payload->>'owner_id',   ''),
      NULLIF(payload->>'owner',      '')
    ) AS ac_owner_id
  FROM integration_events
  WHERE event_type IN ('deal_add', 'deal_update', 'deal_state')
    AND payload->>'deal[id]' IS NOT NULL
    AND COALESCE(
          NULLIF(payload->>'deal[owner]', ''),
          NULLIF(payload->>'owner_id',   ''),
          NULLIF(payload->>'owner',      '')
        ) = '25'
  ORDER BY payload->>'deal[id]', created_at DESC
),
resolved AS (
  SELECT
    lo.deal_external_id,
    um.internal_user_id AS owner_uuid,
    ps.fase             AS stage_fase
  FROM latest_owner lo
  JOIN integration_user_map um
    ON  um.external_user_id = lo.ac_owner_id
    AND um.integration_id   = 'a2141b92-561f-4514-92b4-9412a068d236'
  JOIN cards c
    ON  c.external_id     = lo.deal_external_id
    AND c.external_source = 'active_campaign'
  JOIN pipeline_stages ps
    ON  ps.id = c.pipeline_stage_id
)
UPDATE cards c
SET
  dono_atual_id      = CASE WHEN c.dono_atual_id IS NULL THEN r.owner_uuid ELSE c.dono_atual_id END,
  vendas_owner_id    = CASE WHEN r.stage_fase = 'Planner' AND c.vendas_owner_id IS NULL THEN r.owner_uuid ELSE c.vendas_owner_id END,
  sdr_owner_id       = CASE WHEN r.stage_fase = 'SDR' AND c.sdr_owner_id IS NULL THEN r.owner_uuid ELSE c.sdr_owner_id END,
  concierge_owner_id = CASE WHEN r.stage_fase IN ('Pós-venda', 'Resolução') AND c.concierge_owner_id IS NULL THEN r.owner_uuid ELSE c.concierge_owner_id END
FROM resolved r
WHERE c.external_id     = r.deal_external_id
  AND c.external_source = 'active_campaign';
