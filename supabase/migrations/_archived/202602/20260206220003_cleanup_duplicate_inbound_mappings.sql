-- MEDIUM-3: Remove mapeamentos inbound duplicados
-- Mantém apenas o mais recente de cada combinação (entity_type, local_field_key)
-- Duplicatas encontradas: utm_source x4, telefone x2, destinos x2, motivo x2, etc.

DELETE FROM public.integration_field_map
WHERE id NOT IN (
    SELECT DISTINCT ON (entity_type, local_field_key) id
    FROM public.integration_field_map
    ORDER BY entity_type, local_field_key, updated_at DESC NULLS LAST
);

-- Verificação: contar duplicatas restantes (deve ser 0)
-- SELECT entity_type, local_field_key, count(*)
-- FROM integration_field_map
-- GROUP BY entity_type, local_field_key
-- HAVING count(*) > 1;
