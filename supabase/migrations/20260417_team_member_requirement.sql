-- ============================================================================
-- MIGRATION: Requisito "pessoa de time X" no quality gate de etapas
-- Date: 2026-04-17
--
-- MOTIVAÇÃO
-- Usuário precisa exigir que alguém do time Pós-Venda esteja atribuído à
-- seção Pós-Venda do card antes de mover para etapas como "App & Conteúdo".
-- Além disso, religa o template "Pós-venda: App & Conteúdo" que ficou
-- órfão (is_active=false) enquanto o trigger que o chama está ativo, para
-- que as 38 automações/semana parem de ser ignoradas silenciosamente.
--
-- MUDANÇAS
-- 1. Nova coluna stage_field_config.required_team_role (TEXT nullable)
--    Aceita: 'sdr' | 'planner' | 'pos_venda' | 'concierge'
-- 2. Função validate_stage_requirements estende para requirement_type='team_member'
-- 3. Religa template 'Pós-venda: App & Conteúdo' (e14f4a48-0531-41e9-a6e2-8c17dc9539a6)
-- ============================================================================

-- 1. Nova coluna ---------------------------------------------------------------
ALTER TABLE public.stage_field_config
  ADD COLUMN IF NOT EXISTS required_team_role TEXT;

COMMENT ON COLUMN public.stage_field_config.required_team_role IS
  'Para requirement_type=team_member: role (sdr/planner/pos_venda/concierge) que precisa ter alguém atribuído ao card antes de permitir mudar de etapa.';

-- 2. Religar template órfão (só em ambientes que têm cadence_templates) -------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'cadence_templates'
  ) THEN
    EXECUTE $sql$
      UPDATE public.cadence_templates
         SET is_active = true,
             updated_at = NOW()
       WHERE id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6'
         AND is_active = false
    $sql$;
  END IF;
END $$;

-- 3. Estender validate_stage_requirements para team_member ---------------------
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
    v_owner_col TEXT;
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

            ELSIF v_rule.field_key = 'contato_principal_completo' THEN
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                ELSE
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
