-- data_reuniao deve aparecer SÓ na fase SDR (pré-venda). Estava vazando pra
-- T. Planner e outras fases porque a seção trip_info é compartilhada.
-- Esconde o campo em toda etapa cuja fase NÃO seja sdr/pre_venda, via
-- stage_field_config.is_visible = false.

-- 1) Insere is_visible=false nas etapas não-SDR que ainda não têm config
INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, is_blocking, org_id)
SELECT s.id, 'data_reuniao', false, false, false, p.org_id
FROM pipeline_stages s
JOIN pipelines p ON p.id = s.pipeline_id
JOIN pipeline_phases ph ON ph.id = s.phase_id
WHERE p.produto::text IN ('TRIPS', 'WEDDING')
  AND ph.slug NOT IN ('sdr', 'pre_venda')
  AND NOT EXISTS (
    SELECT 1 FROM stage_field_config sfc
    WHERE sfc.stage_id = s.id AND sfc.field_key = 'data_reuniao'
  );

-- 2) Garante is_visible=false caso já exista alguma config visível
UPDATE stage_field_config sfc
SET is_visible = false, updated_at = NOW()
FROM pipeline_stages s
JOIN pipelines p ON p.id = s.pipeline_id
JOIN pipeline_phases ph ON ph.id = s.phase_id
WHERE sfc.stage_id = s.id
  AND sfc.field_key = 'data_reuniao'
  AND p.produto::text IN ('TRIPS', 'WEDDING')
  AND ph.slug NOT IN ('sdr', 'pre_venda')
  AND sfc.is_visible IS DISTINCT FROM false;
