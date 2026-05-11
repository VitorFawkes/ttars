CREATE OR REPLACE FUNCTION public.log_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_record_id UUID;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        v_new_data = to_jsonb(NEW);
        v_record_id = NEW.id;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old_data = to_jsonb(OLD);
        v_new_data = to_jsonb(NEW);
        v_record_id = NEW.id;
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data = to_jsonb(OLD);
        v_record_id = OLD.id;
    END IF;

    INSERT INTO public.audit_logs (
        table_name,
        record_id,
        action, -- Changed from operation to action
        old_data,
        new_data,
        changed_by
    ) VALUES (
        TG_TABLE_NAME,
        v_record_id,
        TG_OP,
        v_old_data,
        v_new_data,
        auth.uid()
    );

    RETURN NULL; -- Result is ignored since this is an AFTER trigger
END;
$function$;
