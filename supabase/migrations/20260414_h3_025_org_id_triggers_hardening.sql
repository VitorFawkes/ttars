-- H3-025: Hardening — BEFORE INSERT triggers que resolvem org_id em cascata
--
-- CONTEXTO
-- Pós Fase 3 multi-tenant, 85+ tabelas têm org_id NOT NULL com DEFAULT
-- requesting_org_id(). A função retorna NULL fora de contexto JWT
-- (pg_cron, service_role via PostgREST, backfills, psql como postgres,
-- edge functions que não propagam JWT).
--
-- Em 2026-04-13 o bug se materializou em integration_outbound_queue (fix em
-- 20260413_fix_outbound_queue_org_id_fallback.sql). Auditoria posterior
-- encontrou gaps análogos em outras tabelas populadas por SECURITY DEFINER.
--
-- GAPS ENDEREÇADOS (funções que INSERT sem passar org_id):
--   - notifications: bulk_import_financial_items, notify_teams_on_card_assign
--   - card_tag_assignments: julia_assign_tag (agent IA via service_role)
--   - n8n_ai_extraction_queue: link_viajante_orphan_messages (trigger em
--     cards_contatos — contexto herdado pode não ter JWT)
--   - whatsapp_conversations: process_whatsapp_raw_event_v2 (edge fn service_role)
--
-- TABELAS COM INSERTs CORRETOS (passam org_id) mas reforçadas por defesa
-- em profundidade (proteção contra futuros callers):
--   - cadence_instances, cadence_event_log, cadence_entry_queue
--   - card_milestones, card_phase_owners, card_owner_history
--   - cadence_steps (resolve via template → cadence_templates)
--
-- DECISÕES
-- - NÃO usar fallback hardcoded Welcome Group (como auto_set_org_id_from_card /
--   auto_set_activity_org_id fazem). Pós Org Split, TRIPS e WEDDING são
--   orgs separadas; fallback causaria cross-contamination. Deixar a NOT NULL
--   abortar é preferível a corromper isolamento.
-- - NÃO endurecer requesting_org_id() para RAISE. A função é DEFAULT em 85+
--   colunas e usada em RLS; RAISE quebraria operações legítimas de provisioning
--   que passam org_id explícito. O fix correto é no BEFORE INSERT trigger.
-- - NÃO mexer no auto_set_org_id_from_card genérico e auto_set_activity_org_id
--   (ambos têm fallback Welcome Group hardcoded) nesta migration. Remover
--   o fallback deles requer auditoria de callers — gap aceito, rastreado.
-- - Migration tolerante a tabelas ausentes (staging pode ser reduzido).

-- =============================================================================
-- 1. Função genérica STRICT: cascade via card_id, sem fallback Welcome Group
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_set_org_id_from_card_strict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    NEW.org_id := requesting_org_id();

    IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id FROM public.cards WHERE id = NEW.card_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_set_org_id_from_card_strict() IS
    'Preenche org_id via cascade JWT→card. Variante strict do '
    'auto_set_org_id_from_card: SEM fallback hardcoded Welcome Group. '
    'Deixa NOT NULL abortar se cascade falhar, evitando cross-org leak.';

-- =============================================================================
-- 2. Aplicar trigger em tabelas child com card_id (skip se tabela ausente)
-- =============================================================================
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'card_tag_assignments',
        'card_milestones',
        'card_phase_owners',
        'card_owner_history',
        'cadence_entry_queue',
        'cadence_instances',
        'n8n_ai_extraction_queue'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS auto_set_org_id_strict_trigger ON public.%I', tbl);
            EXECUTE format(
                'CREATE TRIGGER auto_set_org_id_strict_trigger '
                'BEFORE INSERT ON public.%I '
                'FOR EACH ROW EXECUTE FUNCTION public.auto_set_org_id_from_card_strict()',
                tbl
            );
            RAISE NOTICE 'H3-025: trigger criado em %', tbl;
        ELSE
            RAISE NOTICE 'H3-025: tabela % não existe — pulando', tbl;
        END IF;
    END LOOP;
END $$;

-- =============================================================================
-- 3. cadence_event_log — cascade JWT → card_id → instance_id.card_id
-- =============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='cadence_event_log') THEN
        RAISE NOTICE 'H3-025: cadence_event_log ausente — pulando'; RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.auto_set_cadence_event_log_org_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
        IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
        NEW.org_id := requesting_org_id();
        IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id FROM public.cards WHERE id = NEW.card_id;
        END IF;
        IF NEW.org_id IS NULL AND NEW.instance_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id
            FROM public.cadence_instances WHERE id = NEW.instance_id;
        END IF;
        RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS auto_set_cadence_event_log_org_id_trigger ON public.cadence_event_log;
    CREATE TRIGGER auto_set_cadence_event_log_org_id_trigger
        BEFORE INSERT ON public.cadence_event_log
        FOR EACH ROW EXECUTE FUNCTION public.auto_set_cadence_event_log_org_id();
END $$;

-- =============================================================================
-- 4. cadence_steps — cascade JWT → template_id.org_id
-- =============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='cadence_steps') THEN
        RAISE NOTICE 'H3-025: cadence_steps ausente — pulando'; RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.auto_set_cadence_steps_org_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
        IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
        NEW.org_id := requesting_org_id();
        IF NEW.org_id IS NULL AND NEW.template_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id
            FROM public.cadence_templates WHERE id = NEW.template_id;
        END IF;
        RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS auto_set_cadence_steps_org_id_trigger ON public.cadence_steps;
    CREATE TRIGGER auto_set_cadence_steps_org_id_trigger
        BEFORE INSERT ON public.cadence_steps
        FOR EACH ROW EXECUTE FUNCTION public.auto_set_cadence_steps_org_id();
END $$;

-- =============================================================================
-- 5. notifications — cascade JWT → card_id → user_id.org_id
-- =============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='notifications') THEN
        RAISE NOTICE 'H3-025: notifications ausente — pulando'; RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.auto_set_notifications_org_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
        IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
        NEW.org_id := requesting_org_id();
        IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id FROM public.cards WHERE id = NEW.card_id;
        END IF;
        IF NEW.org_id IS NULL AND NEW.user_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id FROM public.profiles WHERE id = NEW.user_id;
        END IF;
        RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS auto_set_notifications_org_id_trigger ON public.notifications;
    CREATE TRIGGER auto_set_notifications_org_id_trigger
        BEFORE INSERT ON public.notifications
        FOR EACH ROW EXECUTE FUNCTION public.auto_set_notifications_org_id();
END $$;

-- =============================================================================
-- 6. whatsapp_conversations — cascade JWT → contact_id → instance → linha_config
-- =============================================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='whatsapp_conversations') THEN
        RAISE NOTICE 'H3-025: whatsapp_conversations ausente — pulando'; RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.auto_set_whatsapp_conversations_org_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
        IF NEW.org_id IS NOT NULL THEN RETURN NEW; END IF;
        NEW.org_id := requesting_org_id();
        IF NEW.org_id IS NULL AND NEW.contact_id IS NOT NULL THEN
            SELECT org_id INTO NEW.org_id FROM public.contatos WHERE id = NEW.contact_id;
        END IF;
        IF NEW.org_id IS NULL AND NEW.instance_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='whatsapp_linha_config'
                         AND column_name='org_id') THEN
            SELECT org_id INTO NEW.org_id
            FROM public.whatsapp_linha_config WHERE id = NEW.instance_id;
        END IF;
        RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS auto_set_whatsapp_conversations_org_id_trigger
        ON public.whatsapp_conversations;
    CREATE TRIGGER auto_set_whatsapp_conversations_org_id_trigger
        BEFORE INSERT ON public.whatsapp_conversations
        FOR EACH ROW EXECUTE FUNCTION public.auto_set_whatsapp_conversations_org_id();
END $$;

-- =============================================================================
-- SMOKE TESTS (só verifica tabelas que existem no ambiente)
-- =============================================================================
DO $$
DECLARE
    v_missing TEXT[] := ARRAY[]::TEXT[];
    v_tbl TEXT;
    v_expected TEXT[] := ARRAY[
        'card_tag_assignments', 'card_milestones', 'card_phase_owners',
        'card_owner_history', 'cadence_entry_queue', 'cadence_instances',
        'n8n_ai_extraction_queue', 'cadence_event_log', 'cadence_steps',
        'notifications', 'whatsapp_conversations'
    ];
BEGIN
    FOREACH v_tbl IN ARRAY v_expected LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=v_tbl)
           AND NOT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE event_object_table = v_tbl
              AND trigger_schema = 'public'
              AND action_timing = 'BEFORE'
              AND event_manipulation = 'INSERT'
              AND trigger_name LIKE 'auto_set_%'
        ) THEN
            v_missing := array_append(v_missing, v_tbl);
        END IF;
    END LOOP;

    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'H3-025 smoke test failed — tabelas existentes sem auto_set trigger: %', v_missing;
    END IF;

    RAISE NOTICE 'H3-025: smoke test OK';
END $$;
