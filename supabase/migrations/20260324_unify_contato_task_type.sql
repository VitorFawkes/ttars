-- Unificar tipos de tarefa: ligacao + whatsapp -> contato
-- Motivo: "contato" engloba ligacao e whatsapp, evitando confusao na UI

-- 1. Adicionar outcomes de contato (combinando ligacao + whatsapp)
-- Só executa se a tabela existir
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'task_type_outcomes') THEN
        INSERT INTO task_type_outcomes (tipo, outcome_key, outcome_label, ordem, is_success) VALUES
            ('contato', 'atendeu', 'Atendeu', 1, true),
            ('contato', 'nao_atendeu', 'Nao Atendeu', 2, false),
            ('contato', 'caixa_postal', 'Caixa Postal', 3, false),
            ('contato', 'numero_invalido', 'Numero Invalido', 4, false),
            ('contato', 'respondido', 'Respondido', 5, true),
            ('contato', 'visualizado', 'Visualizado', 6, true),
            ('contato', 'enviado', 'Enviado', 7, true)
        ON CONFLICT (tipo, outcome_key) DO NOTHING;
    END IF;
END $$;

-- 2. Converter tarefas existentes de ligacao/whatsapp para contato
UPDATE tarefas SET tipo = 'contato' WHERE tipo IN ('ligacao', 'whatsapp');
