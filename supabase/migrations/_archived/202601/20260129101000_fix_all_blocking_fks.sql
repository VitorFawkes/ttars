-- ============================================================================
-- Migration: Fix blocking foreign keys for user deletion
-- Purpose: Update FKs to ON DELETE SET NULL to allow user deletion without data loss
-- ============================================================================

-- Helper macro to safely update constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- List of tables and columns that reference auth.users and need ON DELETE SET NULL
    -- Format: table_name, constraint_name, column_name
    FOR r IN SELECT * FROM (VALUES 
        ('arquivos', 'arquivos_created_by_fkey', 'created_by'),
        ('cards', 'cards_concierge_owner_id_fkey', 'concierge_owner_id'),
        ('cards', 'cards_created_by_fkey', 'created_by'),
        ('cards', 'cards_dono_atual_id_fkey', 'dono_atual_id'),
        ('cards', 'cards_pos_owner_id_fkey', 'pos_owner_id'),
        ('proposal_templates', 'proposal_templates_created_by_fkey', 'created_by'),
        ('proposals', 'proposals_created_by_fkey', 'created_by'),
        ('reunioes', 'reunioes_created_by_fkey', 'created_by'),
        ('reunioes', 'reunioes_responsavel_id_fkey', 'responsavel_id'),
        ('tarefas', 'tarefas_concluido_por_fkey', 'concluido_por'),
        ('tarefas', 'tarefas_created_by_fkey', 'created_by'),
        ('tarefas', 'tarefas_responsavel_id_fkey', 'responsavel_id'),
        ('whatsapp_custom_fields', 'whatsapp_custom_fields_created_by_fkey', 'created_by'),
        ('whatsapp_platforms', 'whatsapp_platforms_created_by_fkey', 'created_by')
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
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL', 
                r.table_name, r.constraint_name, r.column_name);
                
            RAISE NOTICE 'Updated constraint % on table %', r.constraint_name, r.table_name;
        END IF;
    END LOOP;
END $$;
