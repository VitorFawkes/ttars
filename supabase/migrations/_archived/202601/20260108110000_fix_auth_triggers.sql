-- Fix check_invite_whitelist to use invitations table
CREATE OR REPLACE FUNCTION public.check_invite_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invite_record public.invitations%ROWTYPE;
BEGIN
  -- Check if there is a valid invite for this email
  SELECT * INTO invite_record
  FROM public.invitations
  WHERE email = new.email
    AND used_at IS NULL
    AND expires_at > now();

  IF invite_record.id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado. Este email não possui um convite válido.';
  END IF;

  RETURN new;
END;
$function$;

-- Fix mark_invite_used to use invitations table
CREATE OR REPLACE FUNCTION public.mark_invite_used()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.invitations
  SET used_at = now()
  WHERE email = new.email;
  
  RETURN new;
END;
$function$;

-- Fix handle_new_user to use role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  -- Try to get role from metadata, default to 'vendas' if invalid or missing
  BEGIN
    v_role := (new.raw_user_meta_data->>'role')::public.app_role;
  EXCEPTION WHEN OTHERS THEN
    v_role := 'vendas'::public.app_role;
  END;

  INSERT INTO public.profiles (id, email, nome, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;
