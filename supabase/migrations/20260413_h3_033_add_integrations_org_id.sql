-- H3-033: adiciona org_id à tabela integrations e faz backfill.
-- Pós-Org-Split, integration-process precisa saber em qual org criar contatos.
-- Sem isto, INSERT em contatos falha com "null value in column org_id" (40%+ falhas AC).
-- AC está apontada para welcometrips.api-us1.com → backfill para Welcome Trips.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Backfill: AC → Welcome Trips (único provider AC ativo)
UPDATE public.integrations
SET org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND org_id IS NULL;

-- Outros providers sem org_id ficam nulos — integration-process faz fallback seguro
-- (rejeita evento com log claro em vez de criar contato em org errada).

CREATE INDEX IF NOT EXISTS idx_integrations_org_id ON public.integrations(org_id);
