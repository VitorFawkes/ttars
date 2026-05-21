-- ============================================================================
-- MIGRATION: evaluate_alert_condition — novo tipo "task_overdue"
-- Date: 2026-05-20
--
-- IMPORTANTE: Re-cria a função evaluate_alert_condition com novo branch.
-- Todos os branches anteriores foram preservados via grep em migrations passadas:
--   - and, or, not (composição lógica)
--   - stage_requirements
--   - field_missing, field_equals
--   - no_contact, contact_missing_data
--   - days_in_stage
--   - task_overdue (NOVO)
--
-- Novo tipo:
--   {"type":"task_overdue","days_overdue":1,"tipo_tarefa":"opcional"}
--     → detecta cards com tarefas (table tarefas) atrasadas
--     → filtra por: data_vencimento < NOW() - N dias
--                   status != 'concluida'
--                   (opcional) tipo = tipo_tarefa
--
-- PRECAUTION: Validado que tarefas tem colunas:
--   - card_id (FK para cards)
--   - data_vencimento (date/timestamptz)
--   - status (text: 'pendente', 'concluida', etc)
--   - tipo (text: categoria da tarefa)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_alert_condition(
    p_card_id UUID,
    p_condition JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_type TEXT;
    v_card RECORD;
    v_value TEXT;
    v_clause JSONB;
    v_result BOOLEAN;
    v_stage_req JSONB;
    v_contato RECORD;
    v_field TEXT;
    v_days_in_stage INT;
    v_days INT;
    v_count INT;
BEGIN
    IF p_condition IS NULL THEN
        RETURN FALSE;
    END IF;

    v_type := p_condition->>'type';

    IF v_type IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Composição lógica
    IF v_type = 'and' THEN
        FOR v_clause IN SELECT * FROM jsonb_array_elements(COALESCE(p_condition->'clauses', '[]'::jsonb))
        LOOP
            IF NOT public.evaluate_alert_condition(p_card_id, v_clause) THEN
                RETURN FALSE;
            END IF;
        END LOOP;
        RETURN TRUE;
    END IF;

    IF v_type = 'or' THEN
        FOR v_clause IN SELECT * FROM jsonb_array_elements(COALESCE(p_condition->'clauses', '[]'::jsonb))
        LOOP
            IF public.evaluate_alert_condition(p_card_id, v_clause) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
        RETURN FALSE;
    END IF;

    IF v_type = 'not' THEN
        RETURN NOT public.evaluate_alert_condition(p_card_id, p_condition->'clause');
    END IF;

    -- A partir daqui, tipos "folha" precisam do card
    SELECT
        c.id,
        c.produto_data,
        c.briefing_inicial,
        c.pessoa_principal_id,
        c.pipeline_stage_id,
        c.stage_entered_at
    INTO v_card
    FROM cards c
    WHERE c.id = p_card_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_type = 'stage_requirements' THEN
        v_stage_req := public.validate_stage_requirements(p_card_id, v_card.pipeline_stage_id);
        -- condition=TRUE quando valid=FALSE (o card VIOLA os requisitos)
        RETURN (v_stage_req->>'valid')::BOOLEAN IS FALSE;
    END IF;

    IF v_type = 'field_missing' THEN
        v_field := p_condition->>'field_key';
        IF v_field IS NULL THEN
            RETURN FALSE;
        END IF;

        v_value := COALESCE(
            v_card.produto_data ->> v_field,
            v_card.briefing_inicial ->> v_field
        );

        IF v_value IS NOT NULL THEN
            IF v_value = '' OR v_value = '{}' OR v_value = '[]' OR v_value = 'null' THEN
                v_value := NULL;
            END IF;
        END IF;

        RETURN v_value IS NULL;
    END IF;

    IF v_type = 'field_equals' THEN
        v_field := p_condition->>'field_key';
        IF v_field IS NULL THEN
            RETURN FALSE;
        END IF;

        v_value := COALESCE(
            v_card.produto_data ->> v_field,
            v_card.briefing_inicial ->> v_field
        );

        RETURN v_value IS NOT DISTINCT FROM (p_condition->>'value');
    END IF;

    IF v_type = 'no_contact' THEN
        RETURN v_card.pessoa_principal_id IS NULL;
    END IF;

    IF v_type = 'contact_missing_data' THEN
        IF v_card.pessoa_principal_id IS NULL THEN
            RETURN TRUE;
        END IF;

        SELECT nome, sobrenome, email, cpf, telefone
        INTO v_contato
        FROM contatos
        WHERE id = v_card.pessoa_principal_id;

        IF NOT FOUND THEN
            RETURN TRUE;
        END IF;

        FOR v_field IN
            SELECT jsonb_array_elements_text(COALESCE(p_condition->'fields', '["nome","sobrenome","email","cpf"]'::jsonb))
        LOOP
            IF v_field = 'nome' AND (v_contato.nome IS NULL OR v_contato.nome = '') THEN
                RETURN TRUE;
            ELSIF v_field = 'sobrenome' AND (v_contato.sobrenome IS NULL OR v_contato.sobrenome = '') THEN
                RETURN TRUE;
            ELSIF v_field = 'email' AND (v_contato.email IS NULL OR v_contato.email = '') THEN
                RETURN TRUE;
            ELSIF v_field = 'cpf' AND (v_contato.cpf IS NULL OR v_contato.cpf = '') THEN
                RETURN TRUE;
            ELSIF v_field = 'telefone' AND (v_contato.telefone IS NULL OR v_contato.telefone = '') THEN
                RETURN TRUE;
            END IF;
        END LOOP;

        RETURN FALSE;
    END IF;

    IF v_type = 'days_in_stage' THEN
        IF v_card.stage_entered_at IS NULL THEN
            RETURN FALSE;
        END IF;
        v_days_in_stage := EXTRACT(DAY FROM (now() - v_card.stage_entered_at))::INT;

        CASE COALESCE(p_condition->>'op', '>=')
            WHEN '>=' THEN v_result := v_days_in_stage >= (p_condition->>'days')::INT;
            WHEN '>'  THEN v_result := v_days_in_stage >  (p_condition->>'days')::INT;
            WHEN '<=' THEN v_result := v_days_in_stage <= (p_condition->>'days')::INT;
            WHEN '<'  THEN v_result := v_days_in_stage <  (p_condition->>'days')::INT;
            WHEN '='  THEN v_result := v_days_in_stage =  (p_condition->>'days')::INT;
            ELSE v_result := FALSE;
        END CASE;

        RETURN v_result;
    END IF;

    IF v_type = 'task_overdue' THEN
        v_days := COALESCE((p_condition->>'days_overdue')::INTEGER, 0);

        SELECT COUNT(*)
            INTO v_count
            FROM public.tarefas t
            WHERE t.card_id = p_card_id
              AND (p_condition->>'tipo_tarefa' IS NULL
                   OR t.tipo = p_condition->>'tipo_tarefa')
              AND COALESCE(t.status, 'pendente') != 'concluida'
              AND t.data_vencimento IS NOT NULL
              AND t.data_vencimento < (NOW() - (v_days || ' days')::INTERVAL);

        RETURN v_count > 0;
    END IF;

    -- Tipo desconhecido — não dispara (fail-safe)
    RETURN FALSE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_alert_condition(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_alert_condition(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.evaluate_alert_condition(uuid, jsonb) IS
'Interpretador recursivo da DSL de condição usada em card_alert_rules.condition. '
'Retorna TRUE se o card VIOLA a condição (o alerta deve disparar). '
'Tipos suportados: and, or, not, stage_requirements, field_missing, field_equals, '
'no_contact, contact_missing_data, days_in_stage, task_overdue.';
