-- ============================================================
-- MIGRATION: Blindagem de Automações (Sprint 1.2 + 1.3)
-- Date: 2026-04-19
--
-- OBJETIVOS:
-- 1. Impedir triggers de start_cadence órfãos (sem target_template_id).
-- 2. Fechar vazamentos cross-org em cadence_event_triggers:
--    - Policy select_active permitia role public ler qualquer trigger ativo.
--    - Policy admin_all não filtrava por org_id (admin enxergava cross-org).
-- 3. Restringir cadence_templates_select_active a authenticated (não public/anon).
--
-- CONTEXTO:
-- - cadence_event_triggers já tem org_id (NOT NULL).
-- - cadence_templates já tem org_id (NOT NULL).
-- - FK target_template_id atual: ON DELETE SET NULL — gera órfãos quando
--   um template é deletado. Troca-se para CASCADE para manter integridade
--   (o trigger não faz sentido sem o template-alvo).
--
-- Nota: staging pode estar defasado e não ter as tabelas cadence_*. Os DO
-- blocks guardam toda DDL relevante para rodar sem quebrar em staging defasado.
-- ============================================================

BEGIN;

DO $mig$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        RAISE NOTICE 'cadence_event_triggers não existe — pulando blindagem de triggers.';
    ELSE
        -- ============================================================
        -- 1. CHECK constraint: start_cadence exige target_template_id
        -- ============================================================
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.cadence_event_triggers'::regclass
              AND conname = 'cadence_event_triggers_start_cadence_has_target'
        ) THEN
            EXECUTE 'ALTER TABLE public.cadence_event_triggers
                ADD CONSTRAINT cadence_event_triggers_start_cadence_has_target
                CHECK (action_type <> ''start_cadence'' OR target_template_id IS NOT NULL)
                NOT VALID';
            EXECUTE 'ALTER TABLE public.cadence_event_triggers
                VALIDATE CONSTRAINT cadence_event_triggers_start_cadence_has_target';
        END IF;

        -- ============================================================
        -- 2. FK target_template_id: SET NULL → CASCADE
        -- ============================================================
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.cadence_event_triggers'::regclass
              AND conname = 'cadence_event_triggers_target_template_id_fkey'
        ) THEN
            EXECUTE 'ALTER TABLE public.cadence_event_triggers
                DROP CONSTRAINT cadence_event_triggers_target_template_id_fkey';
        END IF;

        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_templates') THEN
            EXECUTE 'ALTER TABLE public.cadence_event_triggers
                ADD CONSTRAINT cadence_event_triggers_target_template_id_fkey
                FOREIGN KEY (target_template_id)
                REFERENCES public.cadence_templates(id)
                ON DELETE CASCADE';
        END IF;

        -- ============================================================
        -- 3. RLS cadence_event_triggers: fechar vazamentos cross-org
        -- ============================================================
        EXECUTE 'DROP POLICY IF EXISTS cadence_event_triggers_select_active ON public.cadence_event_triggers';
        EXECUTE 'DROP POLICY IF EXISTS cadence_event_triggers_admin_all ON public.cadence_event_triggers';
        EXECUTE 'CREATE POLICY cadence_event_triggers_admin_all ON public.cadence_event_triggers
            FOR ALL TO authenticated
            USING (public.is_admin() AND org_id = public.requesting_org_id())
            WITH CHECK (public.is_admin() AND org_id = public.requesting_org_id())';
    END IF;
END $mig$;

DO $mig$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_templates') THEN
        RAISE NOTICE 'cadence_templates não existe — pulando blindagem de templates.';
    ELSE
        -- ============================================================
        -- 4. RLS cadence_templates: select_active deve ser authenticated
        -- ============================================================
        EXECUTE 'DROP POLICY IF EXISTS cadence_templates_select_active ON public.cadence_templates';
        EXECUTE 'CREATE POLICY cadence_templates_select_active ON public.cadence_templates
            FOR SELECT TO authenticated
            USING (is_active = true AND org_id = public.requesting_org_id())';
    END IF;
END $mig$;

COMMIT;
