-- Mapeia stages do AC pipeline 6 (Welcome Weddings - Planejamento) para o CRM.
-- Os mapeamentos existentes estão com pipeline_id='4' (ID legado) — o AC manda
-- pipeline=6, então integration-process aborta com "Unmapped Stage".
--
-- AC Pipeline 6 = fluxo PÓS-VENDA do Welcome Weddings (entra após contrato).
-- Por isso todas as stages mapeiam pra phase 'pos_venda' do CRM.

INSERT INTO public.integration_stage_map (
    integration_id, pipeline_id, external_stage_id, external_stage_name,
    internal_stage_id, direction, org_id
)
SELECT
    'a2141b92-561f-4514-92b4-9412a068d236'::uuid,  -- AC integration_id
    '6'::text,                                       -- AC pipeline 6 (Weddings Planejamento)
    map.external_stage_id::text,
    map.external_stage_name,
    map.internal_stage_id::uuid,
    'inbound'::text,
    'a0000000-0000-0000-0000-000000000001'::uuid    -- Welcome Group account
FROM (VALUES
    ('20', 'Boas-vindas + Questionário do Casal', 'ada5a419-1a98-4deb-9098-808507a3415e'),  -- → Boas-vindas e Questionário
    ('21', 'Primeira reunião - Onboarding',       'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c'),  -- → Concepção
    ('22', 'Propostas pré-definição',             '0f543791-92a6-4f34-b55e-785b854061f0'),  -- → Fornecedores em Contratação
    ('23', 'Definir casamento e hospedagem',      '0f543791-92a6-4f34-b55e-785b854061f0'),  -- → Fornecedores em Contratação
    ('25', 'Passagem do Casamento',               'b2c94cad-0ff9-4797-92cf-f6c48e9bc458')   -- → Convidados e Logística
) AS map(external_stage_id, external_stage_name, internal_stage_id)
WHERE NOT EXISTS (
    SELECT 1 FROM public.integration_stage_map m
     WHERE m.external_stage_id = map.external_stage_id
       AND m.pipeline_id = '6'
       AND m.direction = 'inbound'
);
