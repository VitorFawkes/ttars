-- Liga a criação real de contatos/cards WEDDING a partir do webhook Leadster
-- (leadster-webhook-wedding lê este flag em runtime — não precisa redeploy).
-- Pré-requisito (já aplicado em 20260609_disable_ac_weddings_inbound.sql): entrada
-- do ActiveCampaign de Weddings desligada — sem risco de lead duplicado.
-- Reversível: UPDATE ... SET value = 'false' na mesma linha (ou toggle na tela
-- Configurações → Leadster do workspace Weddings).

INSERT INTO public.integration_settings (key, value, org_id, produto, description)
VALUES (
  'leadster_create_cards',
  'true',
  'b0000000-0000-0000-0000-000000000002',  -- workspace Welcome Weddings
  NULL,
  'Webhook Leadster (Weddings): true = cria contato+card de verdade; false/ausente = modo ensaio'
)
ON CONFLICT (org_id, COALESCE(produto, '__GLOBAL__'), key)
DO UPDATE SET value = 'true', updated_at = now();
