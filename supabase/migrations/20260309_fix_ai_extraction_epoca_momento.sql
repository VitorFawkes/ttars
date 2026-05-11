-- Fix: epoca_viagem extraction format + criar momento_viagem em system_fields
-- Bug: AI extraía epoca_viagem como texto livre, UI espera flexible_date estruturado
-- Bug: momento_viagem era extraído mas não existia em system_fields (invisível na UI)

-- 1. Atualizar ai_extraction_field_config para epoca_viagem
-- Mantém field_type=text (check constraint) mas muda o prompt para pedir JSON estruturado
UPDATE ai_extraction_field_config
SET prompt_format = 'Objeto JSON com mês e ano. Formatos: {"mes": 12, "ano": 2026} para mês específico, {"mes_inicio": 6, "mes_fim": 8, "ano": 2026} para range de meses, ou a string "indefinido" se cliente não definiu. NUNCA texto descritivo livre.',
    prompt_examples = '{"mes": 3, "ano": 2026}, {"mes_inicio": 6, "mes_fim": 8, "ano": 2026}, "indefinido"'
WHERE field_key = 'epoca_viagem';

-- 2. Atualizar ai_extraction_field_config para momento_viagem (adicionar allowed_values)
UPDATE ai_extraction_field_config
SET field_type = 'select',
    prompt_format = 'String com valor exato dos permitidos',
    allowed_values = '["lua_de_mel", "ferias", "aniversario", "comemorativo", "trabalho", "outro"]'::jsonb
WHERE field_key = 'momento_viagem';

-- 3. Criar momento_viagem em system_fields (para que a UI renderize)
INSERT INTO system_fields (key, label, type, section, active, order_index, options)
VALUES (
    'momento_viagem',
    'Momento da Viagem',
    'select',
    'trip_info',
    true,
    15,
    '[
        {"value": "lua_de_mel", "label": "Lua de Mel", "color": "pink"},
        {"value": "ferias", "label": "Férias", "color": "blue"},
        {"value": "aniversario", "label": "Aniversário", "color": "purple"},
        {"value": "comemorativo", "label": "Comemorativo", "color": "amber"},
        {"value": "trabalho", "label": "Trabalho", "color": "gray"},
        {"value": "outro", "label": "Outro", "color": "gray"}
    ]'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
    section = EXCLUDED.section,
    type = EXCLUDED.type,
    active = EXCLUDED.active,
    options = EXCLUDED.options,
    order_index = EXCLUDED.order_index;
