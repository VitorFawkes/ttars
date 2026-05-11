-- ============================================================================
-- Migration: Fix blocking foreign keys on profiles table
-- Purpose: Update FKs to ON DELETE SET NULL to allow profile deletion (cascaded from user deletion)
-- ============================================================================

-- Helper macro to safely update constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- List of tables and columns that reference profiles and need ON DELETE SET NULL
    -- Format: table_name, constraint_name, column_name
    FOR r IN SELECT * FROM (VALUES 
        ('activities', 'activities_created_by_fkey', 'created_by'),
        ('api_keys', 'api_keys_created_by_fkey', 'created_by'),
        ('card_creation_rules', 'card_creation_rules_created_by_fkey', 'created_by'),
        ('card_owner_history', 'card_owner_history_owner_id_fkey', 'owner_id'),
        ('card_owner_history', 'card_owner_history_transferred_by_fkey', 'transferred_by'),
        ('cards', 'cards_deleted_by_fkey', 'deleted_by'),
        ('invitations', 'invitations_created_by_fkey', 'created_by'),
        ('proposal_comments', 'proposal_comments_resolved_by_fkey', 'resolved_by'),
        ('proposal_library', 'proposal_library_created_by_fkey', 'created_by'),
        ('proposal_versions', 'proposal_versions_created_by_fkey', 'created_by'),
        ('reunioes', 'reunioes_sdr_responsavel_id_fkey', 'sdr_responsavel_id'),
        ('stage_fields_settings', 'stage_fields_settings_updated_by_fkey', 'updated_by'),
        ('teams', 'teams_leader_id_fkey', 'leader_id'),
        ('whatsapp_messages', 'whatsapp_messages_sent_by_user_id_fkey', 'sent_by_user_id'),
        ('workflows', 'workflows_created_by_fkey', 'created_by')
    ) AS t(table_name, constraint_name, column_name)
    LOOP
        -- Check if constraint exists
        IF EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = r.constraint_name 
            AND conrelid = (r.table_name)::regclass
        ) THEN
            -- Drop existing constraint
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
            
            -- Re-add with ON DELETE SET NULL
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES profiles(id) ON DELETE SET NULL', 
                r.table_name, r.constraint_name, r.column_name);
                
            RAISE NOTICE 'Updated constraint % on table %', r.constraint_name, r.table_name;
        END IF;
    END LOOP;
END $$;
