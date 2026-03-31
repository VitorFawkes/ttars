CREATE OR REPLACE VIEW view_agenda AS
SELECT 
    t.id,
    t.tipo AS entity_type, -- Use actual type instead of hardcoded 'tarefa'
    t.titulo,
    t.data_vencimento AS data,
    t.status,
    t.card_id,
    t.responsavel_id,
    t.created_at
FROM tarefas t
WHERE 
    t.deleted_at IS NULL 
    AND (t.concluida IS FALSE OR t.concluida IS NULL) 
    AND t.status IS DISTINCT FROM 'concluida' 
    AND t.status IS DISTINCT FROM 'cancelada';
