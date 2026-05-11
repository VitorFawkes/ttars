-- Migration: Reprocess recoverable WhatsApp events
-- These events failed with 'no_contact' or 'error' but have matching contacts
-- The updated process_whatsapp_raw_event_v2 function should now process them correctly

DO $$
DECLARE
    v_event_id UUID;
    v_result JSONB;
    v_success_count INT := 0;
    v_fail_count INT := 0;
    v_total INT;
    v_events UUID[];
BEGIN
    -- Get all recoverable event IDs
    SELECT ARRAY_AGG(e.id) INTO v_events
    FROM public.whatsapp_raw_events e
    WHERE e.status IN ('no_contact', 'error')
    AND EXISTS (
        SELECT 1 FROM public.contatos c
        WHERE public.normalize_phone_brazil(c.telefone) = public.normalize_phone_brazil(
            COALESCE(
                e.raw_payload->'data'->>'contact_phone',
                e.raw_payload->>'contact_phone'
            )
        )
    );

    v_total := COALESCE(array_length(v_events, 1), 0);

    RAISE NOTICE 'Found % recoverable events to reprocess', v_total;

    IF v_total = 0 THEN
        RAISE NOTICE 'No events to process, exiting';
        RETURN;
    END IF;

    -- Process each event
    FOREACH v_event_id IN ARRAY v_events
    LOOP
        BEGIN
            -- Reset status to pending
            UPDATE public.whatsapp_raw_events
            SET status = 'pending', error_message = NULL
            WHERE id = v_event_id;

            -- Call the processing function
            SELECT public.process_whatsapp_raw_event_v2(v_event_id) INTO v_result;

            IF v_result ? 'success' AND (v_result->>'success')::boolean = true THEN
                v_success_count := v_success_count + 1;
            ELSIF v_result ? 'orphan' THEN
                -- Orphan means no contact found (expected for some)
                v_fail_count := v_fail_count + 1;
            ELSE
                v_fail_count := v_fail_count + 1;
                RAISE NOTICE 'Event % failed: %', v_event_id, v_result;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_fail_count := v_fail_count + 1;
            RAISE NOTICE 'Exception processing event %: %', v_event_id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Reprocessing complete: % success, % failed out of % total', v_success_count, v_fail_count, v_total;
END $$;

-- Verify results
DO $$
DECLARE
    v_processed INT;
    v_no_contact INT;
    v_error INT;
BEGIN
    SELECT COUNT(*) INTO v_processed FROM public.whatsapp_raw_events WHERE status = 'processed';
    SELECT COUNT(*) INTO v_no_contact FROM public.whatsapp_raw_events WHERE status = 'no_contact';
    SELECT COUNT(*) INTO v_error FROM public.whatsapp_raw_events WHERE status = 'error';

    RAISE NOTICE 'Final counts - Processed: %, No Contact: %, Error: %', v_processed, v_no_contact, v_error;
END $$;
