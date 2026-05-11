-- Renomear seção "Financeiro" para "Produto - Vendas" e trocar ícone
UPDATE sections
SET label = 'Produto - Vendas',
    icon = 'package',
    updated_at = NOW()
WHERE key = 'financeiro';
