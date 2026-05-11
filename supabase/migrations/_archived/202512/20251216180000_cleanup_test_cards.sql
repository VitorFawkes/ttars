-- ============================================================================
-- CLEANUP: Fix audit_logs schema and delete test cards (with cascade)
-- ============================================================================

-- 1. Drop the trigger first to avoid errors during table recreation
DROP TRIGGER IF EXISTS trigger_audit_cards ON public.cards;

-- 2. Drop and recreate audit_logs to ensure correct schema (missing 'action' column fix)
DROP TABLE IF EXISTS public.audit_logs CASCADE;

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL, -- INSERT, UPDATE, DELETE
    old_data jsonb,
    new_data jsonb,
    changed_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admin to view logs" ON public.audit_logs FOR SELECT USING (public.is_admin());

-- 3. Recreate the trigger function (ensure it matches schema)
CREATE OR REPLACE FUNCTION public.log_card_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        -- Log critical changes: stage, owner, values
        IF (OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id) OR
           (OLD.dono_atual_id IS DISTINCT FROM NEW.dono_atual_id) OR
           (OLD.valor_final IS DISTINCT FROM NEW.valor_final) THEN
            
            INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
            VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD), auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Recreate the trigger
CREATE TRIGGER trigger_audit_cards
AFTER UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.log_card_changes();

-- 5. Delete dependent records first (Manual Cascade)
-- We delete records linked to cards that are NOT the protected one
DELETE FROM public.activities WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.atividades WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.arquivos WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.card_obligations WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.card_owner_history WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.cards_contatos WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.contratos WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.dados_cadastrais_pj WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.historico_fases WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.mensagens WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.notas WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.participacoes WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.proposals WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.reunioes WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.tarefas WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';
DELETE FROM public.task_queue WHERE card_id != '04a443ea-7f07-48da-aa1c-4162712fae8b';

-- 6. Delete all test cards except the one currently being used
DELETE FROM public.cards
WHERE id != '04a443ea-7f07-48da-aa1c-4162712fae8b';

-- Log the cleanup
DO $$
DECLARE
    v_count integer;
BEGIN
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % test cards.', v_count;
END $$;
