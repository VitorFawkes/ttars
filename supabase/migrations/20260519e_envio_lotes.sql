-- Rastreia cada disparo em lote feito pela aba "Envios do Dia" — agrupa o
-- conjunto de mensagens enviadas via send-echo-template num único "lote" pra:
--
--   1. Mostrar status "Enviando..." na linha da mensagem na aba Envios do Dia
--      enquanto o disparo está em andamento.
--   2. Permitir abrir um modal de relatório ao fim, listando quem recebeu
--      e quem falhou (com motivo).
--
-- Cada outbound em whatsapp_messages gerado pelo lote leva `metadata.envio_lote_id`,
-- permitindo recuperar a lista de destinatários e seus statuses.

BEGIN;

CREATE TABLE IF NOT EXISTS public.envio_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  sent INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'enviando' CHECK (status IN ('enviando', 'concluido', 'erro')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  triggered_by UUID,  -- user_id (opcional)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_envio_lotes_card_template
  ON public.envio_lotes(card_id, template_slug, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_envio_lotes_org_started
  ON public.envio_lotes(org_id, started_at DESC);

ALTER TABLE public.envio_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS envio_lotes_org_read ON public.envio_lotes;
CREATE POLICY envio_lotes_org_read ON public.envio_lotes FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

DROP POLICY IF EXISTS envio_lotes_service_all ON public.envio_lotes;
CREATE POLICY envio_lotes_service_all ON public.envio_lotes TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.envio_lotes TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.envio_lotes;

COMMIT;
