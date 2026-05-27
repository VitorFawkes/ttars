-- Rastreia o card criado a partir de um webhook do Leadster.
-- Enquanto LEADSTER_CREATE_CARDS está desligado (modo ensaio), created_card_id
-- permanece NULL e o "plano" do que seria feito é gravado em process_error.
-- Quando ligado, created_card_id aponta para o card criado (ou o card reaproveitado em dedup).

ALTER TABLE public.leadster_webhook_events
  ADD COLUMN IF NOT EXISTS created_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leadster_webhook_events.created_card_id IS
  'Card resultante do processamento deste webhook (criado ou reaproveitado em dedup). '
  'NULL = ainda não processado / modo ensaio (ver process_error para o plano).';
