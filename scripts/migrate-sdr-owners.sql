-- Migração: Popular sdr_owner_id para cards na fase SDR
-- Executar no Supabase Dashboard > SQL Editor

-- 1. Verificar quantos cards serão afetados
SELECT COUNT(*) as cards_para_migrar
FROM cards c
JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
JOIN pipeline_phases pp ON ps.phase_id = pp.id
WHERE pp.slug = 'sdr'
  AND c.dono_atual_id IS NOT NULL
  AND c.sdr_owner_id IS NULL
  AND c.status_comercial = 'aberto';

-- 2. Executar a migração
UPDATE cards
SET sdr_owner_id = dono_atual_id
WHERE id IN (
  SELECT c.id
  FROM cards c
  JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
  JOIN pipeline_phases pp ON ps.phase_id = pp.id
  WHERE pp.slug = 'sdr'
    AND c.dono_atual_id IS NOT NULL
    AND c.sdr_owner_id IS NULL
    AND c.status_comercial = 'aberto'
);

-- 3. Verificar resultado
SELECT c.id, c.titulo, c.sdr_owner_id, p.nome as sdr_nome
FROM cards c
JOIN profiles p ON c.sdr_owner_id = p.id
JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
JOIN pipeline_phases pp ON ps.phase_id = pp.id
WHERE pp.slug = 'sdr'
  AND c.status_comercial = 'aberto'
LIMIT 10;
