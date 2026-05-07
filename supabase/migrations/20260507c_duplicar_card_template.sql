-- ============================================================================
-- MIGRATION: duplicar_card_template
-- Date: 2026-05-07
--
-- Contexto: o consultor frequentemente quer reaproveitar um card recheado
-- (destinos, itens financeiros, anotações de viagem) como base para uma nova
-- oportunidade — mesmo produto, cliente diferente. Hoje precisa criar do zero.
--
-- Esta RPC clona o card no modo "template para outro cliente":
--   - Copia: campos de viagem (epoca, duração, valor estimado, briefing,
--     produto_data limpo de identificadores de venda), itens financeiros
--     (sem cobrança real), tags
--   - Zera: cliente principal, owners (exceto o que o caller passar),
--     tarefas, atividades, propostas, mensagens, time, milestones,
--     status financeiro/comercial, externals
--   - Volta para a primeira etapa do funil
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS duplicar_card_template(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION duplicar_card_template(
    p_source_id UUID,
    p_titulo_novo TEXT,
    p_dono_atual_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source RECORD;
    v_new_card_id UUID;
    v_first_stage_id UUID;
    v_user_id UUID;
    v_caller_org UUID;
    v_clean_produto_data JSONB;
    v_dono UUID;
    v_titulo TEXT;
BEGIN
    v_user_id := auth.uid();
    v_caller_org := requesting_org_id();
    v_titulo := TRIM(COALESCE(p_titulo_novo, ''));

    -- 1. Validações
    IF v_titulo = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Título do novo card não pode ficar em branco');
    END IF;

    SELECT * INTO v_source
    FROM cards
    WHERE id = p_source_id
      AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card de origem não encontrado');
    END IF;

    IF v_caller_org IS NOT NULL AND v_source.org_id <> v_caller_org THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card de origem não encontrado');
    END IF;

    IF v_source.card_type <> 'standard' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Apenas cards comuns podem ser duplicados (sub-cards, agrupadores e oportunidades futuras não)'
        );
    END IF;

    -- 2. Resolver primeira etapa do pipeline
    SELECT s.id INTO v_first_stage_id
    FROM pipeline_stages s
    JOIN pipeline_phases ph ON ph.id = s.phase_id
    WHERE s.pipeline_id = v_source.pipeline_id
      AND s.ativo = true
    ORDER BY ph.order_index ASC NULLS LAST, s.ordem ASC
    LIMIT 1;

    IF v_first_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não foi possível determinar a primeira etapa do pipeline');
    END IF;

    -- 3. Limpar produto_data: remover chaves de venda real
    v_clean_produto_data := COALESCE(v_source.produto_data, '{}'::jsonb)
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'imported_from'
        - 'taxa_planejamento'
        - 'orcamento';

    v_dono := COALESCE(p_dono_atual_id, v_user_id);

    -- 4. Criar novo card
    INSERT INTO cards (
        titulo, card_type, parent_card_id,
        org_id, produto, pipeline_id, pipeline_stage_id, stage_entered_at,
        moeda, valor_estimado,
        data_viagem_inicio, data_viagem_fim,
        epoca_mes_inicio, epoca_mes_fim, epoca_ano, epoca_tipo,
        duracao_dias_min, duracao_dias_max,
        produto_data, briefing_inicial,
        prioridade, status_comercial,
        dono_atual_id,
        created_by, created_at, updated_at
    )
    VALUES (
        v_titulo, 'standard', NULL,
        v_source.org_id, v_source.produto, v_source.pipeline_id, v_first_stage_id, now(),
        v_source.moeda, v_source.valor_estimado,
        v_source.data_viagem_inicio, v_source.data_viagem_fim,
        v_source.epoca_mes_inicio, v_source.epoca_mes_fim, v_source.epoca_ano, v_source.epoca_tipo,
        v_source.duracao_dias_min, v_source.duracao_dias_max,
        v_clean_produto_data, v_source.briefing_inicial,
        v_source.prioridade, 'aberto',
        v_dono,
        v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 5. Copiar itens financeiros (sem cobrança real, sem ligações Monde)
    INSERT INTO card_financial_items (
        card_id, org_id, product_type, description,
        sale_value, supplier_cost, is_ready, notes,
        fornecedor, representante, documento,
        data_inicio, data_fim, observacoes,
        created_at, updated_at
    )
    SELECT
        v_new_card_id, org_id, product_type, description,
        sale_value, supplier_cost, false, notes,
        fornecedor, representante, documento,
        data_inicio, data_fim, observacoes,
        now(), now()
    FROM card_financial_items
    WHERE card_id = p_source_id
      AND archived_at IS NULL;

    -- 6. Copiar tags
    INSERT INTO card_tag_assignments (card_id, tag_id, assigned_by, assigned_at, org_id)
    SELECT v_new_card_id, tag_id, v_user_id, now(), org_id
    FROM card_tag_assignments
    WHERE card_id = p_source_id
    ON CONFLICT DO NOTHING;

    -- 7. Activity no card original
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at, org_id)
    VALUES (
        p_source_id,
        'card_duplicado',
        'Card usado como base para novo card: ' || v_titulo,
        jsonb_build_object('new_card_id', v_new_card_id, 'new_card_titulo', v_titulo),
        v_user_id, now(), v_source.org_id
    );

    -- 8. Activity no card novo
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at, org_id)
    VALUES (
        v_new_card_id,
        'card_criado_via_duplicacao',
        'Duplicado a partir de: ' || COALESCE(v_source.titulo, '(sem título)'),
        jsonb_build_object('source_card_id', p_source_id, 'source_card_titulo', v_source.titulo),
        v_user_id, now(), v_source.org_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_card_id', v_new_card_id,
        'new_card_titulo', v_titulo,
        'source_card_id', p_source_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION duplicar_card_template TO authenticated;

COMMIT;
