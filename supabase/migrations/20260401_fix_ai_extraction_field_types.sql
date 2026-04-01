-- Fix: ai_extraction_field_config sobrescreve tipo date_range com text
-- Isso faz a RPC get_ai_extraction_config_v2 retornar type=text para campos de data,
-- impedindo que a IA saiba que são campos estruturados {data_inicio, data_fim}

-- 1. Atualizar CHECK constraint para aceitar date_range
ALTER TABLE ai_extraction_field_config
    DROP CONSTRAINT IF EXISTS ai_extraction_field_config_field_type_check;

ALTER TABLE ai_extraction_field_config
    ADD CONSTRAINT ai_extraction_field_config_field_type_check
    CHECK (field_type IN (
        'text', 'number', 'boolean', 'select', 'multiselect', 'array', 'currency',
        'smart_budget', 'flexible_duration', 'date_range'
    ));

-- 2. Corrigir field_type para date_range (consistente com system_fields)
UPDATE ai_extraction_field_config
SET field_type = 'date_range'
WHERE field_key IN ('data_exata_da_viagem', 'epoca_viagem')
  AND field_type = 'text';

-- 3. Atualizar prompt_format e examples de epoca_viagem para date_range
-- (antes era flexible_date com mes/ano, agora é date_range com data_inicio/data_fim)
UPDATE ai_extraction_field_config
SET
  prompt_format = 'Objeto com data_inicio e data_fim (YYYY-MM-DD). Igual ao campo data_exata_da_viagem.',
  prompt_examples = '{"data_inicio": "2026-01-15", "data_fim": "2026-02-10"}'
WHERE field_key = 'epoca_viagem';
