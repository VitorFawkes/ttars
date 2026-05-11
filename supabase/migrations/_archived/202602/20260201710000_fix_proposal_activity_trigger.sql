-- Fix: Corrigir search_path da função log_proposal_activity
-- O trigger estava falhando porque a função não encontrava a tabela activities

-- Recriar a função com search_path explícito
CREATE OR REPLACE FUNCTION public.log_proposal_activity()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
        VALUES (
            NEW.card_id,
            'proposal_created',
            'Proposta criada (v' || COALESCE(NEW.version, 1) || ')',
            jsonb_build_object(
                'proposal_id', NEW.id,
                'version', NEW.version,
                'status', NEW.status
            ),
            COALESCE(NEW.created_by, auth.uid())
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status OR OLD.version IS DISTINCT FROM NEW.version THEN
            INSERT INTO public.activities (card_id, tipo, descricao, metadata, created_by)
            VALUES (
                NEW.card_id,
                'proposal_updated',
                'Proposta atualizada (v' || COALESCE(NEW.version, 1) || ') - ' || NEW.status,
                jsonb_build_object(
                    'proposal_id', NEW.id,
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'version', NEW.version
                ),
                auth.uid()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recriar o trigger
DROP TRIGGER IF EXISTS proposal_activity_trigger ON public.proposals;
CREATE TRIGGER proposal_activity_trigger
    AFTER INSERT OR UPDATE ON public.proposals
    FOR EACH ROW EXECUTE FUNCTION public.log_proposal_activity();
