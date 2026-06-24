-- Conserto de bug PRÉ-EXISTENTE: o trigger log_mensagem_activity (AFTER INSERT
-- em `mensagens`) referenciava colunas que não existem mais — `NEW.direcao`
-- (renomeada para `lado`) e `NEW.created_by` (mensagens nunca teve; tem
-- `remetente_interno_id`). Resultado: QUALQUER insert em `mensagens` estourava
-- com 42703 "record new has no field direcao" — por isso a tabela tem 0 linhas
-- na história. Além disso, com search_path='' o `insert into activities`
-- (sem schema) também falharia: qualificado para `public.activities`.
--
-- Isto destrava a tabela `mensagens` pra a plataforma inteira (e o e-mail do
-- card no Planejamento Weddings, que registra a conversa em mensagens).
--
-- TOP-5 #5: grep confirmou que NENHUMA migration de topo define
-- log_mensagem_activity (só _baseline/_archived). Recriação fiel da definição
-- atual de produção (pg_get_functiondef) com SÓ os 3 consertos de coluna/schema.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_mensagem_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
    if TG_OP = 'INSERT' and NEW.lado = 'out' then
        insert into public.activities (card_id, tipo, descricao, metadata, created_by)
        values (
            NEW.card_id,
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
  IF v_def LIKE '%NEW.direcao%' THEN
    RAISE EXCEPTION 'log_mensagem_activity ainda referencia NEW.direcao';
  END IF;
  IF v_def LIKE '%NEW.created_by%' THEN
    RAISE EXCEPTION 'log_mensagem_activity ainda referencia NEW.created_by';
  END IF;
  IF v_def NOT LIKE '%public.activities%' THEN
    RAISE EXCEPTION 'log_mensagem_activity: insert em activities não está qualificado';
  END IF;
  RAISE NOTICE 'log_mensagem_activity: consertado (lado/remetente_interno_id/public.activities)';
END $$;
