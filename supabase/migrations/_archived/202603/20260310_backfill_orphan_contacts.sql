-- Backfill: vincular contatos a cards órfãos do Active Campaign
-- 280 cards com pessoa_principal_id NULL que vieram do sync batch sem dados de contato
-- Os eventos posteriores (deal_update) trouxeram os dados — usamos para fazer o match

BEGIN;

-- Pass 1: Match por external_id do contato AC (mais confiável)
UPDATE cards c
SET pessoa_principal_id = ct.id,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (e.external_id)
        e.external_id AS deal_id,
        COALESCE(e.payload->>'contact_id', e.payload->>'contactid') AS ac_contact_id
    FROM integration_events e
    WHERE e.entity_type = 'deal'
      AND COALESCE(e.payload->>'contact_id', e.payload->>'contactid') IS NOT NULL
    ORDER BY e.external_id, e.created_at DESC
) ev
JOIN contatos ct ON ct.external_id = ev.ac_contact_id AND ct.external_source = 'active_campaign'
WHERE c.external_id = ev.deal_id
  AND c.external_source = 'active_campaign'
  AND c.pessoa_principal_id IS NULL;

-- Pass 2: Match por email (fallback para contatos sem external_id AC)
UPDATE cards c
SET pessoa_principal_id = ct.id,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (e.external_id)
        e.external_id AS deal_id,
        e.payload->>'contact_email' AS contact_email
    FROM integration_events e
    WHERE e.entity_type = 'deal'
      AND e.payload->>'contact_email' IS NOT NULL
    ORDER BY e.external_id, e.created_at DESC
) ev
JOIN contatos ct ON ct.email = ev.contact_email
WHERE c.external_id = ev.deal_id
  AND c.external_source = 'active_campaign'
  AND c.pessoa_principal_id IS NULL;

COMMIT;
