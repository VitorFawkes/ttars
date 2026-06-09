-- Desliga por completo a entrada do ActiveCampaign para Weddings.
--
-- Contexto: a criação de leads de Weddings passa a vir do Leadster. O Active
-- decide o que entra via integration_inbound_triggers; integration-process
-- carrega apenas os is_active=true e, havendo gatilhos para a integração mas
-- nenhum casando, trata como allowlist e BLOQUEIA o evento. Logo, desligar
-- todos os gatilhos WW corta criação E atualização de Weddings, sem tocar em
-- Trips (gatilhos de Trips, pipelines 6/8, permanecem como estão).
--
-- Reversível: re-aplicar com is_active = true nos mesmos ids.

UPDATE public.integration_inbound_triggers
SET is_active = false
WHERE integration_id = 'a2141b92-561f-4514-92b4-9412a068d236'
  AND id IN (
    '5f22683f-8c0f-459e-b4b3-7316b1ed7f60', -- SDR WW - Criação (pipeline AC 1)
    '8d1b76da-c9d7-4714-b38b-9e64c17005b1', -- SDR WW - Atualização (1)
    '5862f0a8-86ca-4bff-85cb-96639d067a35', -- Closer WW - Criação (3)
    '094bf894-f188-41f2-a449-aa4f2984a677', -- Closer WW - Atualização (3)
    'dc48a207-aaf4-4f49-a6d8-85d1493387c0', -- Planejamento WW - Criação (4)
    'dc0b228a-89bc-49ff-8173-bc65fa25190e', -- Planejamento WW - Atualização (4)
    'ed29018d-e1c9-4c45-b146-6867c9fb059b', -- Elopement WW - Criação (12)
    'ce2ec7e0-820f-4904-84fc-bba36a501dca', -- Elopement WW - Atualização (12)
    'd7fbea80-d5ba-4f31-9cd9-47a337653bd9', -- Internacional WW - Criação (17)
    'bc1a5119-78d7-455d-8d02-0ddc854baeea', -- Internacional WW - Atualização (17)
    '706d5c1f-9080-4499-a1d7-823021a8eb39'  -- Desqualificados WW - Atualização (31)
  );
