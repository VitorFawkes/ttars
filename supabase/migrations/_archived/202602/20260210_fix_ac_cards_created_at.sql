-- Fix created_at for cards imported from ActiveCampaign
-- Cards were getting current processing time instead of the AC deal creation date

UPDATE cards
SET created_at = ac_dates.ac_created_at,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (c.id)
        c.id AS card_id,
        COALESCE(
            (ie.payload->>'deal[create_date]')::timestamptz,
            (ie.payload->>'cdate')::timestamptz,
            (ie.payload->>'date_time')::timestamptz
        ) AS ac_created_at
    FROM cards c
    INNER JOIN integration_events ie
        ON c.external_id = ie.external_id
        AND ie.entity_type = 'deal'
    WHERE c.external_source = 'active_campaign'
        AND c.external_id IS NOT NULL
        AND ie.payload IS NOT NULL
        AND (
            ie.payload->>'deal[create_date]' IS NOT NULL
            OR ie.payload->>'cdate' IS NOT NULL
            OR ie.payload->>'date_time' IS NOT NULL
        )
    ORDER BY c.id, ie.created_at ASC
) ac_dates
WHERE cards.id = ac_dates.card_id
  AND ac_dates.ac_created_at IS NOT NULL;
