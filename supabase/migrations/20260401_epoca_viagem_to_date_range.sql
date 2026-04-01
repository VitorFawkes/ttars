-- Converter epoca_viagem de flexible_date para date_range
-- Ambos os campos de data agora usam o mesmo formato (início/fim exato)

UPDATE system_fields
SET type = 'date_range'
WHERE key = 'epoca_viagem'
  AND type = 'flexible_date';
