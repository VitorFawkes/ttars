-- Fix: Corrigir contatos AC com nome='Sem Nome'
-- Bug: integration-process não lia deal[contact_firstname] do payload AC
-- 15 contatos afetados desde 24/fev. Busca o nome real nos payloads dos eventos.

UPDATE contatos c
SET nome = sub.first_name,
    sobrenome = NULLIF(TRIM(sub.last_name), ''),
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (ct.id)
        ct.id AS contato_id,
        TRIM(COALESCE(
            ev.payload->>'contact[first_name]',
            ev.payload->>'contact_first_name',
            ev.payload->>'deal[contact_firstname]'
        )) AS first_name,
        TRIM(COALESCE(
            ev.payload->>'contact[last_name]',
            ev.payload->>'contact_last_name',
            ev.payload->>'deal[contact_lastname]'
        )) AS last_name
    FROM contatos ct
    JOIN cards ca ON ca.pessoa_principal_id = ct.id
    JOIN integration_events ev ON ev.external_id = ca.external_id
        AND ev.entity_type = 'deal'
    WHERE ct.nome = 'Sem Nome'
      AND ct.external_source = 'active_campaign'
      AND COALESCE(
          ev.payload->>'contact[first_name]',
          ev.payload->>'contact_first_name',
          ev.payload->>'deal[contact_firstname]',
          ''
      ) != ''
    ORDER BY ct.id, ev.created_at DESC
) sub
WHERE c.id = sub.contato_id
  AND sub.first_name IS NOT NULL
  AND sub.first_name != '';
