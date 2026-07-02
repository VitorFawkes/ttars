-- E-mail inbound no card (D-P6, 2ª forma) — parte de banco.
--
-- O trigger log_mensagem_activity (AFTER INSERT em mensagens) só logava
-- mensagens ENVIADAS (lado='out'). Com o e-mail-código (edge function
-- email-inbound inserindo mensagens lado='in'), o recebimento também precisa
-- aparecer na linha do tempo do card — e o insert vem de service_role (sem
-- JWT), onde requesting_org_id() é NULL: org_id vai explícito de NEW.org_id.
--
-- TOP-5 #5: grep confirmou que a ÚNICA migration de topo que define
-- log_mensagem_activity é 20260624f (consertos lado/remetente_interno_id/
-- public.activities) — recriação abaixo PRESERVA os 3 consertos e só adiciona
-- o ramo de recebimento + org_id explícito.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_mensagem_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
    if TG_OP = 'INSERT' and NEW.lado = 'out' then
        insert into public.activities (card_id, org_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
            NEW.org_id,
            case NEW.canal
                when 'email' then 'email_sent'
                when 'whatsapp' then 'whatsapp_sent'
                else 'message_sent'
            end,
            'Mensagem enviada via ' || NEW.canal,
            jsonb_build_object(
                'mensagem_id', NEW.id,
                'canal', NEW.canal,
                'preview', left(NEW.conteudo, 100)
            ),
            coalesce(NEW.remetente_interno_id, auth.uid())
        );
    elsif TG_OP = 'INSERT' and NEW.lado = 'in' then
        insert into public.activities (card_id, org_id, tipo, descricao, metadata, created_by, actor_type, actor_label)
        values (
            NEW.card_id,
            NEW.org_id,
            case NEW.canal
                when 'email' then 'email_received'
                else 'message_received'
            end,
            'Mensagem recebida via ' || NEW.canal,
            jsonb_build_object(
                'mensagem_id', NEW.id,
                'canal', NEW.canal,
                'assunto', NEW.assunto,
                'preview', left(NEW.conteudo, 100)
            ),
            NEW.remetente_interno_id,
            'integration',
            case NEW.canal when 'email' then 'E-mail' else NEW.canal end
        );
    end if;
    return NEW;
end;
$function$;

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.log_mensagem_activity()'::regprocedure);
  IF v_def LIKE '%NEW.direcao%' OR v_def LIKE '%NEW.created_by%' THEN
    RAISE EXCEPTION 'log_mensagem_activity regrediu (direcao/created_by)';
  END IF;
  IF v_def NOT LIKE '%email_received%' THEN
    RAISE EXCEPTION 'log_mensagem_activity: ramo de recebimento não aplicado';
  END IF;
  IF v_def NOT LIKE '%NEW.org_id%' THEN
    RAISE EXCEPTION 'log_mensagem_activity: org_id não está explícito';
  END IF;
  RAISE NOTICE 'log_mensagem_activity: ok (out + in, org_id explícito)';
END $$;
