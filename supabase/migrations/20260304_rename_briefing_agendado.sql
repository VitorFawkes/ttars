-- Rename stage "Briefing Agendado" → "Oportunidade"
-- Apenas o nome muda. O id, milestone_key, ordem, phase_id e todo comportamento permanecem iguais.
-- A RPC analytics_overview_kpis usa milestone_key = 'briefing' (não o nome), portanto não é afetada.

UPDATE pipeline_stages
SET nome = 'Oportunidade'
WHERE nome = 'Briefing Agendado'
  AND pipeline_id = 'c8022522-4a1d-411c-9387-efe03ca725ee';
