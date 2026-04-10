-- RPC para substituir steps de um template de forma atômica.
-- Limpa todas as FKs antes de deletar, depois insere os novos steps.
-- SECURITY DEFINER bypassa RLS para limpar cadence_queue corretamente.
CREATE OR REPLACE FUNCTION replace_cadence_steps(
    p_template_id UUID,
    p_steps JSONB  -- array de objetos step
)
RETURNS VOID AS $$
BEGIN
    -- 1) Nullificar FK em cadence_instances
    UPDATE cadence_instances
    SET current_step_id = NULL
    WHERE template_id = p_template_id;

    -- 2) Deletar TODOS items da queue referenciando steps deste template
    DELETE FROM cadence_queue
    WHERE step_id IN (
        SELECT id FROM cadence_steps WHERE template_id = p_template_id
    );

    -- 3) Deletar steps antigos
    DELETE FROM cadence_steps
    WHERE template_id = p_template_id;

    -- 4) Inserir novos steps do JSON
    INSERT INTO cadence_steps (
        template_id, step_order, step_key, step_type, block_index,
        day_offset, wait_config, requires_previous_completed,
        due_offset, task_config, next_step_key
    )
    SELECT
        p_template_id,
        (s->>'step_order')::INT,
        s->>'step_key',
        s->>'step_type',
        (s->>'block_index')::INT,
        (s->>'day_offset')::INT,
        CASE WHEN s->'wait_config' = 'null'::JSONB THEN NULL ELSE s->'wait_config' END,
        COALESCE((s->>'requires_previous_completed')::BOOL, false),
        s->'due_offset',
        s->'task_config',
        NULLIF(s->>'next_step_key', '')
    FROM jsonb_array_elements(p_steps) AS s;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
