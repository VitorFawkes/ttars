-- ============================================================================
-- MIGRATION: Fix Sub-Card V2 Gaps
-- Description: Corrige gaps deixados pela migração V2 de sub-cards:
--   1. Restaura criação de tarefa solicitacao_mudanca (coordenação Pós-Venda)
--   2. Transfere números de venda Monde no trigger de agregação
--   3. Trigger para sub-card completed quando status_comercial = ganho
--   4. Sync valor_proprio quando pai é editado
-- Date: 2026-03-26
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REESCREVER criar_sub_card — restaurar tarefa solicitacao_mudanca
--    quando o card pai já está em Pós-Venda (coordenação operacional)
-- ============================================================================

CREATE OR REPLACE FUNCTION criar_sub_card(
    p_parent_id UUID,
    p_titulo TEXT,
    p_descricao TEXT,
    p_mode TEXT DEFAULT 'incremental',
    p_merge_config JSONB DEFAULT NULL  -- mantido para backward compat, ignorado
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_parent RECORD;
    v_planner_phase_id UUID;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_user_id UUID;
    v_sub_produto_data JSONB;
BEGIN
    v_user_id := auth.uid();

    -- 1. Validar card pai
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal não encontrado');
    END IF;

    -- Sub-card de sub-card não permitido
    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de um sub-card');
    END IF;

    -- Group parent não permitido
    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar item adicional em card agrupador');
    END IF;

    -- Oportunidade futura não pode ser pai de sub-card
    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não é possível criar sub-card de uma oportunidade futura');
    END IF;

    -- 2. Determinar estágio inicial
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT id INTO v_planner_phase_id
        FROM pipeline_phases
        WHERE name = 'Planner'
        LIMIT 1;

        IF v_planner_phase_id IS NOT NULL THEN
            SELECT id INTO v_target_stage_id
            FROM pipeline_stages
            WHERE phase_id = v_planner_phase_id
              AND pipeline_id = v_parent.pipeline_id
              AND nome = 'Proposta em Construção'
            LIMIT 1;

            IF v_target_stage_id IS NULL THEN
                SELECT id INTO v_target_stage_id
                FROM pipeline_stages
                WHERE phase_id = v_planner_phase_id
                  AND pipeline_id = v_parent.pipeline_id
                ORDER BY ordem ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhuma etapa encontrada na fase Planner');
    END IF;

    -- 3. Preparar produto_data (herdar do pai, limpar Monde e taxa)
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento';

    -- 4. Criar o sub-card (sempre incremental, valor_estimado = 0)
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, 0,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Log de criação
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'valor_estimado', 0),
        jsonb_build_object('target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created', 'Item da viagem criado: ' || p_titulo,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo),
        v_user_id, now()
    );

    -- 7. Criar tarefa solicitacao_mudanca no card PAI para coordenação Pós-Venda
    --    Só quando o pai já está em fase de Pós-Venda (viagem já confirmada)
    IF v_parent.fase = 'pos_venda' THEN
        INSERT INTO tarefas (
            card_id,
            tipo,
            titulo,
            descricao,
            responsavel_id,
            data_vencimento,
            prioridade,
            metadata,
            created_by,
            created_at
        )
        VALUES (
            p_parent_id,
            'solicitacao_mudanca',
            'Item da viagem: ' || p_titulo,
            COALESCE(p_descricao, 'Sub-card criado pelo Planner'),
            COALESCE(v_parent.pos_owner_id, v_parent.vendas_owner_id, v_user_id),
            now() + interval '3 days',
            'alta',
            jsonb_build_object(
                'sub_card_id', v_new_card_id,
                'sub_card_titulo', p_titulo,
                'created_by', v_user_id
            ),
            v_user_id,
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'parent_id', p_parent_id
    );
END;
$$;

-- ============================================================================
-- 2. REESCREVER aggregate_sub_card_values — adicionar transfer de Monde numbers
-- ============================================================================

CREATE OR REPLACE FUNCTION aggregate_sub_card_values()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phase_slug TEXT;
    v_parent_card_id UUID;
    v_sub_monde TEXT;
    v_parent_pd JSONB;
    v_historico JSONB;
    v_parent_monde TEXT;
BEGIN
    v_parent_card_id := COALESCE(NEW.parent_card_id, OLD.parent_card_id);

    IF v_parent_card_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Verificar se o sub-card entrou em Pós-Venda
    IF NEW.pipeline_stage_id IS NOT NULL THEN
        SELECT pp.slug INTO v_phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.id = NEW.pipeline_stage_id;

        -- Marcar timestamp quando entra em Pós-Venda pela primeira vez
        IF v_phase_slug = 'pos_venda' AND NEW.sub_card_agregado_em IS NULL THEN
            UPDATE cards SET sub_card_agregado_em = NOW()
            WHERE id = NEW.id;
            NEW.sub_card_agregado_em := NOW();

            -- Transferir numero_venda_monde do sub-card para historico do pai
            v_sub_monde := NEW.produto_data->>'numero_venda_monde';

            IF v_sub_monde IS NOT NULL AND v_sub_monde <> '' THEN
                SELECT produto_data INTO v_parent_pd
                FROM cards WHERE id = v_parent_card_id;

                v_parent_pd := COALESCE(v_parent_pd, '{}'::jsonb);
                v_historico := COALESCE(v_parent_pd->'numeros_venda_monde_historico', '[]'::jsonb);
                v_parent_monde := v_parent_pd->>'numero_venda_monde';

                -- Garantir que o número original do pai está no histórico
                IF v_parent_monde IS NOT NULL AND v_parent_monde <> '' THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(v_historico) elem
                        WHERE elem->>'numero' = v_parent_monde
                    ) THEN
                        v_historico := v_historico || jsonb_build_array(
                            jsonb_build_object(
                                'numero', v_parent_monde,
                                'origem', 'original',
                                'sub_card_id', NULL,
                                'sub_card_titulo', NULL,
                                'adicionado_em', (SELECT created_at FROM cards WHERE id = v_parent_card_id)
                            )
                        );
                    END IF;
                END IF;

                -- Adicionar número do sub-card (dedup)
                IF NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(v_historico) elem
                    WHERE elem->>'numero' = v_sub_monde
                ) THEN
                    v_historico := v_historico || jsonb_build_array(
                        jsonb_build_object(
                            'numero', v_sub_monde,
                            'origem', 'sub_card',
                            'sub_card_id', NEW.id,
                            'sub_card_titulo', NEW.titulo,
                            'adicionado_em', now()
                        )
                    );
                END IF;

                -- Atualizar produto_data do pai com o histórico
                UPDATE cards
                SET produto_data = COALESCE(produto_data, '{}'::jsonb) || jsonb_build_object(
                    'numeros_venda_monde_historico', v_historico
                ),
                updated_at = NOW()
                WHERE id = v_parent_card_id;
            END IF;
        END IF;
    END IF;

    -- Recalcular valor_final do pai
    UPDATE cards SET
        valor_final = (
            COALESCE(valor_proprio, 0) + COALESCE((
                SELECT SUM(COALESCE(sc.valor_final, sc.valor_estimado, 0))
                FROM cards sc
                WHERE sc.parent_card_id = v_parent_card_id
                  AND sc.card_type = 'sub_card'
                  AND sc.sub_card_status IN ('active', 'completed')
                  AND sc.sub_card_agregado_em IS NOT NULL
            ), 0)
        ),
        updated_at = NOW()
    WHERE id = v_parent_card_id
      AND (card_type IS NULL OR card_type != 'sub_card');

    RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. TRIGGER: sub-card completed quando status_comercial = ganho
-- ============================================================================

CREATE OR REPLACE FUNCTION set_sub_card_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.card_type = 'sub_card'
       AND NEW.status_comercial = 'ganho'
       AND OLD.status_comercial IS DISTINCT FROM 'ganho'
       AND NEW.sub_card_status = 'active' THEN
        NEW.sub_card_status := 'completed';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sub_card_completed ON cards;
CREATE TRIGGER trg_set_sub_card_completed
    BEFORE UPDATE OF status_comercial ON cards
    FOR EACH ROW
    WHEN (NEW.card_type = 'sub_card')
    EXECUTE FUNCTION set_sub_card_completed();

-- Backfill: marcar sub-cards já ganhos como completed
UPDATE cards SET sub_card_status = 'completed'
WHERE card_type = 'sub_card'
  AND status_comercial = 'ganho'
  AND sub_card_status = 'active';

-- ============================================================================
-- 4. TRIGGER: sync valor_proprio quando pai é editado
--    Quando o pai não tem sub-cards agregados, manter valor_proprio = valor_final
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_valor_proprio_on_parent_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Ignorar sub-cards
    IF NEW.card_type = 'sub_card' THEN RETURN NEW; END IF;

    -- Se o valor mudou e não há sub-cards agregados, sincronizar valor_proprio
    IF (NEW.valor_final IS DISTINCT FROM OLD.valor_final
        OR NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado)
       AND NOT EXISTS (
           SELECT 1 FROM cards
           WHERE parent_card_id = NEW.id
             AND card_type = 'sub_card'
             AND sub_card_agregado_em IS NOT NULL
       ) THEN
        NEW.valor_proprio := COALESCE(NEW.valor_final, NEW.valor_estimado, 0);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_valor_proprio_on_parent_edit ON cards;
CREATE TRIGGER trg_sync_valor_proprio_on_parent_edit
    BEFORE UPDATE OF valor_final, valor_estimado ON cards
    FOR EACH ROW
    EXECUTE FUNCTION sync_valor_proprio_on_parent_edit();

COMMIT;
