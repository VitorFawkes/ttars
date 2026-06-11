-- Religa a entrada do ActiveCampaign para Weddings SOMENTE para atualização.
--
-- Contexto: a criação de leads de Weddings agora é do CRM (webhook Leadster,
-- ligado em 20260611c). O time segue trabalhando os deals no Active; este
-- migration religa os 6 gatilhos `update_only` de WW para que movimentações
-- de etapa/dono/status no Active reflitam nos cards do CRM. Os 5 gatilhos
-- `create_only` de WW PERMANECEM desligados (20260609) — deal novo no Active
-- não cria card.
--
-- Par desta migration: guarda UPDATE_ONLY_NO_CARD no integration-process
-- (deploy junto) — sem ela, um deal_update sem card correspondente cairia no
-- caminho de criação e o Active voltaria a criar cards por fora.
--
-- Reversível: is_active = false nos mesmos ids.

UPDATE public.integration_inbound_triggers
SET is_active = true
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND action_type = 'update_only'
  AND id IN (
    '8d1b76da-c9d7-4714-b38b-9e64c17005b1', -- SDR WW - Atualização (pipeline AC 1)
    '094bf894-f188-41f2-a449-aa4f2984a677', -- Closer WW - Atualização (3)
    'dc0b228a-89bc-49ff-8173-bc65fa25190e', -- Planejamento WW - Atualização (4)
    'ce2ec7e0-820f-4904-84fc-bba36a501dca', -- Elopement WW - Atualização (12)
    'bc1a5119-78d7-455d-8d02-0ddc854baeea', -- Internacional WW - Atualização (17)
    '706d5c1f-9080-4499-a1d7-823021a8eb39'  -- Desqualificados WW - Atualização (31)
  );
