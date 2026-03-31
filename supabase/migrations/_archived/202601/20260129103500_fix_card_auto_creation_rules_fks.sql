-- ============================================================================
-- Migration: Fix blocking foreign keys on card_auto_creation_rules
-- Purpose: Update FKs to ON DELETE SET NULL to allow profile deletion
-- ============================================================================

-- Helper macro to safely update constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- List of tables and columns that reference profiles and need ON DELETE SET NULL
    -- Format: table_name, constraint_name, column_name
    FOR r IN SELECT * FROM (VALUES 
        ('card_auto_creation_rules', 'card_auto_creation_rules_target_owner_id_fkey', 'target_owner_id'),
        ('card_auto_creation_rules', 'card_auto_creation_rules_created_by_fkey', 'created_by')
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
