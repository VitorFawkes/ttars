-- ============================================================================
-- Migration: Drop NOT NULL constraints on user-referencing columns
-- Purpose: Allow columns to be NULL when the referenced user is deleted
-- ============================================================================

-- Helper macro to safely alter column
DO $$
DECLARE
    r RECORD;
BEGIN
    -- List of tables and columns to drop NOT NULL
    FOR r IN SELECT * FROM (VALUES 
        ('tarefas', 'responsavel_id'),
        ('card_owner_history', 'owner_id'),
        ('proposal_library', 'created_by'),
        ('proposal_versions', 'created_by')
    ) AS t(table_name, column_name)
    LOOP
        -- Check if column exists and is NOT NULL
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = r.table_name 
            AND column_name = r.column_name 
            AND is_nullable = 'NO'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
            RAISE NOTICE 'Dropped NOT NULL constraint on %.%', r.table_name, r.column_name;
        END IF;
    END LOOP;
END $$;
