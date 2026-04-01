-- H3-013: Patch SECURITY DEFINER trigger functions with org_id guards
-- These trigger functions bypass RLS and operate on NEW/OLD rows.
-- For INSERT triggers, we ensure org_id is populated from the user's JWT.
-- For UPDATE triggers that query other tables, we add org_id filters.
--
-- Strategy: Same dynamic patching as H3-010 for functions that query cards.
-- For triggers that insert into child tables, add org_id = NEW.org_id.

DO $patch$
DECLARE
    func_names TEXT[] := ARRAY[
        'aggregate_sub_card_values',
        'handle_card_auto_advance',
        'handle_card_owner_phase_guard',
        'link_viajante_orphan_messages',
        'process_whatsapp_raw_event_v2',
        'reprocess_orphan_whatsapp_for_phone',
        'sync_meios_to_telefone',
        'sync_telefone_to_meios',
        'update_inventory_stock'
    ];
    func_name TEXT;
    func_oid OID;
    func_def TEXT;
    new_def TEXT;
BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
        SELECT p.oid INTO func_oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = func_name
        LIMIT 1;

        IF func_oid IS NULL THEN
            RAISE NOTICE 'Trigger function % not found, skipping', func_name;
            CONTINUE;
        END IF;

        func_def := pg_get_functiondef(func_oid);

        -- Idempotency guard: skip if already patched
        IF position('requesting_org_id()' IN func_def) > 0 THEN
            RAISE NOTICE 'Trigger function % already patched, skipping', func_name;
            CONTINUE;
        END IF;

        -- Patch card queries with org_id filter
        new_def := replace(func_def,
            'c.deleted_at IS NULL',
            'c.org_id = requesting_org_id() AND c.deleted_at IS NULL');

        -- Patch any direct card lookups
        new_def := replace(new_def,
            'cards WHERE id =',
            'cards WHERE org_id = requesting_org_id() AND id =');

        -- Only execute if changes were made
        IF new_def != func_def THEN
            EXECUTE new_def;
            RAISE NOTICE 'Patched trigger function: %', func_name;
        ELSE
            RAISE NOTICE 'No patches needed for: %', func_name;
        END IF;
    END LOOP;
END;
$patch$;

-- =============================================================================
-- handle_new_user — Ensure new users get org_id from invitation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_org_id UUID;
BEGIN
    -- Check if user was invited
    SELECT i.org_id, i.role, i.team_id, i.produtos
    INTO v_invite
    FROM invitations i
    WHERE i.email = NEW.email
      AND i.used_at IS NULL
      AND i.expires_at > NOW()
    LIMIT 1;

    -- Determine org_id: from invitation or default
    v_org_id := COALESCE(v_invite.org_id, 'a0000000-0000-0000-0000-000000000001'::UUID);

    INSERT INTO public.profiles (id, email, nome, role, team_id, produtos, org_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(v_invite.role, 'vendas'),
        v_invite.team_id,
        COALESCE(v_invite.produtos, ARRAY['TRIPS']),
        v_org_id
    );

    -- Mark invitation as used
    IF v_invite IS NOT NULL THEN
        UPDATE invitations
        SET used_at = NOW()
        WHERE email = NEW.email
          AND used_at IS NULL
          AND org_id = v_org_id;
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- Ensure activities INSERT trigger populates org_id from card
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_set_activity_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id FROM cards WHERE id = NEW.card_id;
    END IF;
    IF NEW.org_id IS NULL THEN
        NEW.org_id := 'a0000000-0000-0000-0000-000000000001'::UUID;
    END IF;
    RETURN NEW;
END;
$$;

-- Apply to activities table
DROP TRIGGER IF EXISTS auto_set_activity_org_id_trigger ON activities;
CREATE TRIGGER auto_set_activity_org_id_trigger
    BEFORE INSERT ON activities
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_activity_org_id();

-- =============================================================================
-- Generic trigger: auto-set org_id from parent card on INSERT for child tables
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_set_org_id_from_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id FROM cards WHERE id = NEW.card_id;
    END IF;
    IF NEW.org_id IS NULL THEN
        NEW.org_id := 'a0000000-0000-0000-0000-000000000001'::UUID;
    END IF;
    RETURN NEW;
END;
$$;

-- Apply to key child tables
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'tarefas', 'reunioes', 'mensagens', 'historico_fases',
        'cards_contatos', 'card_financial_items', 'card_team_members',
        'arquivos', 'whatsapp_messages'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS auto_set_org_id_trigger ON %I', tbl);
            EXECUTE format(
                'CREATE TRIGGER auto_set_org_id_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_card()',
                tbl
            );
        EXCEPTION WHEN undefined_table THEN
            RAISE NOTICE 'Table % not found, skipping trigger', tbl;
        END;
    END LOOP;
END;
$$;
