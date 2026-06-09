-- Cadastra "leadster" como fonte de lead na org Welcome Weddings.
--
-- O webhook leadster-webhook-wedding cria cards com origem='leadster'. Um trigger
-- valida que `cards.origem` exista em lead_sources da org; sem este registro a
-- criação falha com check_violation. É fonte de integração (chatbot Leadster no site).

INSERT INTO public.lead_sources (org_id, value, label, icon, color, is_system, is_integration, ordem, ativa)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'leadster',
  'Leadster',
  'Bot',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  true,
  true,
  215,
  true
)
ON CONFLICT (org_id, value) DO NOTHING;
