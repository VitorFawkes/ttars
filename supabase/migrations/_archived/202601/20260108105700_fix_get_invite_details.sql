CREATE OR REPLACE FUNCTION public.get_invite_details(token_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  invite_record public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO invite_record
  FROM public.invitations
  WHERE token = token_input
    AND used_at IS NULL
    AND expires_at > now();

  IF invite_record.id IS NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'email', invite_record.email,
    'role', invite_record.role
  );
END;
$function$;
