-- Remover is_required de todos os campos de Pós-Venda EXCETO numero_venda_monde
-- Os 6 campos de briefing (usa_agencia, algo_especial, o_que_e_importante, etc.)
-- estavam blocking mas não devem bloquear a passagem para Pós-Venda.
UPDATE stage_field_config
SET is_required = false, is_blocking = false
WHERE stage_id IN (
    SELECT s.id
    FROM pipeline_stages s
    WHERE s.pipeline_id = 'c8022522-4a1d-411c-9387-efe03ca725ee'
      AND s.phase_id = '95e78a06-92af-447c-9f71-60b2c23f1420'
)
AND field_key != 'numero_venda_monde'
AND is_required = true;
