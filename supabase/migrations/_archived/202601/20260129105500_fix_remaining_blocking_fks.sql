-- ============================================================================
-- Migration: Fix remaining blocking foreign keys
-- Purpose: Update FKs to ON DELETE SET NULL for all remaining tables
-- ============================================================================

-- Helper macro to safely update constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- List of tables and columns that reference auth.users and need ON DELETE SET NULL
    -- Format: table_name, constraint_name, column_name
    FOR r IN SELECT * FROM (VALUES 
        ('cards', 'cards_sdr_owner_id_fkey', 'sdr_owner_id'),
        ('cards', 'cards_taxa_alterado_por_fkey', 'taxa_alterado_por'),
        ('cards', 'cards_updated_by_fkey', 'updated_by'),
        ('cards', 'cards_vendas_owner_id_fkey', 'vendas_owner_id'),
        ('configuracao_taxa_trips', 'configuracao_taxa_trips_updated_by_fkey', 'updated_by'),
        ('contatos', 'contatos_created_by_fkey', 'created_by'),
        ('contratos', 'contratos_responsavel_id_fkey', 'responsavel_id'),
        ('historico_fases', 'historico_fases_mudado_por_fkey', 'mudado_por'),
        ('mensagens', 'mensagens_remetente_interno_id_fkey', 'remetente_interno_id')
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
