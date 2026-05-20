-- ============================================================
-- Trip items: permitir cancelamento abrupto (aprovado/operacional → arquivado)
-- ============================================================
-- O trigger original de validação de transição não previa cancelamento
-- pós-aceite. Itens vendidos ficam aprovado/operacional e quando o cliente
-- cancela parcialmente a viagem, precisam ir direto para arquivado.
--
-- Liberamos a transição arquivado APENAS quando cancelado_em está setado
-- (i.e. cancelamento explícito), preservando o ciclo natural rascunho→
-- proposto→aprovado→operacional→vivido→arquivado para o resto dos casos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trip_items_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  valid BOOLEAN := false;
  is_cancellation BOOLEAN;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- "Cancelamento" = item está sendo cancelado nesta operação (cancelado_em vira NOT NULL).
  -- Quando true, libera a transição abrupta para arquivado a partir de qualquer estado pós-aceite.
  is_cancellation := (NEW.cancelado_em IS NOT NULL AND OLD.cancelado_em IS NULL);

  CASE OLD.status::text
    WHEN 'rascunho'     THEN valid := NEW.status IN ('proposto', 'arquivado');
    WHEN 'proposto'     THEN valid := NEW.status IN ('aprovado', 'recusado', 'rascunho')
                                 OR (NEW.status = 'arquivado' AND is_cancellation);
    WHEN 'aprovado'     THEN valid := NEW.status IN ('operacional', 'recusado')
                                 OR (NEW.status = 'arquivado' AND is_cancellation);
    WHEN 'recusado'     THEN valid := NEW.status IN ('rascunho', 'proposto')
                                 OR (NEW.status = 'arquivado' AND is_cancellation);
    WHEN 'operacional'  THEN valid := NEW.status IN ('vivido', 'aprovado')
                                 OR (NEW.status = 'arquivado' AND is_cancellation);
    WHEN 'vivido'       THEN valid := NEW.status IN ('arquivado');
    WHEN 'arquivado'    THEN valid := false;
    ELSE valid := false;
  END CASE;

  IF NOT valid THEN
    RAISE EXCEPTION 'trip_items: transição inválida % → % para item %',
      OLD.status, NEW.status, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-preencher aprovado_em quando aprovado
  IF NEW.status = 'aprovado' AND OLD.status <> 'aprovado' THEN
    NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());
  END IF;

  RETURN NEW;
END
$function$;
