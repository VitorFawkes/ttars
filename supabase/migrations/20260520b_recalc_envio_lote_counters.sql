-- Recalcula sent/failed do envio_lote a partir das mensagens reais sempre que
-- uma whatsapp_messages com envio_lote_id muda (insert/update/delete).
--
-- Substitui increment_envio_lote_failed (que ficava dessincronizado quando
-- vários webhooks message.failed chegavam em paralelo, ou quando algum
-- whatsapp_message_id não conseguia ser localizado pra incrementar).

BEGIN;

CREATE OR REPLACE FUNCTION public.recalc_envio_lote_counters(p_lote_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.envio_lotes lote
  SET sent = stats.sent,
      failed = stats.failed,
      total = stats.total
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE NOT COALESCE(has_error, FALSE))::int AS sent,
      COUNT(*) FILTER (WHERE COALESCE(has_error, FALSE))::int AS failed,
      COUNT(*)::int AS total
    FROM public.whatsapp_messages
    WHERE direction = 'outbound'
      AND metadata->>'envio_lote_id' = p_lote_id::text
  ) AS stats
  WHERE lote.id = p_lote_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recalc_envio_lote_counters(UUID) TO service_role;

-- Trigger que dispara o recálculo ao mexer em whatsapp_messages
CREATE OR REPLACE FUNCTION public.trg_recalc_envio_lote()
RETURNS TRIGGER AS $$
DECLARE
  v_lote_id_new UUID;
  v_lote_id_old UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_lote_id_old := NULLIF(OLD.metadata->>'envio_lote_id', '')::UUID;
    IF v_lote_id_old IS NOT NULL THEN
      PERFORM public.recalc_envio_lote_counters(v_lote_id_old);
    END IF;
    RETURN OLD;
  END IF;

  v_lote_id_new := NULLIF(NEW.metadata->>'envio_lote_id', '')::UUID;
  IF v_lote_id_new IS NOT NULL THEN
    PERFORM public.recalc_envio_lote_counters(v_lote_id_new);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_lote_id_old := NULLIF(OLD.metadata->>'envio_lote_id', '')::UUID;
    IF v_lote_id_old IS NOT NULL AND v_lote_id_old <> COALESCE(v_lote_id_new, '00000000-0000-0000-0000-000000000000'::UUID) THEN
      PERFORM public.recalc_envio_lote_counters(v_lote_id_old);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalc_envio_lote_counters ON public.whatsapp_messages;
CREATE TRIGGER trg_recalc_envio_lote_counters
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_envio_lote();

-- Recalcula todos os lotes existentes pra sincronizar
DO $body$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.envio_lotes LOOP
    PERFORM public.recalc_envio_lote_counters(r.id);
  END LOOP;
END $body$;

COMMIT;
