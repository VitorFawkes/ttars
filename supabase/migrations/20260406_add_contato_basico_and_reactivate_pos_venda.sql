-- ============================================================================
-- MIGRATION: Adiciona regra contato_principal_basico + reativa
--            contato_principal_completo na 1ª etapa de pós-venda
-- Date: 2026-04-06
--
-- CONTEXTO
-- Decisão de produto: queremos 3 regras distintas configuráveis no Studio:
--   1. contato_principal_required → só verifica se TEM contato vinculado
--   2. contato_principal_basico   → verifica nome + sobrenome do contato (NOVA)
--   3. contato_principal_completo → verifica nome + sobrenome + cpf + email
--
-- Migrations anteriores haviam suavizado a regra contato_principal_completo
-- (is_blocking=false em todos os stages) por causa de 330 cards legados
-- inválidos. A regra deve ficar ATIVA na 1ª etapa de pós-venda
-- ("App & Conteúdo em Montagem" — b2b0679c) porque é exatamente nessa
-- transição que o time precisa garantir os dados completos do contato.
--
-- AÇÕES
-- 1. Atualiza validate_stage_requirements para reconhecer contato_principal_basico
-- 2. Reativa is_blocking=true em contato_principal_completo SÓ em b2b0679c
-- ============================================================================

-- ─── 1. validate_stage_requirements com a nova regra ───────────────────────

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
                -- Exige: nome + sobrenome + cpf + email (telefone NÃO obrigatório)
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
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', array_length(v_missing, 1) IS NULL,
        'missing', to_jsonb(v_missing)
    );
END;
$fn$;

-- ─── 2. Reativa contato_principal_completo na 1ª etapa de pós-venda ────────
-- Stage b2b0679c-ea06-4b46-9dd4-ee02abff1a36 = "App & Conteúdo em Montagem"
-- Pipeline c8022522-4a1d-411c-9387-efe03ca725ee = Welcome Trips
-- Phase 95e78a06-92af-447c-9f71-60b2c23f1420 = Pós-venda

UPDATE public.stage_field_config
SET is_blocking = true,
    is_required = true,
    requirement_type = 'rule',
    requirement_label = COALESCE(requirement_label, 'Dados Completos do Contato Principal'),
    updated_at = NOW()
WHERE stage_id = 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36'
  AND field_key = 'contato_principal_completo';

-- Se não existia ainda nessa stage, criar
INSERT INTO public.stage_field_config (stage_id, field_key, is_required, is_blocking, requirement_type, requirement_label, is_visible)
SELECT
    'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
    'contato_principal_completo',
    true,
    true,
    'rule',
    'Dados Completos do Contato Principal',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.stage_field_config
    WHERE stage_id = 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36'
      AND field_key = 'contato_principal_completo'
);
