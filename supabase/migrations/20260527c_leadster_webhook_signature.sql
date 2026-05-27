-- Registra o resultado da verificação de assinatura (JWT HS256) dos webhooks do Leadster.
-- Fase de inspeção: validamos e logamos, mas ainda NÃO rejeitamos requisições inválidas.

ALTER TABLE public.leadster_webhook_events
  ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN;

COMMENT ON COLUMN public.leadster_webhook_events.signature_valid IS
  'Resultado da verificação do JWT (HS256) assinado com o secret do Leadster. '
  'NULL = não havia token / secret não configurado; TRUE/FALSE = verificado.';
