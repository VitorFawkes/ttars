-- ========================================
-- WORKFLOW ENGINE v2.1 - MIGRATION
-- ========================================

-- Tabela principal de workflows
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    
    -- Trigger configuration
    trigger_type TEXT NOT NULL, -- 'stage_enter', 'stage_exit', 'task_outcome', 'field_changed'
    trigger_config JSONB NOT NULL DEFAULT '{}',
    
    -- Scope
    pipeline_id UUID REFERENCES pipelines(id),
    
    -- State
    is_active BOOLEAN DEFAULT false,
    is_draft BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id)
);

-- Nodes no workflow (DAG vertices)
CREATE TABLE IF NOT EXISTS workflow_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Node identity
    node_key TEXT NOT NULL, -- Unique within workflow (e.g., 'node_1', 'trigger')
    
    -- Node type
    node_type TEXT NOT NULL, -- 'trigger', 'action', 'condition', 'wait', 'end'
    
    -- Action config (for node_type = 'action')
    action_type TEXT, -- 'create_task', 'move_card', 'notify', 'update_field'
    action_config JSONB DEFAULT '{}',
    
    -- Condition config (for node_type = 'condition')
    condition_config JSONB DEFAULT '{}',
    
    -- Wait config (for node_type = 'wait')
    wait_config JSONB DEFAULT '{}',
    
    -- Visual builder position
    position_x INT DEFAULT 0,
    position_y INT DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(workflow_id, node_key)
);

-- Edges no workflow (DAG connections)
CREATE TABLE IF NOT EXISTS workflow_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    
    -- Connection
    source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
    
    -- Edge condition (for branching)
    condition JSONB DEFAULT '{}', -- e.g., {"operator": "equals", "field": "task_outcome", "value": "atendeu"}
    label TEXT, -- Visual label: "Atendeu", "Não Atendeu"
    
    -- Ordering for multiple edges from same source
    edge_order INT DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Instâncias ativas de workflow (running for a specific card)
CREATE TABLE IF NOT EXISTS workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    
    -- Current state
    current_node_id UUID REFERENCES workflow_nodes(id),
    status TEXT DEFAULT 'running', -- 'running', 'waiting', 'completed', 'cancelled', 'failed'
    
    -- Waiting state
    waiting_for TEXT, -- 'task_outcome', 'time', 'field_change'
    waiting_task_id UUID REFERENCES tarefas(id),
    resume_at TIMESTAMPTZ,
    
    -- Context (variables accumulated during execution)
    context JSONB DEFAULT '{}',
    
    -- Lifecycle
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Prevent duplicate instances
    UNIQUE(workflow_id, card_id, status) -- Only one running instance per card/workflow
);

-- Fila de execução (processed by Edge Function)
CREATE TABLE IF NOT EXISTS workflow_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    
    -- Scheduling
    execute_at TIMESTAMPTZ NOT NULL,
    priority INT DEFAULT 0, -- Higher = execute first
    
    -- Processing state
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT,
    
    -- Action to execute
    node_id UUID REFERENCES workflow_nodes(id),
    action_payload JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Log de execução (audit trail)
CREATE TABLE IF NOT EXISTS workflow_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES workflow_instances(id) ON DELETE SET NULL,
    workflow_id UUID REFERENCES workflows(id),
    card_id UUID REFERENCES cards(id),
    
    -- Event details
    event_type TEXT NOT NULL, -- 'started', 'node_entered', 'action_executed', 'condition_evaluated', 'completed', 'failed'
    node_id UUID REFERENCES workflow_nodes(id),
    
    -- Data
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT now(),
    duration_ms INT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workflow_queue_pending ON workflow_queue(execute_at, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_workflow_instances_running ON workflow_instances(status) WHERE status IN ('running', 'waiting');
CREATE INDEX IF NOT EXISTS idx_workflow_log_instance ON workflow_log(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow ON workflow_edges(workflow_id);

-- RLS Policies
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_log ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY "Authenticated users can manage workflows" ON workflows
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage nodes" ON workflow_nodes
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage edges" ON workflow_edges
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage instances" ON workflow_instances
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage queue" ON workflow_queue
    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read logs" ON workflow_log
    FOR SELECT USING (auth.role() = 'authenticated');

-- Task Outcomes Standardization
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS outcome TEXT;

CREATE TABLE IF NOT EXISTS task_type_outcomes (
    tipo TEXT NOT NULL,
    outcome_key TEXT NOT NULL,
    outcome_label TEXT NOT NULL,
    ordem INT DEFAULT 0,
    is_success BOOLEAN DEFAULT false,
    PRIMARY KEY (tipo, outcome_key)
);

ALTER TABLE task_type_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read outcomes" ON task_type_outcomes
    FOR SELECT USING (auth.role() = 'authenticated');

-- Populate standard outcomes
INSERT INTO task_type_outcomes (tipo, outcome_key, outcome_label, ordem, is_success) VALUES
    ('ligacao', 'atendeu', 'Atendeu', 1, true),
    ('ligacao', 'nao_atendeu', 'Não Atendeu', 2, false),
    ('ligacao', 'caixa_postal', 'Caixa Postal', 3, false),
    ('ligacao', 'numero_invalido', 'Número Inválido', 4, false),
    ('reuniao', 'realizada', 'Realizada', 1, true),
    ('reuniao', 'nao_compareceu', 'Não Compareceu', 2, false),
    ('reuniao', 'remarcada', 'Remarcada', 3, false),
    ('reuniao', 'cancelada', 'Cancelada', 4, false),
    ('whatsapp', 'enviado', 'Enviado', 1, true),
    ('whatsapp', 'visualizado', 'Visualizado', 2, true),
    ('whatsapp', 'respondido', 'Respondido', 3, true),
    ('email', 'enviado', 'Enviado', 1, true),
    ('email', 'falhou', 'Falhou', 2, false),
    ('followup', 'realizado', 'Realizado', 1, true),
    ('followup', 'sem_resposta', 'Sem Resposta', 2, false)
ON CONFLICT (tipo, outcome_key) DO NOTHING;

-- Trigger Function: Stage Change
CREATE OR REPLACE FUNCTION trigger_workflow_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    v_workflow RECORD;
    v_trigger_node RECORD;
    v_instance_id UUID;
BEGIN
    -- Only process if stage actually changed
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
        -- Find all active workflows triggered by stage_enter for this stage
        FOR v_workflow IN
            SELECT w.id, w.trigger_config
            FROM workflows w
            WHERE w.is_active = true
              AND w.trigger_type = 'stage_enter'
              AND (w.trigger_config->>'stage_id')::UUID = NEW.pipeline_stage_id
              AND (w.pipeline_id IS NULL OR w.pipeline_id = NEW.pipeline_id)
        LOOP
            -- Check if there's already a running instance for this workflow/card
            IF NOT EXISTS (
                SELECT 1 FROM workflow_instances
                WHERE workflow_id = v_workflow.id
                  AND card_id = NEW.id
                  AND status IN ('running', 'waiting')
            ) THEN
                -- Find the trigger node
                SELECT * INTO v_trigger_node
                FROM workflow_nodes
                WHERE workflow_id = v_workflow.id
                  AND node_type = 'trigger'
                LIMIT 1;
                
                IF v_trigger_node.id IS NOT NULL THEN
                    -- Create new workflow instance
                    INSERT INTO workflow_instances (
                        workflow_id, card_id, current_node_id, status, context
                    ) VALUES (
                        v_workflow.id,
                        NEW.id,
                        v_trigger_node.id,
                        'running',
                        jsonb_build_object(
                            'trigger_stage_id', NEW.pipeline_stage_id,
                            'trigger_stage_from', OLD.pipeline_stage_id,
                            'card_owner_id', NEW.responsavel_id
                        )
                    ) RETURNING id INTO v_instance_id;
                    
                    -- Queue for immediate processing
                    INSERT INTO workflow_queue (instance_id, execute_at, node_id, priority)
                    VALUES (v_instance_id, now(), v_trigger_node.id, 10);
                    
                    -- Log
                    INSERT INTO workflow_log (instance_id, workflow_id, card_id, event_type, node_id)
                    VALUES (v_instance.id, v_workflow.id, NEW.id, 'started', v_trigger_node.id);
                END IF;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_workflow_stage_change ON cards;
CREATE TRIGGER trg_workflow_stage_change
    AFTER UPDATE OF pipeline_stage_id ON cards
    FOR EACH ROW
    EXECUTE FUNCTION trigger_workflow_on_stage_change();

-- Trigger Function: Task Outcome
CREATE OR REPLACE FUNCTION trigger_workflow_on_task_outcome()
RETURNS TRIGGER AS $$
DECLARE
    v_instance RECORD;
    v_next_edge RECORD;
    v_next_node RECORD;
BEGIN
    -- Only process if task was just completed with an outcome
    IF NEW.concluida = true AND OLD.concluida = false AND NEW.outcome IS NOT NULL THEN
        -- Find any workflow instances waiting for this task's outcome
        FOR v_instance IN
            SELECT wi.*
            FROM workflow_instances wi
            WHERE wi.status = 'waiting'
              AND wi.waiting_for = 'task_outcome'
              AND wi.waiting_task_id = NEW.id
        LOOP
            -- Find the edge that matches this outcome
            SELECT we.* INTO v_next_edge
            FROM workflow_edges we
            WHERE we.source_node_id = v_instance.current_node_id
              AND (
                  we.condition->>'value' = NEW.outcome
                  OR we.condition->>'type' = 'default'
              )
            ORDER BY 
                CASE WHEN we.condition->>'value' = NEW.outcome THEN 0 ELSE 1 END,
                we.edge_order
            LIMIT 1;
            
            IF v_next_edge.id IS NOT NULL THEN
                -- Get the target node
                SELECT * INTO v_next_node
                FROM workflow_nodes
                WHERE id = v_next_edge.target_node_id;
                
                -- Update instance
                UPDATE workflow_instances
                SET current_node_id = v_next_node.id,
                    status = 'running',
                    waiting_for = NULL,
                    waiting_task_id = NULL,
                    context = context || jsonb_build_object(
                        'last_task_id', NEW.id,
                        'last_task_outcome', NEW.outcome
                    )
                WHERE id = v_instance.id;
                
                -- Queue for processing
                INSERT INTO workflow_queue (instance_id, execute_at, node_id, priority)
                VALUES (v_instance.id, now(), v_next_node.id, 10);
                
                -- Log
                INSERT INTO workflow_log (instance_id, workflow_id, card_id, event_type, node_id, input_data)
                VALUES (
                    v_instance.id, 
                    v_instance.workflow_id, 
                    v_instance.card_id, 
                    'condition_evaluated',
                    v_instance.current_node_id,
                    jsonb_build_object('outcome', NEW.outcome, 'matched_edge', v_next_edge.label)
                );
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_workflow_task_outcome ON tarefas;
CREATE TRIGGER trg_workflow_task_outcome
    AFTER UPDATE OF concluida, outcome ON tarefas
    FOR EACH ROW
    EXECUTE FUNCTION trigger_workflow_on_task_outcome();
