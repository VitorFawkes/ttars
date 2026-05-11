-- Migration: Adiciona monde_person_id na tabela contatos
-- Permite linkar contatos com pessoas na API V2 do Monde
-- Separado de external_id/external_source (usado pelo ActiveCampaign)

ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS monde_person_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contatos_monde_person_id
  ON public.contatos(monde_person_id)
  WHERE monde_person_id IS NOT NULL;

COMMENT ON COLUMN public.contatos.monde_person_id IS 'UUID da pessoa na API V2 do Monde';

-- Integration settings para Monde V2 People API
INSERT INTO public.integration_settings (key, value, description)
VALUES
  ('MONDE_V2_API_URL', 'https://web.monde.com.br/api/v2', 'URL base da API V2 do Monde (People/Tasks)'),
  ('MONDE_V2_SYNC_ENABLED', 'false', 'Habilita sync bidirecional de contatos com Monde V2'),
  ('MONDE_V2_SYNC_DIRECTION', 'bidirectional', 'Direção do sync: bidirectional, outbound_only, inbound_only')
ON CONFLICT (key) DO NOTHING;
