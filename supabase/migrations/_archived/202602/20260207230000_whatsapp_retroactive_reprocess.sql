-- ============================================================
-- MIGRATION: WhatsApp Retroactive Reprocessing
-- Date: 2026-02-07
-- Purpose: Quando um contato é cadastrado (ou telefone adicionado),
--          reprocessa automaticamente eventos WhatsApp órfãos (no_contact)
--          que batem com aquele número, linkando o histórico retroativamente.
-- ============================================================

-- 1. Função principal: reprocessa eventos órfãos para um dado telefone
CREATE OR REPLACE FUNCTION reprocess_orphan_whatsapp_for_phone(p_phone TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone_normalized TEXT;
    v_phone_no_country TEXT;
    v_event_id UUID;
    v_result JSONB;
    v_success_count INT := 0;
    v_fail_count INT := 0;
    v_total INT := 0;
BEGIN
    -- Normalizar o telefone recebido
    v_phone_normalized := normalize_phone(p_phone);
    v_phone_no_country := normalize_phone_brazil(p_phone);

    IF v_phone_normalized IS NULL OR v_phone_normalized = '' THEN
        RETURN jsonb_build_object('skipped', true, 'reason', 'Empty phone');
    END IF;

    -- Buscar e reprocessar eventos órfãos cujo telefone bate
    -- Limite de 100 eventos por chamada para segurança de performance
    FOR v_event_id IN
        SELECT e.id
        FROM whatsapp_raw_events e
        WHERE e.status = 'no_contact'
        AND (
            normalize_phone(
                COALESCE(e.raw_payload->'data'->>'contact_phone', e.raw_payload->>'contact_phone')
            ) = v_phone_normalized
            OR normalize_phone_brazil(
                COALESCE(e.raw_payload->'data'->>'contact_phone', e.raw_payload->>'contact_phone')
            ) = v_phone_no_country
        )
        ORDER BY e.created_at ASC
        LIMIT 100
    LOOP
        v_total := v_total + 1;

        BEGIN
            -- Resetar status para permitir reprocessamento
            UPDATE whatsapp_raw_events
            SET status = 'pending', error_message = NULL
            WHERE id = v_event_id;

            -- Chamar a função de processamento existente
            SELECT process_whatsapp_raw_event_v2(v_event_id) INTO v_result;

            IF v_result ? 'success' AND (v_result->>'success')::boolean = true THEN
                v_success_count := v_success_count + 1;
            ELSE
                v_fail_count := v_fail_count + 1;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_fail_count := v_fail_count + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'reprocessed', v_total,
        'success', v_success_count,
        'failed', v_fail_count,
        'phone', v_phone_no_country
    );
END;
$$;

COMMENT ON FUNCTION reprocess_orphan_whatsapp_for_phone IS
    'Reprocessa eventos WhatsApp órfãos (no_contact) que batem com o telefone fornecido';


-- 2. Trigger function para contato_meios
CREATE OR REPLACE FUNCTION trigger_reprocess_whatsapp_on_new_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Só reprocessar para tipos de telefone
    IF NEW.tipo NOT IN ('telefone', 'whatsapp') THEN
        RETURN NEW;
    END IF;

    -- Chamar reprocessamento com o valor do telefone
    SELECT reprocess_orphan_whatsapp_for_phone(NEW.valor) INTO v_result;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reprocess_whatsapp_on_new_phone ON contato_meios;

CREATE TRIGGER trg_reprocess_whatsapp_on_new_phone
    AFTER INSERT ON contato_meios
    FOR EACH ROW
    EXECUTE FUNCTION trigger_reprocess_whatsapp_on_new_phone();


-- 3. Trigger function para contatos.telefone (path legado)
CREATE OR REPLACE FUNCTION trigger_reprocess_whatsapp_on_contato_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Só processar se telefone é novo ou mudou
    IF NEW.telefone IS NULL OR NEW.telefone = '' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.telefone = NEW.telefone THEN
        RETURN NEW;
    END IF;

    SELECT reprocess_orphan_whatsapp_for_phone(NEW.telefone) INTO v_result;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reprocess_whatsapp_on_contato_phone ON contatos;

CREATE TRIGGER trg_reprocess_whatsapp_on_contato_phone
    AFTER INSERT OR UPDATE OF telefone ON contatos
    FOR EACH ROW
    EXECUTE FUNCTION trigger_reprocess_whatsapp_on_contato_phone();


COMMENT ON TRIGGER trg_reprocess_whatsapp_on_new_phone ON contato_meios IS
    'Reprocessa mensagens WhatsApp órfãs quando telefone é adicionado a contato_meios';
COMMENT ON TRIGGER trg_reprocess_whatsapp_on_contato_phone ON contatos IS
    'Reprocessa mensagens WhatsApp órfãs quando telefone é adicionado/atualizado em contatos';
