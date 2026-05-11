-- ============================================================================
-- MIGRATION: Regra contato_principal_completo sem telefone
-- Date: 2026-04-06
--
-- CONTEXTO
-- A regra contato_principal_completo originalmente exigia 5 campos:
-- nome, sobrenome, telefone, email, cpf. Por decisão de produto, telefone
-- não deve ser obrigatório. Os 4 campos exigidos passam a ser:
-- nome, sobrenome, cpf, email.
--
-- Atualiza só o validate_stage_requirements (frontend já foi atualizado
-- nos hooks useQualityGate.ts e useStageRequirements.ts).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_stage_requirements(
    p_card_id uuid,
    p_target_stage_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_rule RECORD;
    v_value TEXT;
    v_missing TEXT[] := ARRAY[]::TEXT[];
    v_label TEXT;
    v_contato RECORD;
BEGIN
    SELECT
        c.id,
        c.produto_data,
        c.briefing_inicial,
        c.pessoa_principal_id,
        c.motivo_perda_id,
        c.motivo_perda_comentario
    INTO v_card
    FROM cards c
    WHERE c.id = p_card_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', true, 'missing', '[]'::jsonb);
    END IF;

    FOR v_rule IN
        SELECT
            field_key,
            requirement_type,
            requirement_label,
            proposal_min_status,
            task_tipo,
            task_require_completed
        FROM stage_field_config
        WHERE stage_id = p_target_stage_id
          AND is_required = true
          AND COALESCE(is_blocking, true) = true
          AND requirement_type IN ('field', 'rule')
    LOOP
        v_label := COALESCE(v_rule.requirement_label, v_rule.field_key, 'Requisito');

        IF v_rule.requirement_type = 'field' AND v_rule.field_key IS NOT NULL THEN
            v_value := COALESCE(
                v_card.produto_data ->> v_rule.field_key,
                v_card.briefing_inicial ->> v_rule.field_key
            );

            IF v_value IS NOT NULL THEN
                IF v_value = '' OR v_value = '{}' OR v_value = '[]' OR v_value = 'null' THEN
                    v_value := NULL;
                END IF;
            END IF;

            IF v_value IS NULL THEN
                v_missing := array_append(v_missing, v_label);
            END IF;

        ELSIF v_rule.requirement_type = 'rule' AND v_rule.field_key IS NOT NULL THEN
            IF v_rule.field_key = 'lost_reason_required' THEN
                IF v_card.motivo_perda_id IS NULL
                   AND (v_card.motivo_perda_comentario IS NULL
                        OR btrim(v_card.motivo_perda_comentario) = '') THEN
                    v_missing := array_append(v_missing, v_label);
                END IF;

            ELSIF v_rule.field_key = 'contato_principal_required' THEN
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                END IF;

            ELSIF v_rule.field_key = 'contato_principal_completo' THEN
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                ELSE
                    -- Exige: nome, sobrenome, cpf, email (telefone NÃO é obrigatório)
                    SELECT nome, sobrenome, email, cpf
                    INTO v_contato
                    FROM contatos
                    WHERE id = v_card.pessoa_principal_id;

                    IF NOT FOUND
                       OR v_contato.nome IS NULL OR v_contato.nome = ''
                       OR v_contato.sobrenome IS NULL OR v_contato.sobrenome = ''
                       OR v_contato.email IS NULL OR v_contato.email = ''
                       OR v_contato.cpf IS NULL OR v_contato.cpf = '' THEN
                        v_missing := array_append(v_missing, v_label);
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', array_length(v_missing, 1) IS NULL,
        'missing', to_jsonb(v_missing)
    );
END;
$fn$;
