-- ============================================================================
-- AUTO-START: Iniciar Cadência SDR Automaticamente para Novos Cards
-- ============================================================================
-- Este trigger inicia automaticamente a cadência de prospecção SDR quando
-- um novo card é criado em um stage da fase SDR.
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_start_cadence_for_new_card()
RETURNS TRIGGER AS $$
DECLARE
    v_template_id UUID;
    v_first_step_id UUID;
    v_instance_id UUID;
    v_stage_fase TEXT;
BEGIN
    -- Só para cards novos
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- Buscar fase do stage
    SELECT ps.fase INTO v_stage_fase
    FROM pipeline_stages ps
    WHERE ps.id = NEW.pipeline_stage_id;

    -- Só iniciar cadência se stage é SDR
    IF v_stage_fase != 'SDR' THEN
        RETURN NEW;
    END IF;

    -- Buscar cadência de prospecção SDR (a padrão)
    SELECT id INTO v_template_id
    FROM cadence_templates
    WHERE target_audience = 'sdr'
    AND name ILIKE '%Prospecção%'
    AND is_active = true
    LIMIT 1;

    IF v_template_id IS NULL THEN
        -- Se não encontrar específica, buscar qualquer SDR ativa
        SELECT id INTO v_template_id
        FROM cadence_templates
        WHERE target_audience = 'sdr'
        AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_template_id IS NULL THEN
        -- Nenhuma cadência SDR configurada
        RETURN NEW;
    END IF;

    -- Criar instância de cadência
    INSERT INTO cadence_instances (
        template_id,
        card_id,
        status,
        started_at
    ) VALUES (
        v_template_id,
        NEW.id,
        'active',
        NOW()
    )
    RETURNING id INTO v_instance_id;

    -- Buscar primeiro step da cadência
    SELECT id INTO v_first_step_id
    FROM cadence_steps
    WHERE template_id = v_template_id
    ORDER BY step_order ASC
    LIMIT 1;

    IF v_first_step_id IS NOT NULL THEN
        -- Enfileirar primeiro step para execução imediata
        INSERT INTO cadence_queue (
            instance_id,
            step_id,
            execute_at,
            priority,
            status
        ) VALUES (
            v_instance_id,
            v_first_step_id,
            NOW(),
            10,  -- Alta prioridade
            'pending'
        );
    END IF;

    -- Log do evento
    INSERT INTO cadence_event_log (
        instance_id,
        card_id,
        event_type,
        event_source,
        event_data,
        action_taken,
        action_result
    ) VALUES (
        v_instance_id,
        NEW.id,
        'cadence_started',
        'auto_trigger',
        jsonb_build_object(
            'trigger', 'card_insert',
            'stage_id', NEW.pipeline_stage_id,
            'stage_fase', v_stage_fase,
            'template_id', v_template_id
        ),
        'start_cadence',
        jsonb_build_object(
            'instance_id', v_instance_id,
            'first_step_id', v_first_step_id
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_auto_start_cadence_on_card_insert ON cards;
CREATE TRIGGER trg_auto_start_cadence_on_card_insert
    AFTER INSERT ON cards
    FOR EACH ROW
    EXECUTE FUNCTION auto_start_cadence_for_new_card();

-- Comentário
COMMENT ON FUNCTION auto_start_cadence_for_new_card() IS
'Inicia automaticamente a cadência SDR de Prospecção quando um novo card é criado em stage SDR';


-- ============================================================================
-- BACKFILL: Iniciar Cadência para Cards Existentes em "Novo Lead"
-- ============================================================================

DO $$
DECLARE
    v_template_id UUID;
    v_first_step_id UUID;
    v_card RECORD;
    v_instance_id UUID;
    v_count INT := 0;
BEGIN
    -- Buscar cadência SDR Prospecção
    SELECT id INTO v_template_id
    FROM cadence_templates
    WHERE target_audience = 'sdr'
    AND name ILIKE '%Prospecção%'
    AND is_active = true
    LIMIT 1;

    IF v_template_id IS NULL THEN
        RAISE NOTICE 'Cadência SDR Prospecção não encontrada, pulando backfill';
        RETURN;
    END IF;

    -- Buscar primeiro step
    SELECT id INTO v_first_step_id
    FROM cadence_steps
    WHERE template_id = v_template_id
    ORDER BY step_order
    LIMIT 1;

    IF v_first_step_id IS NULL THEN
        RAISE NOTICE 'Nenhum step encontrado para a cadência, pulando backfill';
        RETURN;
    END IF;

    -- Loop por todos os cards em stages SDR
    FOR v_card IN
        SELECT c.id, c.titulo
        FROM cards c
        JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
        WHERE ps.fase = 'SDR'
        AND c.deleted_at IS NULL
        -- Excluir cards que já têm cadência ativa
        AND NOT EXISTS (
            SELECT 1 FROM cadence_instances ci
            WHERE ci.card_id = c.id
            AND ci.status IN ('active', 'waiting_task', 'paused')
        )
    LOOP
        -- Criar instância
        INSERT INTO cadence_instances (template_id, card_id, status)
        VALUES (v_template_id, v_card.id, 'active')
        RETURNING id INTO v_instance_id;

        -- Enfileirar primeiro step
        INSERT INTO cadence_queue (instance_id, step_id, execute_at, priority)
        VALUES (v_instance_id, v_first_step_id, NOW(), 10);

        -- Log
        INSERT INTO cadence_event_log (instance_id, card_id, event_type, event_source, action_taken)
        VALUES (v_instance_id, v_card.id, 'cadence_started', 'migration_backfill', 'start_cadence');

        v_count := v_count + 1;
        RAISE NOTICE 'Cadência iniciada para card: % (%)', v_card.titulo, v_card.id;
    END LOOP;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'BACKFILL CONCLUÍDO: % cadências iniciadas', v_count;
    RAISE NOTICE '==========================================';
END $$;
