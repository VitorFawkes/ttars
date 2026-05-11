-- ============================================================================
-- CANCEL LEGACY WORKFLOW QUEUE AND SEED SDR CADENCE
-- ============================================================================
-- 1. Cancelar fila legada do workflow-engine (43K+ items)
-- 2. Criar cadência SDR padrão de prospecção
-- ============================================================================

-- ============================================================================
-- PARTE 1: CANCELAR FILA LEGADA
-- ============================================================================

-- Cancelar todas as instâncias de workflow ativas
UPDATE workflow_instances
SET
    status = 'cancelled',
    updated_at = NOW()
WHERE status IN ('running', 'waiting', 'pending');

-- Limpar fila de execução
DELETE FROM workflow_queue
WHERE status = 'pending';

-- Log da limpeza
INSERT INTO cadence_event_log (
    card_id,
    event_type,
    event_source,
    event_data,
    action_taken,
    action_result
) VALUES (
    NULL,
    'system_migration',
    'migration_script',
    jsonb_build_object(
        'migration', '20260131000003_cancel_legacy_and_seed_sdr',
        'action', 'cancel_legacy_workflow_queue',
        'timestamp', NOW()
    ),
    'cancel_legacy_queue',
    jsonb_build_object(
        'success', true,
        'message', 'Fila legada do workflow-engine cancelada para migração para Cadence Engine v3'
    )
);

-- ============================================================================
-- PARTE 2: SEED CADÊNCIA SDR - PROSPECÇÃO
-- ============================================================================

-- Inserir template de cadência SDR
INSERT INTO cadence_templates (
    id,
    name,
    description,
    target_audience,
    applicable_stages,
    respect_business_hours,
    auto_cancel_on_stage_change,
    soft_break_after_days,
    is_active
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    'Cadência SDR - Prospecção',
    'Cadência padrão de prospecção para novos leads. 7 tentativas de contato em 14 dias com intervalos crescentes.',
    'sdr',
    ARRAY[
        '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9'::UUID, -- Novo Lead
        'f5df9be4-882f-4e54-b8f9-49782889b63e'::UUID  -- Tentativa de Contato
    ],
    true,  -- Respeitar horário comercial
    true,  -- Cancelar se card mudar de stage
    14,    -- Soft break após 14 dias
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Inserir steps da cadência SDR
-- Step 1: Primeira tentativa de contato (imediato)
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-001'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    1,
    'contato_1',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '1ª Tentativa de Contato',
        'descricao', 'Primeira tentativa de contato com o lead. Ligar ou enviar WhatsApp.',
        'prioridade', 'high',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_1'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 2: Aguardar 2 horas
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-002'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    2,
    'wait_1',
    'wait',
    jsonb_build_object(
        'duration_minutes', 120,
        'duration_type', 'business'
    ),
    'contato_2'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 3: Segunda tentativa de contato
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-003'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    3,
    'contato_2',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '2ª Tentativa de Contato',
        'descricao', 'Segunda tentativa. Se não conseguiu por ligação, tente WhatsApp.',
        'prioridade', 'high',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_2'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 4: Aguardar 1 dia
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-004'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    4,
    'wait_2',
    'wait',
    jsonb_build_object(
        'duration_minutes', 1440, -- 24 horas
        'duration_type', 'business'
    ),
    'contato_3'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 5: Terceira tentativa
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-005'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    5,
    'contato_3',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '3ª Tentativa de Contato',
        'descricao', 'Terceira tentativa. Varie o canal e horário.',
        'prioridade', 'medium',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_3'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 6: Aguardar 1 dia
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-006'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    6,
    'wait_3',
    'wait',
    jsonb_build_object(
        'duration_minutes', 1440,
        'duration_type', 'business'
    ),
    'contato_4'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 7: Quarta tentativa
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-007'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    7,
    'contato_4',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '4ª Tentativa de Contato',
        'descricao', 'Quarta tentativa. Considere enviar mensagem com conteúdo de valor.',
        'prioridade', 'medium',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_4'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 8: Aguardar 2 dias
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-008'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    8,
    'wait_4',
    'wait',
    jsonb_build_object(
        'duration_minutes', 2880, -- 48 horas
        'duration_type', 'business'
    ),
    'contato_5'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 9: Quinta tentativa
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-009'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    9,
    'contato_5',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '5ª Tentativa de Contato',
        'descricao', 'Quinta tentativa. Tente um horário diferente.',
        'prioridade', 'medium',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_5'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 10: Aguardar 3 dias
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-010'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    10,
    'wait_5',
    'wait',
    jsonb_build_object(
        'duration_minutes', 4320, -- 72 horas
        'duration_type', 'business'
    ),
    'contato_6'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 11: Sexta tentativa
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-011'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    11,
    'contato_6',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '6ª Tentativa de Contato',
        'descricao', 'Sexta tentativa. Mensagem mais direta.',
        'prioridade', 'low',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'wait_6'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 12: Aguardar 3 dias
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    wait_config,
    next_step_key
) VALUES (
    'step-sdr-012'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    12,
    'wait_6',
    'wait',
    jsonb_build_object(
        'duration_minutes', 4320,
        'duration_type', 'business'
    ),
    'contato_7'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    wait_config = EXCLUDED.wait_config;

-- Step 13: Sétima e última tentativa
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    task_config,
    next_step_key
) VALUES (
    'step-sdr-013'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    13,
    'contato_7',
    'task',
    jsonb_build_object(
        'tipo', 'contato',
        'titulo', '7ª Tentativa - Final',
        'descricao', 'Última tentativa de contato. Se não responder, lead será marcado como sem contato.',
        'prioridade', 'low',
        'assign_to', 'card_owner',
        'wait_for_outcome', true
    ),
    'end_ghosting'
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    task_config = EXCLUDED.task_config;

-- Step 14: Fim - Ghosting (sem resposta)
INSERT INTO cadence_steps (
    id,
    template_id,
    step_order,
    step_key,
    step_type,
    end_config
) VALUES (
    'step-sdr-014'::UUID,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
    14,
    'end_ghosting',
    'end',
    jsonb_build_object(
        'result', 'ghosting',
        'move_to_stage_id', 'd724a560-f046-4a3f-bebe-4b70917d9283', -- Fechado - Perdido
        'motivo_perda_id', '3e27918a-8584-42ab-8d05-3d993ab9de8e' -- Sem resposta (Ghosting)
    )
) ON CONFLICT (template_id, step_key) DO UPDATE SET
    end_config = EXCLUDED.end_config;

-- ============================================================================
-- PARTE 3: CRIAR EVENT TRIGGERS PARA AUTO-COMPLETE
-- ============================================================================

-- Trigger: WhatsApp INBOUND auto-completa tarefa de contato
INSERT INTO cadence_event_triggers (
    id,
    template_id,
    is_global,
    event_type,
    event_config,
    conditions,
    action_type,
    action_config,
    priority,
    is_active
) VALUES (
    'trigger-whatsapp-inbound-001'::UUID,
    NULL, -- Global (aplica a qualquer cadência)
    true,
    'whatsapp_inbound',
    jsonb_build_object(
        'require_card_in_same_stage', true
    ),
    jsonb_build_array(
        jsonb_build_object(
            'type', 'card_in_stages',
            'stage_ids', ARRAY[
                '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9', -- Novo Lead
                'f5df9be4-882f-4e54-b8f9-49782889b63e'  -- Tentativa de Contato
            ]
        )
    ),
    'complete_task',
    jsonb_build_object(
        'task_tipo', 'contato',
        'outcome', 'respondido_pelo_cliente',
        'then_move_to_stage_id', '163da577-e33f-424d-85b9-732317138eea' -- Conectado
    ),
    10, -- Alta prioridade
    true
) ON CONFLICT (id) DO UPDATE SET
    event_config = EXCLUDED.event_config,
    conditions = EXCLUDED.conditions,
    action_config = EXCLUDED.action_config;

-- Trigger: WhatsApp OUTBOUND auto-completa tarefa de contato
INSERT INTO cadence_event_triggers (
    id,
    template_id,
    is_global,
    event_type,
    event_config,
    conditions,
    action_type,
    action_config,
    priority,
    is_active
) VALUES (
    'trigger-whatsapp-outbound-001'::UUID,
    NULL,
    true,
    'whatsapp_outbound',
    jsonb_build_object(
        'require_card_in_same_stage', true
    ),
    jsonb_build_array(
        jsonb_build_object(
            'type', 'card_in_stage',
            'stage_id', '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9' -- Novo Lead
        )
    ),
    'complete_task',
    jsonb_build_object(
        'task_tipo', 'contato',
        'outcome', 'enviado_por_nos',
        'then_move_to_stage_id', 'f5df9be4-882f-4e54-b8f9-49782889b63e' -- Tentativa de Contato
    ),
    9,
    true
) ON CONFLICT (id) DO UPDATE SET
    event_config = EXCLUDED.event_config,
    conditions = EXCLUDED.conditions,
    action_config = EXCLUDED.action_config;

-- ============================================================================
-- PARTE 4: LOG FINAL
-- ============================================================================

INSERT INTO cadence_event_log (
    card_id,
    event_type,
    event_source,
    event_data,
    action_taken,
    action_result
) VALUES (
    NULL,
    'system_migration',
    'migration_script',
    jsonb_build_object(
        'migration', '20260131000003_cancel_legacy_and_seed_sdr',
        'action', 'seed_sdr_cadence',
        'timestamp', NOW()
    ),
    'create_cadence_template',
    jsonb_build_object(
        'success', true,
        'template_id', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'template_name', 'Cadência SDR - Prospecção',
        'steps_count', 14,
        'triggers_count', 2
    )
);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
