-- ============================================================================
-- CADENCE ENGINE v3 - Sistema de Cadências de Vendas Inteligentes
-- ============================================================================
-- Este sistema substitui o workflow-engine legado com:
-- 1. Auto-complete de tarefas baseado em mensagens WhatsApp
-- 2. Movimentação automática de cards no funil
-- 3. Validação de requisitos no backend
-- 4. Cadências configuráveis com intervalos em business hours
-- ============================================================================

-- ============================================================================
-- PARTE 1: TABELAS PRINCIPAIS DE CADÊNCIA
-- ============================================================================

-- Templates de cadência reutilizáveis
CREATE TABLE IF NOT EXISTS cadence_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    target_audience TEXT, -- 'sdr', 'planner', 'posvenda'
    applicable_stages UUID[], -- Stages onde pode ser aplicada (null = qualquer)
    respect_business_hours BOOLEAN DEFAULT true,
    auto_cancel_on_stage_change BOOLEAN DEFAULT true,
    soft_break_after_days INT DEFAULT 14,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Steps individuais da cadência
CREATE TABLE IF NOT EXISTS cadence_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES cadence_templates(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    step_key TEXT NOT NULL, -- 'contato_1', 'contato_2', 'wait_1'
    step_type TEXT NOT NULL CHECK (step_type IN ('task', 'wait', 'branch', 'end')),

    -- Config por tipo de step
    task_config JSONB DEFAULT '{}',
    -- {tipo: 'contato', titulo: '1ª Tentativa', prioridade: 'high', assign_to: 'card_owner'}

    wait_config JSONB DEFAULT '{}',
    -- {duration_minutes: 120, duration_type: 'business' | 'calendar'}

    branch_config JSONB DEFAULT '{}',
    -- {branches: [{condition: {type: 'task_outcome', outcome: 'respondido_pelo_cliente'}, target_step_key: 'success'}]}

    end_config JSONB DEFAULT '{}',
    -- {result: 'success' | 'failure' | 'ghosting', move_to_stage_id: 'uuid', motivo_perda_id: 'uuid'}

    next_step_key TEXT, -- Próximo step padrão (se não houver branch)

    created_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(template_id, step_key),
    UNIQUE(template_id, step_order)
);

-- Instâncias de cadência por card
CREATE TABLE IF NOT EXISTS cadence_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES cadence_templates(id),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    current_step_id UUID REFERENCES cadence_steps(id),

    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'waiting_task', 'paused', 'completed', 'cancelled', 'failed')),

    -- Contadores para requisitos
    total_contacts_attempted INT DEFAULT 0,
    successful_contacts INT DEFAULT 0,

    -- Contexto para decisões de branch
    context JSONB DEFAULT '{}',

    -- Tracking
    started_at TIMESTAMPTZ DEFAULT now(),
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_reason TEXT,

    created_by UUID REFERENCES auth.users(id)
);

-- Criar índice parcial para garantir unicidade apenas em cadências ativas
CREATE UNIQUE INDEX IF NOT EXISTS idx_cadence_instances_active_unique
ON cadence_instances (template_id, card_id)
WHERE status IN ('active', 'waiting_task', 'paused');

-- Fila de execução de steps
CREATE TABLE IF NOT EXISTS cadence_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES cadence_instances(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES cadence_steps(id),

    execute_at TIMESTAMPTZ NOT NULL,
    priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

    -- Retry logic
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT,
    last_attempt_at TIMESTAMPTZ,

    -- Claim para processamento distribuído
    claimed_by TEXT, -- Nome da instância que pegou o item
    claimed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para processamento eficiente da fila
CREATE INDEX IF NOT EXISTS idx_cadence_queue_pending
ON cadence_queue (execute_at, priority DESC)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cadence_queue_instance
ON cadence_queue (instance_id);

-- Log de eventos da cadência
CREATE TABLE IF NOT EXISTS cadence_event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES cadence_instances(id) ON DELETE SET NULL,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,

    event_type TEXT NOT NULL,
    -- 'step_executed', 'task_created', 'task_completed', 'stage_moved',
    -- 'whatsapp_inbound', 'whatsapp_outbound', 'cadence_started', 'cadence_completed', etc.

    event_source TEXT NOT NULL,
    -- 'engine', 'trigger', 'manual', 'whatsapp', 'task_outcome'

    event_data JSONB DEFAULT '{}',
    action_taken TEXT,
    action_result JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consulta de logs
CREATE INDEX IF NOT EXISTS idx_cadence_event_log_card
ON cadence_event_log (card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cadence_event_log_instance
ON cadence_event_log (instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cadence_event_log_type
ON cadence_event_log (event_type, created_at DESC);

-- Dead letter queue para falhas que precisam de intervenção manual
CREATE TABLE IF NOT EXISTS cadence_dead_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_queue_id UUID,
    instance_id UUID REFERENCES cadence_instances(id) ON DELETE SET NULL,
    step_id UUID REFERENCES cadence_steps(id) ON DELETE SET NULL,

    error_message TEXT NOT NULL,
    error_details JSONB DEFAULT '{}',

    failed_at TIMESTAMPTZ DEFAULT now(),

    -- Resolução
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_action TEXT,
    resolution_notes TEXT
);

-- ============================================================================
-- PARTE 2: EVENT TRIGGERS (Configuração de Auto-Complete)
-- ============================================================================

-- Triggers configuráveis para eventos
CREATE TABLE IF NOT EXISTS cadence_event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES cadence_templates(id) ON DELETE CASCADE,

    -- NULL template_id = trigger global (aplica a qualquer cadência)
    is_global BOOLEAN DEFAULT false,

    -- Evento que dispara
    event_type TEXT NOT NULL,
    -- 'whatsapp_inbound', 'whatsapp_outbound', 'task_outcome',
    -- 'proposal_event', 'stage_enter', 'field_changed'

    event_config JSONB DEFAULT '{}',
    -- Configuração específica do evento

    -- Condições adicionais
    conditions JSONB DEFAULT '[]',
    -- [{type: 'card_in_stage', stage_id: 'uuid'}, {type: 'field_equals', field: 'origem', value: 'indicacao'}]

    -- Ação a executar
    action_type TEXT NOT NULL,
    -- 'complete_task', 'create_task', 'move_card', 'pause_cadence', 'cancel_cadence', 'notify'

    action_config JSONB DEFAULT '{}',
    -- Configuração específica da ação

    priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- PARTE 3: RLS POLICIES (USANDO ESTRUTURA CORRETA DO PROJETO)
-- ============================================================================

-- Habilitar RLS
ALTER TABLE cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_event_triggers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- cadence_templates: Admins podem tudo, outros podem ver templates ativos
-- ============================================================================

CREATE POLICY "cadence_templates_select_active" ON cadence_templates
    FOR SELECT USING (is_active = true);

CREATE POLICY "cadence_templates_admin_all" ON cadence_templates
    FOR ALL USING (public.is_admin());

-- ============================================================================
-- cadence_steps: Segue visibilidade do template pai
-- ============================================================================

CREATE POLICY "cadence_steps_select" ON cadence_steps
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cadence_templates t
            WHERE t.id = template_id
            AND (t.is_active = true OR public.is_admin())
        )
    );

CREATE POLICY "cadence_steps_admin_all" ON cadence_steps
    FOR ALL USING (public.is_admin());

-- ============================================================================
-- cadence_instances: Usuário vê instâncias de cards que é dono, admin vê tudo
-- ============================================================================

CREATE POLICY "cadence_instances_select" ON cadence_instances
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY "cadence_instances_admin_all" ON cadence_instances
    FOR ALL USING (public.is_admin());

-- ============================================================================
-- cadence_queue: Apenas admins e sistema
-- ============================================================================

CREATE POLICY "cadence_queue_admin_all" ON cadence_queue
    FOR ALL USING (public.is_admin());

-- Permitir service role inserir/atualizar (para Edge Functions)
CREATE POLICY "cadence_queue_service_role" ON cadence_queue
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- cadence_event_log: Usuário vê logs de seus cards, admin vê tudo
-- ============================================================================

CREATE POLICY "cadence_event_log_select" ON cadence_event_log
    FOR SELECT USING (
        (card_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = auth.uid()
        ))
        OR public.is_admin()
    );

-- Permitir inserção para triggers e Edge Functions
CREATE POLICY "cadence_event_log_insert" ON cadence_event_log
    FOR INSERT WITH CHECK (true);

CREATE POLICY "cadence_event_log_service_role" ON cadence_event_log
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- cadence_dead_letter: Apenas admins
-- ============================================================================

CREATE POLICY "cadence_dead_letter_admin_all" ON cadence_dead_letter
    FOR ALL USING (public.is_admin());

CREATE POLICY "cadence_dead_letter_service_role" ON cadence_dead_letter
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- cadence_event_triggers: Admins podem tudo, outros veem triggers ativos
-- ============================================================================

CREATE POLICY "cadence_event_triggers_select_active" ON cadence_event_triggers
    FOR SELECT USING (is_active = true);

CREATE POLICY "cadence_event_triggers_admin_all" ON cadence_event_triggers
    FOR ALL USING (public.is_admin());

-- ============================================================================
-- PARTE 4: TRIGGERS DE ATUALIZAÇÃO
-- ============================================================================

-- Trigger para updated_at em cadence_templates
CREATE OR REPLACE FUNCTION update_cadence_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadence_templates_updated_at ON cadence_templates;
CREATE TRIGGER trg_cadence_templates_updated_at
    BEFORE UPDATE ON cadence_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_cadence_templates_updated_at();

-- Trigger para updated_at em cadence_event_triggers
DROP TRIGGER IF EXISTS trg_cadence_event_triggers_updated_at ON cadence_event_triggers;
CREATE TRIGGER trg_cadence_event_triggers_updated_at
    BEFORE UPDATE ON cadence_event_triggers
    FOR EACH ROW
    EXECUTE FUNCTION update_cadence_templates_updated_at();

-- ============================================================================
-- PARTE 5: COMMENTS PARA DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE cadence_templates IS 'Templates reutilizáveis de cadência de vendas';
COMMENT ON TABLE cadence_steps IS 'Steps individuais de uma cadência (task, wait, branch, end)';
COMMENT ON TABLE cadence_instances IS 'Instâncias de cadência aplicadas a cards específicos';
COMMENT ON TABLE cadence_queue IS 'Fila de execução de steps pendentes';
COMMENT ON TABLE cadence_event_log IS 'Log de todos os eventos da cadência para auditoria';
COMMENT ON TABLE cadence_dead_letter IS 'Fila de erros que precisam de intervenção manual';
COMMENT ON TABLE cadence_event_triggers IS 'Configuração de triggers para auto-complete e movimentação';

COMMENT ON COLUMN cadence_steps.task_config IS 'Config para tipo=task: {tipo, titulo, prioridade, assign_to}';
COMMENT ON COLUMN cadence_steps.wait_config IS 'Config para tipo=wait: {duration_minutes, duration_type: business|calendar}';
COMMENT ON COLUMN cadence_steps.branch_config IS 'Config para tipo=branch: {branches: [{condition, target_step_key}]}';
COMMENT ON COLUMN cadence_steps.end_config IS 'Config para tipo=end: {result, move_to_stage_id, motivo_perda_id}';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
