-- Renomear seção "Financeiro" para "Produtos" e trocar ícone
UPDATE sections
SET label = 'Produtos',
    icon = 'package',
    updated_at = NOW()
WHERE key = 'financeiro';
