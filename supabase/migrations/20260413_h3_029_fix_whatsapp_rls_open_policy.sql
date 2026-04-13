-- H3-029: remove policy aberta que fura isolamento multi-tenant em whatsapp_raw_events.
-- A policy "Authenticated users can view whatsapp_raw_events" estava com USING = true,
-- permitindo que qualquer authenticated visse events de todas as orgs.
-- Cobertura correta fica com whatsapp_raw_events_org_select / whatsapp_raw_events_org_all.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'whatsapp_raw_events') THEN
        DROP POLICY IF EXISTS "Authenticated users can view whatsapp_raw_events"
            ON public.whatsapp_raw_events;
    END IF;
END$$;
