-- Backfill: preenche cards.produto_data->>'data_reuniao' pros cards que já
-- tiveram reunião agendada via Calendly mas o campo não foi gravado (porque
-- o trigger sync_card_meeting_data_from_calendly só passou a existir agora).
--
-- Match: webhook.invitee_email -> contatos.email -> cards.pessoa_principal_id.
-- Pra cada card pega a reunião mais recente (event_start_time DESC).
-- Só preenche se data_reuniao ainda está vazio no produto_data.

WITH calendly_meetings AS (
  SELECT
    c.id AS card_id,
    cwe.event_start_time,
    cwe.meeting_join_url,
    cwe.event_name,
    ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY cwe.event_start_time DESC) AS rn
  FROM calendly_webhook_events cwe
  JOIN contatos ct
    ON lower(ct.email) = lower(cwe.invitee_email)
    AND ct.deleted_at IS NULL
  JOIN cards c
    ON c.pessoa_principal_id = ct.id
    AND c.org_id = ct.org_id
  WHERE cwe.event_type = 'invitee.created'
    AND cwe.event_start_time IS NOT NULL
    AND cwe.invitee_email IS NOT NULL
)
UPDATE cards
SET produto_data = coalesce(cards.produto_data, '{}'::jsonb)
                || jsonb_build_object(
                     'data_reuniao', cm.event_start_time::text,
                     'calendly_meeting_link', cm.meeting_join_url,
                     'calendly_event_name', cm.event_name
                   ),
    updated_at = NOW()
FROM calendly_meetings cm
WHERE cards.id = cm.card_id
  AND cm.rn = 1
  AND coalesce(cards.produto_data->>'data_reuniao', '') = '';
