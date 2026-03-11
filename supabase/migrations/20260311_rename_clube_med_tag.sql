-- Renomear tag "Clube Med 2026" → "Club Med 2026"
UPDATE card_tags SET name = 'Club Med 2026' WHERE name = 'Clube Med 2026';

-- Renomear títulos dos cards (ex: "João / Clube Med" → "João / Club Med")
UPDATE cards SET titulo = REPLACE(titulo, 'Clube Med', 'Club Med') WHERE titulo LIKE '%Clube Med%';
