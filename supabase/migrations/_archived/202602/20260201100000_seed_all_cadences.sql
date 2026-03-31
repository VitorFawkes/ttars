-- ============================================================================
-- SEED: TODAS AS CADÊNCIAS DO SISTEMA
-- ============================================================================
-- 1. Reengajamento (SDR)
-- 2. Pós-Reunião (Planner)
-- 3. Proposta Enviada (Planner)
-- 4. Pré-Viagem (Pós-venda)
-- 5. Pós-Viagem (Pós-venda)
-- ============================================================================

-- ============================================================================
-- CADÊNCIA 2: REENGAJAMENTO (SDR)
-- Objetivo: Reativar leads que esfriaram
-- Trigger: Manual
-- Duração: 7 dias, 3 tentativas
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
BEGIN
    -- Inserir template
    INSERT INTO cadence_templates (
        name,
        description,
        target_audience,
        respect_business_hours,
        auto_cancel_on_stage_change,
        soft_break_after_days,
        is_active
    ) VALUES (
        'Cadência SDR - Reengajamento',
        'Cadência para reativar leads que esfriaram ou voltaram a interagir. 3 tentativas em 7 dias.',
        'sdr',
        true,
        true,
        7,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_template_id;

    -- Se já existe, buscar o id
    IF v_template_id IS NULL THEN
        SELECT id INTO v_template_id FROM cadence_templates WHERE name = 'Cadência SDR - Reengajamento';
    END IF;

    -- Limpar steps existentes para recriar
    DELETE FROM cadence_steps WHERE template_id = v_template_id;

    -- Steps do Reengajamento
    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        1,
        'contato_reativacao',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Contato de Reativação',
            'descricao', 'Retomar contato com lead que havia esfriado. Mencionar interesse anterior.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        2,
        'wait_1',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'followup_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        3,
        'followup_1',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Follow-up de Reativação',
            'descricao', 'Segunda tentativa. Oferecer algo de valor (desconto, novidade).',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_2'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        4,
        'wait_2',
        'wait',
        jsonb_build_object('duration_minutes', 5760, 'duration_type', 'business'),
        'ultima_tentativa'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        5,
        'ultima_tentativa',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Última Tentativa de Reativação',
            'descricao', 'Última chance. Mensagem de despedida amigável.',
            'prioridade', 'low',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'end_reeng'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, end_config)
    VALUES (
        v_template_id,
        6,
        'end_reeng',
        'end',
        jsonb_build_object('result', 'ghosting')
    );

    RAISE NOTICE 'Cadência SDR - Reengajamento criada com ID: %', v_template_id;
END $$;

-- ============================================================================
-- CADÊNCIA 3: PÓS-REUNIÃO (PLANNER)
-- Objetivo: Manter engajamento após apresentação
-- Trigger: Card entra em "Apresentação Feita"
-- Duração: 7 dias
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO cadence_templates (
        name,
        description,
        target_audience,
        respect_business_hours,
        auto_cancel_on_stage_change,
        soft_break_after_days,
        is_active
    ) VALUES (
        'Cadência Planner - Pós-Reunião',
        'Acompanhamento após apresentação da viagem. Mantém o cliente engajado até fechamento.',
        'planner',
        true,
        true,
        7,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
        SELECT id INTO v_template_id FROM cadence_templates WHERE name = 'Cadência Planner - Pós-Reunião';
    END IF;

    DELETE FROM cadence_steps WHERE template_id = v_template_id;

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        1,
        'enviar_resumo',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Enviar Resumo da Reunião',
            'descricao', 'Enviar resumo dos pontos discutidos e próximos passos.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        2,
        'wait_1',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'verificar_duvidas'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        3,
        'verificar_duvidas',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Verificar Dúvidas',
            'descricao', 'Perguntar se surgiram dúvidas sobre o roteiro ou valores.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_2'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        4,
        'wait_2',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'apresentar_proposta'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        5,
        'apresentar_proposta',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Apresentar/Revisar Proposta',
            'descricao', 'Enviar proposta formal ou revisar proposta existente.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_3'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        6,
        'wait_3',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'followup_decisao'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        7,
        'followup_decisao',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Follow-up de Decisão',
            'descricao', 'Verificar se cliente está pronto para fechar ou precisa de ajustes.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'end_posreuniao'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, end_config)
    VALUES (
        v_template_id,
        8,
        'end_posreuniao',
        'end',
        jsonb_build_object('result', 'success')
    );

    RAISE NOTICE 'Cadência Planner - Pós-Reunião criada com ID: %', v_template_id;
END $$;

-- ============================================================================
-- CADÊNCIA 4: PROPOSTA ENVIADA (PLANNER)
-- Objetivo: Converter proposta em venda
-- Trigger: Proposta enviada ao cliente
-- Duração: 10 dias
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO cadence_templates (
        name,
        description,
        target_audience,
        respect_business_hours,
        auto_cancel_on_stage_change,
        soft_break_after_days,
        is_active
    ) VALUES (
        'Cadência Planner - Proposta Enviada',
        'Acompanhamento de proposta enviada. 5 touchpoints em 10 dias para converter em venda.',
        'planner',
        true,
        true,
        10,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
        SELECT id INTO v_template_id FROM cadence_templates WHERE name = 'Cadência Planner - Proposta Enviada';
    END IF;

    DELETE FROM cadence_steps WHERE template_id = v_template_id;

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        1,
        'confirmar_recebimento',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Confirmar Recebimento da Proposta',
            'descricao', 'Verificar se cliente recebeu e conseguiu visualizar a proposta.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        2,
        'wait_1',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'verificar_visualizacao'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        3,
        'verificar_visualizacao',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Verificar se Viu a Proposta',
            'descricao', 'Perguntar se cliente teve tempo de analisar os detalhes.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_2'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        4,
        'wait_2',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'tirar_duvidas'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        5,
        'tirar_duvidas',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Tirar Dúvidas sobre Proposta',
            'descricao', 'Oferecer-se para esclarecer qualquer ponto da proposta.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_3'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        6,
        'wait_3',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'negociar_ajustes'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        7,
        'negociar_ajustes',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Negociar Ajustes',
            'descricao', 'Verificar se cliente precisa de alterações no roteiro ou condições.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_4'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        8,
        'wait_4',
        'wait',
        jsonb_build_object('duration_minutes', 4320, 'duration_type', 'business'),
        'ultima_tentativa_fechamento'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        9,
        'ultima_tentativa_fechamento',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Última Tentativa de Fechamento',
            'descricao', 'Última abordagem para fechar. Criar senso de urgência se aplicável.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'end_proposta'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, end_config)
    VALUES (
        v_template_id,
        10,
        'end_proposta',
        'end',
        jsonb_build_object('result', 'success')
    );

    RAISE NOTICE 'Cadência Planner - Proposta Enviada criada com ID: %', v_template_id;
END $$;

-- ============================================================================
-- CADÊNCIA 5: PRÉ-VIAGEM (PÓS-VENDA)
-- Objetivo: Preparar cliente para a viagem
-- Trigger: X dias antes da data de embarque
-- Duração: 30 dias antes até embarque
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO cadence_templates (
        name,
        description,
        target_audience,
        respect_business_hours,
        auto_cancel_on_stage_change,
        soft_break_after_days,
        is_active
    ) VALUES (
        'Cadência Pós-venda - Pré-Viagem',
        'Preparação do cliente nos 30 dias antes da viagem. Documentação, confirmações e dicas.',
        'posvenda',
        true,
        false,
        30,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
        SELECT id INTO v_template_id FROM cadence_templates WHERE name = 'Cadência Pós-venda - Pré-Viagem';
    END IF;

    DELETE FROM cadence_steps WHERE template_id = v_template_id;

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        1,
        'documentacao_pendente',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Verificar Documentação Pendente',
            'descricao', 'Confirmar que passaportes, vistos e seguros estão em dia. 30 dias antes.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        2,
        'wait_1',
        'wait',
        jsonb_build_object('duration_minutes', 21600, 'duration_type', 'calendar'),
        'confirmar_reservas'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        3,
        'confirmar_reservas',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Confirmar Reservas',
            'descricao', 'Reconfirmar voos, hotéis e transfers. 15 dias antes.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_2'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        4,
        'wait_2',
        'wait',
        jsonb_build_object('duration_minutes', 11520, 'duration_type', 'calendar'),
        'checklist_viagem'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        5,
        'checklist_viagem',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Enviar Checklist de Viagem',
            'descricao', 'Enviar lista do que levar e informações úteis. 7 dias antes.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_3'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        6,
        'wait_3',
        'wait',
        jsonb_build_object('duration_minutes', 5760, 'duration_type', 'calendar'),
        'dicas_finais'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        7,
        'dicas_finais',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Enviar Dicas Finais',
            'descricao', 'Dicas de última hora: clima, moeda, aplicativos úteis. 3 dias antes.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_4'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        8,
        'wait_4',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'calendar'),
        'boa_viagem'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        9,
        'boa_viagem',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Mensagem de Boa Viagem!',
            'descricao', 'Desejar uma excelente viagem e lembrar contato de emergência. 1 dia antes.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', false
        ),
        'end_previagem'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, end_config)
    VALUES (
        v_template_id,
        10,
        'end_previagem',
        'end',
        jsonb_build_object('result', 'success')
    );

    RAISE NOTICE 'Cadência Pós-venda - Pré-Viagem criada com ID: %', v_template_id;
END $$;

-- ============================================================================
-- CADÊNCIA 6: PÓS-VIAGEM (PÓS-VENDA)
-- Objetivo: Coletar feedback e gerar indicações
-- Trigger: Card entra em "Viagem Concluída"
-- Duração: 14 dias após retorno
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO cadence_templates (
        name,
        description,
        target_audience,
        respect_business_hours,
        auto_cancel_on_stage_change,
        soft_break_after_days,
        is_active
    ) VALUES (
        'Cadência Pós-venda - Pós-Viagem',
        'Acompanhamento após retorno da viagem. Feedback, indicações e fidelização.',
        'posvenda',
        true,
        false,
        14,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_template_id;

    IF v_template_id IS NULL THEN
        SELECT id INTO v_template_id FROM cadence_templates WHERE name = 'Cadência Pós-venda - Pós-Viagem';
    END IF;

    DELETE FROM cadence_steps WHERE template_id = v_template_id;

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        1,
        'boas_vindas_volta',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Boas-vindas de Volta!',
            'descricao', 'Perguntar como foi a viagem. Demonstrar interesse genuíno. 1 dia após retorno.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_1'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        2,
        'wait_1',
        'wait',
        jsonb_build_object('duration_minutes', 2880, 'duration_type', 'business'),
        'pedir_avaliacao'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        3,
        'pedir_avaliacao',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Solicitar Avaliação/Feedback',
            'descricao', 'Pedir avaliação da experiência. Google, redes sociais ou NPS interno. 3 dias após.',
            'prioridade', 'high',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_2'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        4,
        'wait_2',
        'wait',
        jsonb_build_object('duration_minutes', 5760, 'duration_type', 'business'),
        'solicitar_indicacoes'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        5,
        'solicitar_indicacoes',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Solicitar Indicações',
            'descricao', 'Pedir indicações de amigos/família que possam se interessar. 7 dias após.',
            'prioridade', 'medium',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'wait_3'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, wait_config, next_step_key)
    VALUES (
        v_template_id,
        6,
        'wait_3',
        'wait',
        jsonb_build_object('duration_minutes', 10080, 'duration_type', 'business'),
        'oferecer_proxima'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, task_config, next_step_key)
    VALUES (
        v_template_id,
        7,
        'oferecer_proxima',
        'task',
        jsonb_build_object(
            'tipo', 'contato',
            'titulo', 'Oferecer Próxima Viagem',
            'descricao', 'Apresentar destino complementar ou promoção especial. 14 dias após.',
            'prioridade', 'low',
            'assign_to', 'card_owner',
            'wait_for_outcome', true
        ),
        'end_posviagem'
    );

    INSERT INTO cadence_steps (template_id, step_order, step_key, step_type, end_config)
    VALUES (
        v_template_id,
        8,
        'end_posviagem',
        'end',
        jsonb_build_object('result', 'success')
    );

    RAISE NOTICE 'Cadência Pós-venda - Pós-Viagem criada com ID: %', v_template_id;
END $$;

-- ============================================================================
-- LOG FINAL
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Seed de cadências concluído com sucesso!';
    RAISE NOTICE '5 cadências criadas:';
    RAISE NOTICE '  - Cadência SDR - Reengajamento';
    RAISE NOTICE '  - Cadência Planner - Pós-Reunião';
    RAISE NOTICE '  - Cadência Planner - Proposta Enviada';
    RAISE NOTICE '  - Cadência Pós-venda - Pré-Viagem';
    RAISE NOTICE '  - Cadência Pós-venda - Pós-Viagem';
    RAISE NOTICE '============================================';
END $$;
