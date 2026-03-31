-- =============================================================================
-- AI Extraction: Configuração dinâmica de campos
-- =============================================================================
-- Permite adicionar/remover campos extraíveis pela AI sem editar o workflow n8n.
-- O workflow lê esta tabela antes de executar e monta prompt/validação dinamicamente.
-- =============================================================================

-- 1. Tabela de configuração de campos
CREATE TABLE IF NOT EXISTS ai_extraction_field_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key TEXT NOT NULL UNIQUE,
    section TEXT NOT NULL CHECK (section IN ('trip_info', 'observacoes')),
    field_type TEXT NOT NULL CHECK (field_type IN (
        'text', 'number', 'boolean', 'select', 'multiselect', 'array', 'currency'
    )),
    label TEXT NOT NULL,
    prompt_question TEXT NOT NULL,
    prompt_format TEXT,
    prompt_examples TEXT,
    prompt_extract_when TEXT,
    allowed_values JSONB,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE ai_extraction_field_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON ai_extraction_field_config
    FOR ALL TO service_role USING (true);
CREATE POLICY "Authenticated read" ON ai_extraction_field_config
    FOR SELECT TO authenticated USING (true);

-- 2. Seed: 15 campos atuais

-- === SEÇÃO: trip_info (Informações da Viagem) ===
INSERT INTO ai_extraction_field_config (field_key, section, field_type, label, prompt_question, prompt_format, prompt_examples, prompt_extract_when, allowed_values, sort_order) VALUES
('destinos', 'trip_info', 'array', 'Destinos',
    'Para onde o cliente quer viajar?',
    'Array de strings, um destino por item',
    '["Itália"], ["Paris", "Londres"], ["Maldivas", "Dubai", "Tailândia"]',
    'Cliente menciona país, cidade ou região de destino',
    NULL, 1),

('epoca_viagem', 'trip_info', 'text', 'Época da Viagem',
    'Quando o cliente quer viajar?',
    'String descritiva do período',
    '"Janeiro 2026", "Férias de julho", "Dezembro, entre natal e ano novo", "Março ou abril de 2026"',
    'Cliente menciona mês, data ou período aproximado',
    NULL, 2),

('motivo', 'trip_info', 'text', 'Motivo da Viagem',
    'Qual o motivo da viagem?',
    'String descritiva',
    '"Lua de mel", "Aniversário de casamento", "Férias em família", "Viagem de formatura"',
    'Cliente menciona ocasião especial ou motivo',
    NULL, 3),

('duracao_viagem', 'trip_info', 'number', 'Duração (dias)',
    'Quantos dias de viagem?',
    'Número inteiro (apenas o número)',
    '10, 15, 21',
    'Cliente menciona duração em dias ou semanas (converter semanas para dias)',
    NULL, 4),

('orcamento', 'trip_info', 'currency', 'Orçamento',
    'Qual o investimento/orçamento para a viagem?',
    'Número (valor em reais, sem formatação)',
    '50000, 100000, 30000. Conversão: "50 mil" = 50000, "R$ 100.000" = 100000',
    'Cliente menciona valor, budget ou investimento',
    NULL, 5),

('quantidade_viajantes', 'trip_info', 'number', 'Quantidade de Viajantes',
    'Quantas pessoas vão viajar?',
    'Número inteiro',
    '2, 4, 6',
    'Cliente menciona "nós dois", "eu e minha esposa", "família de 4", "casal + 2 filhos"',
    NULL, 6),

('servico_contratado', 'trip_info', 'boolean', 'Serviço Já Contratado',
    'O cliente já tem algum serviço contratado para essa viagem?',
    'true ou false',
    'true, false',
    'Cliente menciona que já comprou passagem, reservou hotel, etc.',
    NULL, 7),

('qual_servio_contratado', 'trip_info', 'text', 'Qual Serviço Contratado',
    'Se sim, quais serviços já tem?',
    'String com os serviços',
    '"Voos", "Hospedagem", "Transfers"',
    'Cliente especifica o que já tem reservado',
    NULL, 8),

('momento_viagem', 'trip_info', 'text', 'Momento da Viagem',
    'Por que está fazendo essa viagem nesse momento?',
    'Texto livre explicativo',
    '"Comemorando 10 anos de casamento", "Presente de formatura", "Realizando um sonho antigo"',
    'Cliente explica o contexto/motivação temporal',
    NULL, 9),

-- === SEÇÃO: observacoes (Informações Importantes) ===
('prioridade_viagem', 'observacoes', 'multiselect', 'Prioridades',
    'Quais são as prioridades nessa viagem?',
    'Array de strings com os valores exatos permitidos',
    '["priorizar_experiências_em_vez_de_hotel"], ["viagem_alto_padrão", "melhor_custo_x_benefício"]',
    'Cliente menciona que quer hotel luxuoso, experiências únicas, melhor custo-benefício, etc. Mapeamento: "quero experiências incríveis" → priorizar_experiências_em_vez_de_hotel, "hotel 5 estrelas é essencial" → priorizar_hotel_em_vez_de_experiencias, "pode ser o melhor de tudo" → viagem_alto_padrão, "orçamento é importante" → melhor_custo_x_benefício',
    '["priorizar_experiências_em_vez_de_hotel", "priorizar_hotel_em_vez_de_experiencias", "viagem_alto_padrão", "melhor_custo_x_benefício"]',
    10),

('o_que_e_importante', 'observacoes', 'text', 'O Que É Importante',
    'O que é muito importante para a viagem ser perfeita?',
    'Texto livre',
    '"Boa gastronomia", "Passeios culturais", "Relaxamento", "Aventura e adrenalina"',
    'Cliente menciona prioridades, desejos ou expectativas específicas',
    NULL, 11),

('algo_especial_viagem', 'observacoes', 'text', 'Algo Especial',
    'Essa viagem tem algo de especial?',
    'Texto livre',
    '"Pedido de casamento", "Renovação de votos", "Primeira viagem internacional do filho"',
    'Cliente menciona evento especial ou surpresa planejada',
    NULL, 12),

('receio_ou_medo', 'observacoes', 'text', 'Receios ou Medos',
    'Tem algum receio sobre essa viagem?',
    'Texto livre',
    '"Medo de avião", "Preocupação com segurança", "Filho pequeno", "Alergia alimentar"',
    'Cliente menciona preocupações, medos ou limitações',
    NULL, 13),

('frequencia_viagem', 'observacoes', 'select', 'Frequência de Viagem',
    'Com que frequência o cliente costuma viajar internacionalmente?',
    'String com valor exato dos permitidos',
    '"1x_ao_ano", "2x_a_3x_ao_ano", "mais_de_3x_ao_ano"',
    'Cliente menciona frequência de viagens',
    '["1x_ao_ano", "2x_a_3x_ao_ano", "mais_de_3x_ao_ano"]',
    14),

('usa_agencia', 'observacoes', 'select', 'Usa Agência',
    'O cliente costuma viajar por agência?',
    'String com valor exato dos permitidos',
    '"sim", "não"',
    'Cliente menciona experiência anterior com agências',
    '["sim", "não"]',
    15)
ON CONFLICT (field_key) DO NOTHING;

-- 3. RPC: retorna config completa para o n8n
CREATE OR REPLACE FUNCTION get_ai_extraction_config()
RETURNS JSONB AS $$
SELECT jsonb_build_object(
    'fields', (
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', field_key,
                'section', section,
                'type', field_type,
                'label', label,
                'question', prompt_question,
                'format', prompt_format,
                'examples', prompt_examples,
                'extract_when', prompt_extract_when,
                'allowed_values', allowed_values
            ) ORDER BY sort_order
        )
        FROM ai_extraction_field_config
        WHERE is_active = true
    ),
    'sections', jsonb_build_object(
        'trip_info', 'Informações da Viagem',
        'observacoes', 'Informações Importantes'
    )
);
$$ LANGUAGE sql STABLE;

-- Verificação:
--   SELECT get_ai_extraction_config();
--   SELECT * FROM ai_extraction_field_config ORDER BY sort_order;
