-- Campo "Data Reunião" no card — preenchido pela automação do Calendly.
--
-- Armazenado em cards.produto_data->>'data_reuniao' (JSONB).
-- Renderizado pelo UniversalFieldRenderer existente (type=date).
-- Aparece na seção 'trip_info' ("Informações da Viagem").
--
-- Disponível pros produtos TRIPS e WEDDING.

BEGIN;

-- 1) system_fields: cadastrar em Welcome Group (fonte do seed) + orgs TRIPS/WEDDING
INSERT INTO system_fields (
    key, label, type, options, active, section, is_system,
    section_id, order_index, produto_exclusivo, org_id
)
SELECT
    'data_reuniao'::text AS key,
    'Data da Reunião'::text AS label,
    'date'::text AS type,
    NULL::jsonb AS options,
    true AS active,
    'trip_info'::text AS section,
    false AS is_system,
    NULL::uuid AS section_id,
    105 AS order_index,
    NULL::text AS produto_exclusivo,  -- disponível em TRIPS e WEDDING
    o.id AS org_id
FROM organizations o
WHERE
    o.id = 'a0000000-0000-0000-0000-000000000001'::uuid  -- Welcome Group
    OR EXISTS (
        SELECT 1 FROM pipelines p
        WHERE p.org_id = o.id AND p.produto::TEXT IN ('TRIPS', 'WEDDING')
    )
ON CONFLICT (org_id, key) DO NOTHING;

-- 2) section_field_config: marcar visível em trip_info
INSERT INTO section_field_config (section_key, field_key, is_visible, is_required, org_id)
SELECT
    'trip_info'::text AS section_key,
    'data_reuniao'::text AS field_key,
    true AS is_visible,
    false AS is_required,
    sf.org_id
FROM system_fields sf
WHERE sf.key = 'data_reuniao'
ON CONFLICT DO NOTHING;

COMMIT;

COMMENT ON COLUMN system_fields.key IS 'Campo data_reuniao adicionado em 20260526g: preenchido pela automação do Calendly em cards.produto_data->data_reuniao';
