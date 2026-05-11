-- ============================================================================
-- WHATSAPP AUTO-COMPLETE TRIGGER
-- ============================================================================
-- Este trigger reage a mensagens WhatsApp para:
-- 1. Auto-completar tarefas de contato pendentes
-- 2. Mover cards automaticamente no funil SDR
--
-- REGRAS DO FUNIL SDR:
-- - OUTBOUND em "Novo Lead" → Move para "Tentativa de Contato"
-- - INBOUND em "Novo Lead" → Move para "Conectado"
-- - INBOUND em "Tentativa de Contato" → Move para "Conectado"
-- - Stages após "Conectado" não movem automaticamente
-- ============================================================================

-- IDs dos stages SDR (constantes para referência)
-- Novo Lead: 46c2cc2e-e9cb-4255-b889-3ee4d1248ba9
-- Tentativa de Contato: f5df9be4-882f-4e54-b8f9-49782889b63e
-- Conectado: 163da577-e33f-424d-85b9-732317138eea

-- ============================================================================
-- FUNÇÃO PRINCIPAL: auto_complete_contato_task
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_complete_contato_task()
RETURNS TRIGGER AS $$
DECLARE
    v_card RECORD;
    v_pending_task RECORD;
    v_outcome TEXT;
    v_target_stage_id UUID;
    v_should_move BOOLEAN := false;
    v_target_stage_name TEXT;

    -- IDs dos stages SDR (hardcoded por segurança)
    c_novo_lead UUID := '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9';
    c_tentativa_contato UUID := 'f5df9be4-882f-4e54-b8f9-49782889b63e';
    c_conectado UUID := '163da577-e33f-424d-85b9-732317138eea';
BEGIN
    -- Validar que temos card_id
    IF NEW.card_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 1. Buscar card e stage atual
    SELECT
        c.*,
        ps.ordem as stage_ordem,
        ps.nome as stage_nome,
        ps.id as stage_id
    INTO v_card
    FROM cards c
    LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.id = NEW.card_id;

    IF v_card IS NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Determinar outcome baseado na direção
    IF NEW.direction = 'inbound' THEN
        v_outcome := 'respondido_pelo_cliente';
    ELSE
        v_outcome := 'enviado_por_nos';
    END IF;

    -- 3. Buscar tarefa pendente do tipo 'contato' com TODAS as condições:
    --    a) Mesmo card_id
    --    b) Tipo = 'contato'
    --    c) Não concluída
    --    d) Criada ANTES da mensagem
    --    e) Card ainda está no MESMO STAGE onde tarefa foi criada (se metadata existir)
    SELECT t.* INTO v_pending_task
    FROM tarefas t
    WHERE t.card_id = NEW.card_id
      AND t.tipo = 'contato'
      AND t.concluida = false
      AND t.deleted_at IS NULL
      AND t.created_at < NEW.created_at  -- Tarefa criada ANTES da mensagem
      AND (
          -- Stage onde tarefa foi criada = stage atual do card
          (t.metadata->>'created_at_stage_id')::UUID = v_card.stage_id
          -- OU não tem metadata (backward compatibility)
          OR t.metadata->>'created_at_stage_id' IS NULL
          OR t.metadata->>'created_at_stage_id' = ''
      )
    ORDER BY t.data_vencimento ASC NULLS LAST, t.created_at ASC
    LIMIT 1;

    -- 4. Se encontrou tarefa válida, marcar como concluída
    IF v_pending_task.id IS NOT NULL THEN
        UPDATE tarefas
        SET
            concluida = true,
            outcome = v_outcome,
            concluida_em = NEW.created_at,
            metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
                'auto_completed_by', 'whatsapp_message',
                'auto_completed_at', NEW.created_at::TEXT,
                'whatsapp_message_id', NEW.id::TEXT,
                'whatsapp_direction', NEW.direction
            ),
            updated_at = NOW()
        WHERE id = v_pending_task.id;

        -- Incrementar contador de contatos na cadência (se houver)
        UPDATE cadence_instances ci
        SET
            total_contacts_attempted = total_contacts_attempted + 1,
            successful_contacts = CASE
                WHEN v_outcome = 'respondido_pelo_cliente'
                THEN successful_contacts + 1
                ELSE successful_contacts
            END,
            updated_at = NOW()
        WHERE ci.card_id = NEW.card_id
          AND ci.status IN ('active', 'waiting_task');
    END IF;

    -- 5. LÓGICA DE MOVIMENTAÇÃO DO FUNIL (apenas SDR)
    -- Regra: só avança, nunca retrocede

    IF v_card.stage_id = c_novo_lead THEN
        -- Card em "Novo Lead"
        IF NEW.direction = 'outbound' THEN
            -- Nós enviamos → Move para "Tentativa de Contato"
            v_target_stage_id := c_tentativa_contato;
            v_target_stage_name := 'Tentativa de Contato';
            v_should_move := true;
        ELSIF NEW.direction = 'inbound' THEN
            -- Cliente respondeu → Move direto para "Conectado"
            v_target_stage_id := c_conectado;
            v_target_stage_name := 'Conectado';
            v_should_move := true;
        END IF;

    ELSIF v_card.stage_id = c_tentativa_contato THEN
        -- Card em "Tentativa de Contato"
        IF NEW.direction = 'inbound' THEN
            -- Cliente respondeu → Move para "Conectado"
            v_target_stage_id := c_conectado;
            v_target_stage_name := 'Conectado';
            v_should_move := true;
        END IF;
        -- OUTBOUND aqui NÃO move (já está tentando contato)
    END IF;

    -- Stages após "Conectado" não movem automaticamente por mensagem

    -- 6. Executar movimentação se necessário
    IF v_should_move AND v_target_stage_id IS NOT NULL THEN
        -- Atualizar o card
        UPDATE cards
        SET
            pipeline_stage_id = v_target_stage_id,
            updated_at = NOW()
        WHERE id = NEW.card_id;

        -- Log da movimentação automática
        INSERT INTO cadence_event_log (
            card_id,
            event_type,
            event_source,
            event_data,
            action_taken,
            action_result
        ) VALUES (
            NEW.card_id,
            'auto_stage_move',
            'whatsapp_trigger',
            jsonb_build_object(
                'message_id', NEW.id,
                'message_direction', NEW.direction,
                'from_stage_id', v_card.stage_id,
                'from_stage_name', v_card.stage_nome,
                'trigger_reason', CASE
                    WHEN NEW.direction = 'outbound' THEN 'outbound_message_sent'
                    ELSE 'inbound_message_received'
                END
            ),
            'move_card',
            jsonb_build_object(
                'to_stage_id', v_target_stage_id,
                'to_stage_name', v_target_stage_name,
                'success', true
            )
        );
    END IF;

    -- 7. Log do evento de mensagem (sempre)
    INSERT INTO cadence_event_log (
        card_id,
        event_type,
        event_source,
        event_data,
        action_taken,
        action_result
    ) VALUES (
        NEW.card_id,
        CASE WHEN NEW.direction = 'inbound' THEN 'whatsapp_inbound' ELSE 'whatsapp_outbound' END,
        'whatsapp_webhook',
        jsonb_build_object(
            'message_id', NEW.id,
            'direction', NEW.direction,
            'from_number', NEW.from_number,
            'card_stage', v_card.stage_nome
        ),
        CASE WHEN v_pending_task.id IS NOT NULL THEN 'complete_task' ELSE 'none' END,
        CASE
            WHEN v_pending_task.id IS NOT NULL
            THEN jsonb_build_object(
                'task_id', v_pending_task.id,
                'task_titulo', v_pending_task.titulo,
                'outcome', v_outcome
            )
            ELSE jsonb_build_object('reason', 'no_pending_task_found')
        END
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CRIAR O TRIGGER
-- ============================================================================

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trg_whatsapp_auto_complete_task ON whatsapp_messages;

-- Criar novo trigger
CREATE TRIGGER trg_whatsapp_auto_complete_task
    AFTER INSERT ON whatsapp_messages
    FOR EACH ROW
    WHEN (NEW.card_id IS NOT NULL)
    EXECUTE FUNCTION auto_complete_contato_task();

-- ============================================================================
-- TRIGGER PARA SALVAR STAGE NO METADATA DAS TAREFAS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_task_created_at_stage()
RETURNS TRIGGER AS $$
DECLARE
    v_card RECORD;
BEGIN
    -- Apenas para tarefas de contato
    IF NEW.tipo = 'contato' AND NEW.card_id IS NOT NULL THEN
        -- Buscar stage atual do card
        SELECT pipeline_stage_id INTO v_card
        FROM cards
        WHERE id = NEW.card_id;

        IF v_card.pipeline_stage_id IS NOT NULL THEN
            -- Adicionar stage ao metadata
            NEW.metadata := COALESCE(NEW.metadata, '{}'::JSONB) || jsonb_build_object(
                'created_at_stage_id', v_card.pipeline_stage_id::TEXT
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trg_tarefas_set_created_at_stage ON tarefas;

-- Criar trigger para novas tarefas
CREATE TRIGGER trg_tarefas_set_created_at_stage
    BEFORE INSERT ON tarefas
    FOR EACH ROW
    EXECUTE FUNCTION set_task_created_at_stage();

-- ============================================================================
-- BACKFILL: Atualizar tarefas existentes sem metadata de stage
-- ============================================================================

-- Atualizar tarefas de contato pendentes que não têm created_at_stage_id
UPDATE tarefas t
SET metadata = COALESCE(t.metadata, '{}'::JSONB) || jsonb_build_object(
    'created_at_stage_id', c.pipeline_stage_id::TEXT,
    'backfilled_at', NOW()::TEXT
)
FROM cards c
WHERE t.card_id = c.id
  AND t.tipo = 'contato'
  AND t.concluida = false
  AND t.deleted_at IS NULL
  AND (
      t.metadata->>'created_at_stage_id' IS NULL
      OR t.metadata->>'created_at_stage_id' = ''
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION auto_complete_contato_task() IS
'Trigger function que auto-completa tarefas de contato quando mensagem WhatsApp chega.
Também move cards automaticamente no funil SDR:
- OUTBOUND em Novo Lead → Tentativa de Contato
- INBOUND em Novo Lead ou Tentativa de Contato → Conectado';

COMMENT ON FUNCTION set_task_created_at_stage() IS
'Trigger function que salva o stage_id atual do card no metadata da tarefa ao criar.
Isso permite correlação inteligente: tarefa só auto-completa se card ainda está no mesmo stage.';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
