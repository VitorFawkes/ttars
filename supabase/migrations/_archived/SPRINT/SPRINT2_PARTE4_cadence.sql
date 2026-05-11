-- SPRINT 2 - PARTE 4: cadence_entry_queue, cadence_event_log, cadence_instances

DROP POLICY IF EXISTS "cadence_entry_queue_owner_select" ON cadence_entry_queue;
CREATE POLICY "cadence_entry_queue_owner_select" ON cadence_entry_queue
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "cadence_event_log_select" ON cadence_event_log;
CREATE POLICY "cadence_event_log_select" ON cadence_event_log
    FOR SELECT TO public
    USING (
        (card_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        ))
        OR is_admin()
    );

DROP POLICY IF EXISTS "cadence_instances_select" ON cadence_instances;
CREATE POLICY "cadence_instances_select" ON cadence_instances
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        )
        OR is_admin()
    );
