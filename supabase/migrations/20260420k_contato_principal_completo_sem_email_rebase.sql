-- ============================================================================
-- MIGRATION: Rebase validate_stage_requirements — restaura regra de 13/04
-- Date: 2026-04-20
--
-- CONTEXTO
-- Em 13/04 a regra contato_principal_completo foi alterada para exigir
-- nome+sobrenome+telefone+cpf (email NÃO obrigatório). Ver:
--   20260413_contato_principal_completo_telefone_sem_email.sql
--
-- Em 17/04 a migration 20260417_team_member_requirement.sql recriou a função
-- validate_stage_requirements para adicionar requirement_type='team_member',
-- mas usou como base a versão ANTIGA (06/04) que exigia email+cpf — sem
-- incluir a correção de 13/04. Resultado: email voltou a ser obrigatório,
-- bloqueando cards reais em produção (relato Mariana/T.Planner 20/04).
--
-- CORREÇÃO
-- Recria a função preservando 100% do suporte a team_member (17/04) e
-- rebasando a regra contato_principal_completo para exigir apenas
-- nome+sobrenome+telefone+cpf (email liberado, 13/04).
-- Frontend já estava correto (useQualityGate.ts e useStageRequirements.ts
-- usam nome+sobrenome+telefone+cpf desde 13/04).
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
    v_has_member BOOLEAN;
    v_owner_id UUID;
BEGIN
    SELECT
        c.id,
        c.produto_data,
        c.briefing_inicial,
        c.pessoa_principal_id,
        c.motivo_perda_id,
        c.motivo_perda_comentario,
        c.sdr_owner_id,
        c.vendas_owner_id,
        c.pos_owner_id,
        c.concierge_owner_id
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
            task_require_completed,
            required_team_role
        FROM stage_field_config
        WHERE stage_id = p_target_stage_id
          AND is_required = true
          AND COALESCE(is_blocking, true) = true
          AND requirement_type IN ('field', 'rule', 'team_member')
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

            ELSIF v_rule.field_key = 'contato_principal_basico' THEN
                -- Exige: nome + sobrenome
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                ELSE
                    SELECT nome, sobrenome
                    INTO v_contato
                    FROM contatos
                    WHERE id = v_card.pessoa_principal_id;

                    IF NOT FOUND
                       OR v_contato.nome IS NULL OR v_contato.nome = ''
                       OR v_contato.sobrenome IS NULL OR v_contato.sobrenome = '' THEN
                        v_missing := array_append(v_missing, v_label);
                    END IF;
                END IF;

            ELSIF v_rule.field_key = 'contato_principal_completo' THEN
                -- Exige: nome + sobrenome + telefone + cpf (email NÃO obrigatório)
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                ELSE
                    SELECT nome, sobrenome, telefone, cpf
                    INTO v_contato
                    FROM contatos
                    WHERE id = v_card.pessoa_principal_id;

                    IF NOT FOUND
                       OR v_contato.nome IS NULL OR v_contato.nome = ''
                       OR v_contato.sobrenome IS NULL OR v_contato.sobrenome = ''
                       OR v_contato.telefone IS NULL OR v_contato.telefone = ''
                       OR v_contato.cpf IS NULL OR v_contato.cpf = '' THEN
                        v_missing := array_append(v_missing, v_label);
                    END IF;
                END IF;
            END IF;

        ELSIF v_rule.requirement_type = 'team_member' AND v_rule.required_team_role IS NOT NULL THEN
            v_owner_id := NULL;

            IF v_rule.required_team_role = 'sdr' THEN
                v_owner_id := v_card.sdr_owner_id;
            ELSIF v_rule.required_team_role = 'planner' THEN
                v_owner_id := v_card.vendas_owner_id;
            ELSIF v_rule.required_team_role = 'pos_venda' THEN
                v_owner_id := v_card.pos_owner_id;
            ELSIF v_rule.required_team_role = 'concierge' THEN
                v_owner_id := v_card.concierge_owner_id;
            END IF;

            IF v_owner_id IS NULL THEN
                SELECT EXISTS (
                    SELECT 1 FROM card_team_members ctm
                    WHERE ctm.card_id = p_card_id
                      AND ctm.role = v_rule.required_team_role
                ) INTO v_has_member;

                IF NOT v_has_member THEN
                    v_missing := array_append(v_missing, v_label);
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

COMMENT ON FUNCTION public.validate_stage_requirements(uuid, uuid) IS
'Valida se um card tem os campos/regras obrigatórios para entrar num stage. '
'Espelha a lógica de useQualityGate.ts (frontend). Regra contato_principal_completo '
'exige nome+sobrenome+telefone+cpf (email NÃO obrigatório desde 13/04/2026).';
