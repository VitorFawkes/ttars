-- Função usada pelo webhook whatsapp-webhook quando recebe message.status=failed
-- — incrementa o contador `failed` do envio_lote correspondente (e decrementa
-- o `sent`, já que a mensagem foi contada como enviada quando saiu).

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_envio_lote_failed(p_lote_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.envio_lotes
  SET failed = failed + 1,
      sent = GREATEST(sent - 1, 0)
  WHERE id = p_lote_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.increment_envio_lote_failed(UUID) TO service_role;

COMMIT;
