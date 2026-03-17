-- Adiciona motivo de perda padrão para deals perdidos vindos do ActiveCampaign
-- e configura o setting para que integration-process aplique automaticamente

-- 1. Criar motivo "Perdido via ActiveCampaign"
INSERT INTO public.motivos_perda (id, nome, ativo)
VALUES ('b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'Perdido via ActiveCampaign', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Configurar setting para integration-process usar este motivo como padrão
INSERT INTO public.integration_settings (key, value)
VALUES ('DEFAULT_LOST_MOTIVO_ID', 'b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
