-- Adiciona mapeamento das stages órfãs AC 146 ("Casais com Aditivo Contratual")
-- e 147 ("Casamentos Cancelados") para o pipeline 6. Sem isso, 14 deals já
-- fechados (vendidos no passado mas depois movidos pra stages especiais de
-- pós-venda) não conseguem ser processados — bloqueando os contact fields DW.
--
-- Mapeamento:
--   AC 146 (Casais com Aditivo Contratual) → CRM "Pós-casamento" (4324a8c5)
--     Aditivo contratual = ajuste pós-contrato durante o planejamento → mantém em pós-venda
--   AC 147 (Casamentos Cancelados)         → CRM "Cancelado" (62dd4da7)
--     Vendas que depois foram canceladas → stage de resolução

INSERT INTO public.integration_stage_map (
    integration_id, pipeline_id, external_stage_id, external_stage_name,
    internal_stage_id, direction, org_id
)
SELECT
    'a2141b92-561f-4514-92b4-9412a068d236'::uuid,
    '6'::text,
    map.external_stage_id::text,
    map.external_stage_name,
    map.internal_stage_id::uuid,
    'inbound'::text,
    'a0000000-0000-0000-0000-000000000001'::uuid
FROM (VALUES
    ('146', 'Casais com Aditivo Contratual', '4324a8c5-bb01-4d41-991e-4d2d39155338'),
    ('147', 'Casamentos Cancelados',          '62dd4da7-c3ec-48e6-afb3-7f76c9cec52c')
) AS map(external_stage_id, external_stage_name, internal_stage_id)
WHERE NOT EXISTS (
    SELECT 1 FROM public.integration_stage_map m
     WHERE m.external_stage_id = map.external_stage_id
       AND m.pipeline_id = '6'
       AND m.direction = 'inbound'
);
