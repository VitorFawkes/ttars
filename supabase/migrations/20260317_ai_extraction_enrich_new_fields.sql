-- =====================================================
-- Enriquecer ai_extraction_field_config com campos novos
-- e corrigir RPC V2 para excluir 'briefing' (é output)
-- =====================================================

-- 1. Adicionar campos que existem em system_fields mas faltam em ai_extraction_field_config
INSERT INTO ai_extraction_field_config (field_key, section, field_type, label, prompt_question, prompt_format, prompt_examples, prompt_extract_when, allowed_values, sort_order)
VALUES
('observacoes', 'observacoes', 'text', 'Observações Gerais',
    'Há alguma observação importante sobre o cliente ou a viagem que não se encaixa nos outros campos?',
    'Texto livre com informações relevantes',
    '"Cliente tem mobilidade reduzida", "Viajando com bebê de 6 meses", "Quer surpreender a esposa"',
    'Cliente menciona informações importantes que não se encaixam em outros campos específicos',
    NULL, 16),

('cidade_origem', 'trip_info', 'text', 'Cidade Origem',
    'De qual cidade o cliente vai partir?',
    'Nome da cidade',
    '"São Paulo", "Rio de Janeiro", "Curitiba"',
    'Cliente menciona de onde vai sair ou onde mora',
    NULL, 17),

('tipo_de_hospedagem', 'trip_info', 'text', 'Tipo de Hospedagem',
    'Que tipo de hospedagem o cliente prefere?',
    'Texto livre descrevendo preferência',
    '"Hotel 5 estrelas", "Resort all-inclusive", "Airbnb", "Villa privativa"',
    'Cliente menciona preferência de hotel, resort, pousada ou tipo de acomodação',
    NULL, 18),

('data_exata_da_viagem', 'trip_info', 'text', 'Data Exata da Viagem',
    'O cliente tem datas específicas para a viagem?',
    'Objeto com data_inicio e data_fim (YYYY-MM-DD)',
    '"{"data_inicio": "2026-06-15", "data_fim": "2026-06-25"}"',
    'Cliente menciona datas específicas de ida e volta',
    NULL, 19),

('degustacao_tp', 'trip_info', 'boolean', 'Degustação com TP ofertada?',
    'A Degustação/Trip Preview foi oferecida ao cliente?',
    'true ou false',
    'true, false',
    'Consultor menciona que ofereceu ou que o cliente já fez a degustação/Trip Preview',
    NULL, 20)

ON CONFLICT (field_key) DO UPDATE SET
    prompt_question = EXCLUDED.prompt_question,
    prompt_format = EXCLUDED.prompt_format,
    prompt_examples = EXCLUDED.prompt_examples,
    prompt_extract_when = EXCLUDED.prompt_extract_when,
    updated_at = now();

-- 2. Atualizar RPC V2 para excluir 'briefing' (é output da IA, não input de extração)
CREATE OR REPLACE FUNCTION get_ai_extraction_config_v2(p_stage_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
SELECT jsonb_build_object(
    'fields', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', sf.key,
                'section', CASE
                    WHEN sf.section = 'observacoes_criticas' THEN 'observacoes'
                    ELSE sf.section
                END,
                'type', COALESCE(ae.field_type, sf.type),
                'label', sf.label,
                'question', COALESCE(ae.prompt_question, 'Qual é o valor de ' || sf.label || '?'),
                'format', COALESCE(ae.prompt_format,
                    CASE sf.type
                        WHEN 'textarea' THEN 'Texto livre'
                        WHEN 'text' THEN 'Texto livre'
                        WHEN 'number' THEN 'Número inteiro'
                        WHEN 'currency' THEN 'Valor em reais (número)'
                        WHEN 'boolean' THEN 'true ou false'
                        WHEN 'select' THEN 'String com valor exato dos permitidos'
                        WHEN 'multiselect' THEN 'Array de strings com valores exatos permitidos'
                        WHEN 'date_range' THEN 'Objeto com data_inicio e data_fim (YYYY-MM-DD)'
                        WHEN 'flexible_date' THEN 'Objeto com tipo, mes, ano'
                        WHEN 'flexible_duration' THEN 'Objeto com tipo, dias_min, dias_max'
                        WHEN 'smart_budget' THEN 'Objeto com tipo, valor ou valor_min/valor_max'
                        ELSE 'Texto livre'
                    END
                ),
                'examples', ae.prompt_examples,
                'extract_when', ae.prompt_extract_when,
                'allowed_values', COALESCE(
                    ae.allowed_values,
                    CASE
                        WHEN sf.type IN ('select', 'multiselect') AND sf.options IS NOT NULL
                        THEN sf.options
                        ELSE NULL
                    END
                ),
                'is_visible', COALESCE(sfc.is_visible, true)
            ) ORDER BY
                CASE WHEN sf.section = 'trip_info' THEN 0 ELSE 1 END,
                sf.order_index NULLS LAST
        )
        FROM system_fields sf
        LEFT JOIN ai_extraction_field_config ae ON ae.field_key = sf.key AND ae.is_active = true
        LEFT JOIN stage_field_config sfc ON sfc.field_key = sf.key AND sfc.stage_id = p_stage_id
        WHERE sf.active = true
          AND sf.section IN ('trip_info', 'observacoes_criticas')
          AND sf.key != 'briefing'  -- briefing é OUTPUT da IA (TAREFA 1), não campo de extração
    ),
    'sections', jsonb_build_object(
        'trip_info', 'Informações da Viagem',
        'observacoes', 'Informações Importantes'
    )
);
$$ LANGUAGE sql STABLE;
