-- 1. Stage Transitions
CREATE TABLE IF NOT EXISTS public.stage_transitions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    source_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    target_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    allowed boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(source_stage_id, target_stage_id)
);

ALTER TABLE public.stage_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admin to manage transitions" ON public.stage_transitions;
CREATE POLICY "Allow admin to manage transitions" ON public.stage_transitions FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Allow read access to everyone" ON public.stage_transitions;
CREATE POLICY "Allow read access to everyone" ON public.stage_transitions FOR SELECT USING (true);

-- 2. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
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
DROP POLICY IF EXISTS "Allow admin to view logs" ON public.audit_logs;
CREATE POLICY "Allow admin to view logs" ON public.audit_logs FOR SELECT USING (public.is_admin());

-- 3. Validation Function (Transitions)
CREATE OR REPLACE FUNCTION public.validate_transition(p_card_id uuid, p_target_stage_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_stage_id uuid;
    v_is_allowed boolean;
BEGIN
    -- Admin bypass
    IF public.is_admin() THEN
        RETURN true;
    END IF;

    SELECT pipeline_stage_id INTO v_current_stage_id FROM public.cards WHERE id = p_card_id;

    -- If same stage, allow
    IF v_current_stage_id = p_target_stage_id THEN
        RETURN true;
    END IF;

    -- Check transition table
    SELECT allowed INTO v_is_allowed
    FROM public.stage_transitions
    WHERE source_stage_id = v_current_stage_id AND target_stage_id = p_target_stage_id;

    IF v_is_allowed IS FALSE THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- 4. Audit Log Trigger Function
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

DROP TRIGGER IF EXISTS trigger_audit_cards ON public.cards;
CREATE TRIGGER trigger_audit_cards
AFTER UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.log_card_changes();

-- 5. Data Validation Trigger (Dates & Values)
CREATE OR REPLACE FUNCTION public.validate_card_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_inicio date;
    v_fim date;
BEGIN
    -- Check dates in produto_data if product is TRIPS
    IF NEW.produto = 'TRIPS' AND NEW.produto_data IS NOT NULL THEN
        -- Safely extract dates, handling potential nulls or invalid formats gracefully if needed, 
        -- but here we assume if they exist they are dates.
        BEGIN
            v_inicio := (NEW.produto_data -> 'epoca_viagem' ->> 'inicio')::date;
            v_fim := (NEW.produto_data -> 'epoca_viagem' ->> 'fim')::date;
            
            IF v_inicio IS NOT NULL AND v_fim IS NOT NULL AND v_fim < v_inicio THEN
                RAISE EXCEPTION 'Data de fim da viagem não pode ser anterior ao início.';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore date parsing errors, let it pass or log? 
            -- Better to let it pass to avoid blocking valid saves if format is weird.
            NULL;
        END;
    END IF;

    -- Check values
    IF NEW.valor_estimado < 0 THEN
        RAISE EXCEPTION 'Valor estimado não pode ser negativo.';
    END IF;
    
    IF NEW.valor_final < 0 THEN
        RAISE EXCEPTION 'Valor final não pode ser negativo.';
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_card_data ON public.cards;
CREATE TRIGGER trigger_validate_card_data
BEFORE INSERT OR UPDATE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.validate_card_data();
