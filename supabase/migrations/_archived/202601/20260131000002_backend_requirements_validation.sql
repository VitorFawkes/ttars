-- ============================================================================
-- BACKEND REQUIREMENTS VALIDATION
-- ============================================================================
-- Este script adiciona validação de requisitos diretamente no backend,
-- evitando bypass da validação quando cards são movidos via API/triggers.
--
-- Problema anterior:
-- - Frontend (useQualityGate) validava
-- - Backend (mover_card) NÃO validava
-- - Integrações/triggers podiam mover cards sem validar
--
-- Solução:
-- - Função validate_stage_requirements() centralizada
-- - mover_card() chama validação antes de mover
-- - Triggers automáticos podem usar force=true quando apropriado
-- ============================================================================

-- ============================================================================
-- FUNÇÃO: validate_stage_requirements
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_stage_requirements(
    p_card_id UUID,
    p_target_stage_id UUID
)
RETURNS TABLE (
    valid BOOLEAN,
    missing_requirements JSONB
) AS $$
DECLARE
    v_card RECORD;
    v_missing JSONB := '[]'::JSONB;
    v_rule RECORD;
    v_value TEXT;
    v_produto_data JSONB;
    v_briefing_data JSONB;
    v_is_valid BOOLEAN;
    v_proposals RECORD;
    v_tasks RECORD;
BEGIN
    -- Buscar card
    SELECT * INTO v_card FROM cards WHERE id = p_card_id;

    IF v_card IS NULL THEN
        RETURN QUERY SELECT false, jsonb_build_array(
            jsonb_build_object('type', 'error', 'message', 'Card não encontrado')
        );
        RETURN;
    END IF;

    -- Parsear JSONs do card
    v_produto_data := CASE
        WHEN v_card.produto_data IS NULL THEN '{}'::JSONB
        WHEN jsonb_typeof(v_card.produto_data::JSONB) = 'object' THEN v_card.produto_data::JSONB
        ELSE '{}'::JSONB
    END;

    v_briefing_data := CASE
        WHEN v_card.briefing_inicial IS NULL THEN '{}'::JSONB
        WHEN jsonb_typeof(v_card.briefing_inicial::JSONB) = 'object' THEN v_card.briefing_inicial::JSONB
        ELSE '{}'::JSONB
    END;

    -- Iterar sobre requisitos do stage
    FOR v_rule IN
        SELECT
            sfc.*,
            sf.label as field_label
        FROM stage_field_config sfc
        LEFT JOIN system_fields sf ON sf.key = sfc.field_key
        WHERE sfc.stage_id = p_target_stage_id
          AND sfc.is_required = true
          AND sfc.is_blocking = true
    LOOP
        v_is_valid := true;

        -- Validar baseado no tipo de requisito
        CASE COALESCE(v_rule.requirement_type, 'field')

            WHEN 'field' THEN
                -- Buscar valor do campo (waterfall: card → produto_data → briefing_inicial)
                IF v_rule.field_key IS NOT NULL THEN
                    -- Tentar no card
                    EXECUTE format('SELECT ($1).%I::TEXT', v_rule.field_key)
                    INTO v_value USING v_card;

                    -- Se vazio, tentar em produto_data
                    IF v_value IS NULL OR v_value = '' THEN
                        v_value := v_produto_data->>v_rule.field_key;

                        -- Se é objeto com 'total', usar total
                        IF v_value IS NULL AND jsonb_typeof(v_produto_data->v_rule.field_key) = 'object' THEN
                            v_value := v_produto_data->v_rule.field_key->>'total';
                        END IF;
                    END IF;

                    -- Se ainda vazio, tentar em briefing_inicial
                    IF v_value IS NULL OR v_value = '' THEN
                        v_value := v_briefing_data->>v_rule.field_key;

                        IF v_value IS NULL AND jsonb_typeof(v_briefing_data->v_rule.field_key) = 'object' THEN
                            v_value := v_briefing_data->v_rule.field_key->>'total';
                        END IF;
                    END IF;

                    -- Validar
                    IF v_value IS NULL OR v_value = '' OR v_value = '[]' OR v_value = '{}' THEN
                        v_is_valid := false;
                    END IF;
                END IF;

            WHEN 'proposal' THEN
                -- Verificar se existe proposta com status mínimo
                IF v_rule.proposal_min_status IS NOT NULL THEN
                    SELECT EXISTS (
                        SELECT 1 FROM proposals p
                        WHERE p.card_id = p_card_id
                          AND CASE v_rule.proposal_min_status
                              WHEN 'draft' THEN p.status IN ('draft', 'sent', 'viewed', 'in_progress', 'accepted')
                              WHEN 'sent' THEN p.status IN ('sent', 'viewed', 'in_progress', 'accepted')
                              WHEN 'viewed' THEN p.status IN ('viewed', 'in_progress', 'accepted')
                              WHEN 'in_progress' THEN p.status IN ('in_progress', 'accepted')
                              WHEN 'accepted' THEN p.status = 'accepted'
                              ELSE false
                          END
                    ) INTO v_is_valid;
                END IF;

            WHEN 'task' THEN
                -- Verificar se existe tarefa do tipo especificado
                IF v_rule.task_tipo IS NOT NULL THEN
                    SELECT EXISTS (
                        SELECT 1 FROM tarefas t
                        WHERE t.card_id = p_card_id
                          AND t.tipo = v_rule.task_tipo
                          AND t.deleted_at IS NULL
                          AND (
                              -- Se requer conclusão, verificar se está concluída
                              (v_rule.task_require_completed = true AND t.concluida = true)
                              OR
                              -- Se não requer conclusão, apenas existir
                              (COALESCE(v_rule.task_require_completed, false) = false)
                          )
                    ) INTO v_is_valid;
                END IF;

            WHEN 'rule' THEN
                -- Regras especiais
                IF v_rule.field_key = 'lost_reason_required' THEN
                    -- Verificar se tem motivo de perda
                    v_is_valid := v_card.motivo_perda_id IS NOT NULL
                        OR (v_card.motivo_perda_comentario IS NOT NULL AND v_card.motivo_perda_comentario <> '');
                END IF;

            ELSE
                v_is_valid := true;
        END CASE;

        -- Se inválido, adicionar à lista de faltantes
        IF NOT v_is_valid THEN
            v_missing := v_missing || jsonb_build_array(jsonb_build_object(
                'type', COALESCE(v_rule.requirement_type, 'field'),
                'key', v_rule.field_key,
                'label', COALESCE(v_rule.requirement_label, v_rule.field_label, v_rule.field_key),
                'task_tipo', v_rule.task_tipo,
                'proposal_min_status', v_rule.proposal_min_status
            ));
        END IF;
    END LOOP;

    -- Retornar resultado
    RETURN QUERY SELECT
        (jsonb_array_length(v_missing) = 0),
        v_missing;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ATUALIZAR FUNÇÃO mover_card PARA VALIDAR REQUISITOS
-- ============================================================================

-- Primeiro, verificar a assinatura atual da função
-- Vamos criar uma versão que valida requisitos

CREATE OR REPLACE FUNCTION mover_card_v2(
    p_card_id UUID,
    p_nova_etapa_id UUID,
    p_motivo_perda_id UUID DEFAULT NULL,
    p_motivo_perda_comentario TEXT DEFAULT NULL,
    p_force BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_card RECORD;
    v_old_stage RECORD;
    v_new_stage RECORD;
    v_validation RECORD;
    v_result JSONB;
BEGIN
    -- Buscar card atual
    SELECT * INTO v_card FROM cards WHERE id = p_card_id;

    IF v_card IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'card_not_found',
            'message', 'Card não encontrado'
        );
    END IF;

    -- Buscar stages
    SELECT * INTO v_old_stage FROM pipeline_stages WHERE id = v_card.pipeline_stage_id;
    SELECT * INTO v_new_stage FROM pipeline_stages WHERE id = p_nova_etapa_id;

    IF v_new_stage IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'stage_not_found',
            'message', 'Stage de destino não encontrado'
        );
    END IF;

    -- Validar requisitos (exceto se force=true)
    IF NOT p_force THEN
        SELECT * INTO v_validation
        FROM validate_stage_requirements(p_card_id, p_nova_etapa_id);

        IF NOT v_validation.valid THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'requirements_not_met',
                'message', 'Requisitos não atendidos para mover para esta etapa',
                'missing_requirements', v_validation.missing_requirements
            );
        END IF;
    END IF;

    -- Atualizar card
    UPDATE cards
    SET
        pipeline_stage_id = p_nova_etapa_id,
        motivo_perda_id = COALESCE(p_motivo_perda_id, motivo_perda_id),
        motivo_perda_comentario = COALESCE(p_motivo_perda_comentario, motivo_perda_comentario),
        is_won = v_new_stage.is_won,
        is_lost = v_new_stage.is_lost,
        updated_at = NOW()
    WHERE id = p_card_id;

    -- Log da movimentação
    INSERT INTO cadence_event_log (
        card_id,
        event_type,
        event_source,
        event_data,
        action_taken,
        action_result
    ) VALUES (
        p_card_id,
        'stage_change',
        CASE WHEN p_force THEN 'manual_force' ELSE 'manual' END,
        jsonb_build_object(
            'from_stage_id', v_old_stage.id,
            'from_stage_name', v_old_stage.nome,
            'to_stage_id', v_new_stage.id,
            'to_stage_name', v_new_stage.nome,
            'forced', p_force
        ),
        'move_card',
        jsonb_build_object('success', true)
    );

    RETURN jsonb_build_object(
        'success', true,
        'from_stage', v_old_stage.nome,
        'to_stage', v_new_stage.nome
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER: Função para verificar se usuário pode forçar movimentação
-- ============================================================================

CREATE OR REPLACE FUNCTION can_force_card_move(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id
          AND role IN ('admin', 'manager')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION validate_stage_requirements(UUID, UUID) IS
'Valida se um card atende todos os requisitos para entrar em um stage.
Retorna valid=true se OK, ou lista de requisitos faltantes.
Tipos de requisitos: field, proposal, task, rule';

COMMENT ON FUNCTION mover_card_v2(UUID, UUID, UUID, TEXT, BOOLEAN) IS
'Move um card para outro stage com validação de requisitos.
Use force=true para bypass (apenas admins/managers).
Retorna JSON com success e detalhes.';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
