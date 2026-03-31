-- ============================================================================
-- CADENCE ENGINE v4 - Sistema Flexível de Regras de Cadência
-- ============================================================================
-- Adiciona:
-- 1. Suporte a padrão de dias (day_pattern)
-- 2. Controle de pré-requisitos (requires_previous_completed)
-- 3. Campos adicionais para cadence_event_triggers
-- 4. Triggers de banco para processar regras automaticamente
-- ============================================================================

-- ============================================================================
-- PARTE 1: MELHORIAS EM cadence_templates
-- ============================================================================

-- Padrão de dias (ex: {"days": [1,2,3,5,8], "description": "3 on, 1 off, 1 on, 2 off"})
ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS day_pattern JSONB DEFAULT NULL;

-- Modo de agendamento: 'interval' (minutos entre steps) ou 'day_pattern' (dias específicos)
ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS schedule_mode TEXT DEFAULT 'interval'
CHECK (schedule_mode IN ('interval', 'day_pattern'));

-- Requer conclusão do step anterior para avançar (global do template)
ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS require_completion_for_next BOOLEAN DEFAULT true;

-- Horário comercial customizável
ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS business_hours_start INT DEFAULT 9
CHECK (business_hours_start >= 0 AND business_hours_start <= 23);

ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS business_hours_end INT DEFAULT 18
CHECK (business_hours_end >= 0 AND business_hours_end <= 23);

-- Dias da semana permitidos (1=segunda, 7=domingo)
ALTER TABLE cadence_templates
ADD COLUMN IF NOT EXISTS allowed_weekdays INT[] DEFAULT '{1,2,3,4,5}';

COMMENT ON COLUMN cadence_templates.day_pattern IS 'Padrão de dias para cadência: {"days": [1,2,3,5,8], "description": "..."}';
COMMENT ON COLUMN cadence_templates.schedule_mode IS 'Modo de agendamento: interval (minutos) ou day_pattern (dias)';
COMMENT ON COLUMN cadence_templates.require_completion_for_next IS 'Se true, próximo step só executa após conclusão do anterior';
COMMENT ON COLUMN cadence_templates.allowed_weekdays IS 'Dias da semana permitidos (1=seg, 7=dom)';

-- ============================================================================
-- PARTE 2: MELHORIAS EM cadence_steps
-- ============================================================================

-- Dia em que o step deve executar (0 = dia 1, 4 = dia 5)
ALTER TABLE cadence_steps
ADD COLUMN IF NOT EXISTS day_offset INT DEFAULT NULL;

-- Override: este step específico requer conclusão do anterior?
ALTER TABLE cadence_steps
ADD COLUMN IF NOT EXISTS requires_previous_completed BOOLEAN DEFAULT true;

-- Horário específico do dia para executar (em minutos desde meia-noite, ex: 540 = 9h)
ALTER TABLE cadence_steps
ADD COLUMN IF NOT EXISTS time_of_day_minutes INT DEFAULT NULL;

-- Condições de visibilidade (quando este step deve aparecer)
ALTER TABLE cadence_steps
ADD COLUMN IF NOT EXISTS visibility_conditions JSONB DEFAULT '[]';

COMMENT ON COLUMN cadence_steps.day_offset IS 'Dia do step (0=dia1, 4=dia5). Usado com schedule_mode=day_pattern';
COMMENT ON COLUMN cadence_steps.requires_previous_completed IS 'Se true, só executa após tarefa anterior ser concluída';
COMMENT ON COLUMN cadence_steps.time_of_day_minutes IS 'Horário específico em minutos (540=9h, 600=10h)';
COMMENT ON COLUMN cadence_steps.visibility_conditions IS 'Condições para o step aparecer';

-- ============================================================================
-- PARTE 3: MELHORIAS EM cadence_event_triggers (tabela existe, adicionar campos)
-- ============================================================================

-- Nome legível da regra
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS name TEXT;

-- Template alvo para action_type='start_cadence'
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS target_template_id UUID REFERENCES cadence_templates(id) ON DELETE SET NULL;

-- Configuração de tarefa para action_type='create_task'
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS task_config JSONB DEFAULT '{}';

-- Delay antes de executar a ação
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS delay_minutes INT DEFAULT 0;

-- Tipo de delay: 'business' (horário útil) ou 'calendar' (corrido)
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS delay_type TEXT DEFAULT 'calendar'
CHECK (delay_type IN ('business', 'calendar'));

-- Stages onde a regra se aplica (para event_type='stage_enter' ou 'card_created')
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS applicable_stage_ids UUID[];

-- Pipelines onde a regra se aplica
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS applicable_pipeline_ids UUID[];

COMMENT ON COLUMN cadence_event_triggers.name IS 'Nome legível da regra';
COMMENT ON COLUMN cadence_event_triggers.target_template_id IS 'Template a iniciar (para action=start_cadence)';
COMMENT ON COLUMN cadence_event_triggers.task_config IS 'Config da tarefa (para action=create_task): {tipo, titulo, prioridade}';
COMMENT ON COLUMN cadence_event_triggers.delay_minutes IS 'Minutos de delay antes de executar';
COMMENT ON COLUMN cadence_event_triggers.delay_type IS 'Tipo de delay: business (útil) ou calendar (corrido)';

-- ============================================================================
-- PARTE 4: ÍNDICES PARA PERFORMANCE
-- ============================================================================

-- Índice para busca de regras por stage
CREATE INDEX IF NOT EXISTS idx_cadence_event_triggers_stages
ON cadence_event_triggers USING GIN (applicable_stage_ids);

-- Índice para busca de regras por pipeline
CREATE INDEX IF NOT EXISTS idx_cadence_event_triggers_pipelines
ON cadence_event_triggers USING GIN (applicable_pipeline_ids);

-- Índice para busca de regras ativas por tipo de evento
CREATE INDEX IF NOT EXISTS idx_cadence_event_triggers_active_event
ON cadence_event_triggers (event_type, is_active)
WHERE is_active = true;

-- ============================================================================
-- PARTE 5: TABELA DE FILA PARA REGRAS DE ENTRADA
-- ============================================================================

-- Fila para processar regras de entrada (separada da cadence_queue)
CREATE TABLE IF NOT EXISTS cadence_entry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Contexto do evento
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    trigger_id UUID NOT NULL REFERENCES cadence_event_triggers(id) ON DELETE CASCADE,

    -- Dados do evento que disparou
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',

    -- Agendamento
    execute_at TIMESTAMPTZ NOT NULL,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

    -- Retry
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_error TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Índices para processamento eficiente
CREATE INDEX IF NOT EXISTS idx_cadence_entry_queue_pending
ON cadence_entry_queue (execute_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cadence_entry_queue_card
ON cadence_entry_queue (card_id);

COMMENT ON TABLE cadence_entry_queue IS 'Fila para processar regras de entrada de cadência';

-- ============================================================================
-- PARTE 6: FUNÇÃO PARA PROCESSAR ENTRADA DE CARD EM STAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_execute_at TIMESTAMPTZ;
    v_card_pipeline_id UUID;
BEGIN
    -- Só processa se houve mudança de stage
    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN

        -- Buscar pipeline do card
        SELECT pipeline_id INTO v_card_pipeline_id
        FROM pipeline_stages
        WHERE id = NEW.pipeline_stage_id;

        -- Buscar regras de entrada aplicáveis
        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'stage_enter'
            AND is_active = true
            AND (
                -- Stage específico ou qualquer stage
                applicable_stage_ids IS NULL
                OR array_length(applicable_stage_ids, 1) IS NULL
                OR NEW.pipeline_stage_id = ANY(applicable_stage_ids)
            )
            AND (
                -- Pipeline específico ou qualquer pipeline
                applicable_pipeline_ids IS NULL
                OR array_length(applicable_pipeline_ids, 1) IS NULL
                OR v_card_pipeline_id = ANY(applicable_pipeline_ids)
            )
        LOOP
            -- Calcular horário de execução
            IF v_trigger.delay_minutes = 0 THEN
                v_execute_at := now();
            ELSIF v_trigger.delay_type = 'calendar' THEN
                v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
            ELSE
                -- Business hours delay será calculado pela Edge Function
                v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
            END IF;

            -- Inserir na fila de processamento
            INSERT INTO cadence_entry_queue (
                card_id,
                trigger_id,
                event_type,
                event_data,
                execute_at
            ) VALUES (
                NEW.id,
                v_trigger.id,
                'stage_enter',
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'pipeline_id', v_card_pipeline_id
                ),
                v_execute_at
            );

            -- Log do evento
            INSERT INTO cadence_event_log (
                card_id,
                event_type,
                event_source,
                event_data,
                action_taken
            ) VALUES (
                NEW.id,
                'entry_rule_triggered',
                'db_trigger',
                jsonb_build_object(
                    'trigger_id', v_trigger.id,
                    'trigger_name', v_trigger.name,
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id
                ),
                'queued_for_processing'
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger se existir e recriar
DROP TRIGGER IF EXISTS trg_cadence_entry_on_stage_change ON cards;
CREATE TRIGGER trg_cadence_entry_on_stage_change
    AFTER UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION process_cadence_entry_on_stage_change();

-- ============================================================================
-- PARTE 7: FUNÇÃO PARA PROCESSAR CRIAÇÃO DE CARD
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_create()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_execute_at TIMESTAMPTZ;
    v_card_pipeline_id UUID;
BEGIN
    -- Buscar pipeline do card
    SELECT pipeline_id INTO v_card_pipeline_id
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Buscar regras de entrada aplicáveis para criação
    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'card_created'
        AND is_active = true
        AND (
            -- Stage específico ou qualquer stage
            applicable_stage_ids IS NULL
            OR array_length(applicable_stage_ids, 1) IS NULL
            OR NEW.pipeline_stage_id = ANY(applicable_stage_ids)
        )
        AND (
            -- Pipeline específico ou qualquer pipeline
            applicable_pipeline_ids IS NULL
            OR array_length(applicable_pipeline_ids, 1) IS NULL
            OR v_card_pipeline_id = ANY(applicable_pipeline_ids)
        )
    LOOP
        -- Calcular horário de execução
        IF v_trigger.delay_minutes = 0 THEN
            v_execute_at := now();
        ELSIF v_trigger.delay_type = 'calendar' THEN
            v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
        ELSE
            v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
        END IF;

        -- Inserir na fila de processamento
        INSERT INTO cadence_entry_queue (
            card_id,
            trigger_id,
            event_type,
            event_data,
            execute_at
        ) VALUES (
            NEW.id,
            v_trigger.id,
            'card_created',
            jsonb_build_object(
                'stage_id', NEW.pipeline_stage_id,
                'pipeline_id', v_card_pipeline_id,
                'owner_id', NEW.dono_atual_id
            ),
            v_execute_at
        );

        -- Log do evento
        INSERT INTO cadence_event_log (
            card_id,
            event_type,
            event_source,
            event_data,
            action_taken
        ) VALUES (
            NEW.id,
            'entry_rule_triggered',
            'db_trigger',
            jsonb_build_object(
                'trigger_id', v_trigger.id,
                'trigger_name', v_trigger.name,
                'stage_id', NEW.pipeline_stage_id
            ),
            'queued_for_processing'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger se existir e recriar
DROP TRIGGER IF EXISTS trg_cadence_entry_on_card_create ON cards;
CREATE TRIGGER trg_cadence_entry_on_card_create
    AFTER INSERT ON cards
    FOR EACH ROW
    EXECUTE FUNCTION process_cadence_entry_on_card_create();

-- ============================================================================
-- PARTE 8: RLS PARA NOVAS TABELAS
-- ============================================================================

ALTER TABLE cadence_entry_queue ENABLE ROW LEVEL SECURITY;

-- Admins podem tudo
CREATE POLICY "cadence_entry_queue_admin_all" ON cadence_entry_queue
    FOR ALL USING (public.is_admin());

-- Service role pode tudo (para Edge Functions)
CREATE POLICY "cadence_entry_queue_service_role" ON cadence_entry_queue
    FOR ALL USING (auth.role() = 'service_role');

-- Usuários podem ver fila de seus cards
CREATE POLICY "cadence_entry_queue_owner_select" ON cadence_entry_queue
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = auth.uid()
        )
    );

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
