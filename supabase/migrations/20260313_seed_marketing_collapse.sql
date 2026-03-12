-- Seed: seção Marketing auto-recolhe nas fases planner, pós-venda e resolução
UPDATE sections
SET collapse_on_phases = ARRAY['planner', 'pos_venda', 'resolucao']
WHERE key = 'marketing';
