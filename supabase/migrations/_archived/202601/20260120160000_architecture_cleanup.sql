-- ============================================================
-- MIGRATION: Architecture Cleanup
-- Date: 2026-01-20
-- ============================================================

-- 1. Fazer process_whatsapp_raw_event chamar v2
CREATE OR REPLACE FUNCTION process_whatsapp_raw_event(event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN process_whatsapp_raw_event_v2(event_id);
END;
$$;

COMMENT ON FUNCTION process_whatsapp_raw_event IS 'DEPRECATED: Wrapper para process_whatsapp_raw_event_v2';

-- 2. Atualizar process_all_pending_whatsapp_events para usar v2
CREATE OR REPLACE FUNCTION process_all_pending_whatsapp_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event RECORD;
    v_result jsonb;
    v_results jsonb := '[]'::jsonb;
    v_processed INT := 0;
    v_errors INT := 0;
BEGIN
    FOR v_event IN 
        SELECT id FROM whatsapp_raw_events 
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 100
    LOOP
        v_result := process_whatsapp_raw_event_v2(v_event.id);
        v_results := v_results || jsonb_build_object('event_id', v_event.id, 'result', v_result);
        
        IF v_result->>'success' = 'true' THEN
            v_processed := v_processed + 1;
        ELSE
            v_errors := v_errors + 1;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'processed', v_processed,
        'errors', v_errors,
        'details', v_results
    );
END;
$$;

-- 3. Converter telefone = '' para NULL
UPDATE contatos SET telefone = NULL WHERE telefone = '';

-- 4. Deletar tabelas backup órfãs
DROP TABLE IF EXISTS proposals_backup_20251223 CASCADE;
DROP TABLE IF EXISTS reunioes_backup_20251223 CASCADE;
DROP TABLE IF EXISTS tarefas_backup_20251223 CASCADE;
DROP TABLE IF EXISTS n8n_active_dump CASCADE;

-- 5. Migrar dados de type para message_type
UPDATE whatsapp_messages 
SET message_type = type 
WHERE type IS NOT NULL AND message_type IS NULL;

-- 6. Marcar coluna type como deprecated
COMMENT ON COLUMN whatsapp_messages.type IS 'DEPRECATED: Use message_type';
