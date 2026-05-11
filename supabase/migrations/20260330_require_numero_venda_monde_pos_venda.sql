-- Garantir que numero_venda_monde existe em system_fields
INSERT INTO system_fields (key, label, type, section, active, is_system)
VALUES ('numero_venda_monde', 'N° Venda Monde', 'text', 'trip_info', true, false)
ON CONFLICT (key) DO NOTHING;

-- Tornar numero_venda_monde obrigatório em TODAS as etapas de Pós-Venda do TRIPS
-- Isso faz o Quality Gate bloquear:
--   1. Drag-and-drop para qualquer etapa de Pós-Venda
--   2. Ganho Planner (valida contra 1ª etapa de Pós-Venda)
INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, is_blocking, requirement_type, "order")
SELECT s.id, 'numero_venda_monde', true, true, true, 'field', 99
FROM pipeline_stages s
WHERE s.pipeline_id = 'c8022522-4a1d-411c-9387-efe03ca725ee'  -- Pipeline Welcome Trips
  AND s.phase_id = '95e78a06-92af-447c-9f71-60b2c23f1420'     -- Fase Pós-venda
ON CONFLICT (stage_id, field_key) DO UPDATE SET
    is_required = true,
    is_visible = true,
    is_blocking = true;
