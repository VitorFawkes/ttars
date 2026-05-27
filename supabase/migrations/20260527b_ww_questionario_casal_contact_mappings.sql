-- Mapeia campos do "Weddings | Questionário do casal" (contatos AC) para o CRM.
-- Validado com Marcelo: o time preenche os campos DW novos atualmente, então
-- precisamos puxar daqui em vez dos antigos "WW - * 2".
--
-- Campos do contato AC mapeados (versão "DW -" do questionário):
--   contact[fields][121] = DW - Previsão nº de convidados      → ww_questionario_convidados
--   contact[fields][376] = DW - Qual o orçamento para casamento → ww_questionario_orcamento
--   contact[fields][89]  = DW - Destino dos sonhos              → ww_questionario_destino_sonhos
--
-- Após aplicar esta migration, rodar a edge function integration-sync-deals
-- com force_update=true para popular os 70 cards Wedding já fechados a partir
-- dos contatos atrelados.

INSERT INTO public.integration_field_map (
    source, entity_type, external_field_id, local_field_key,
    direction, integration_id, storage_location, is_active, org_id
)
SELECT
    'active_campaign'::text,
    'contact'::text,
    fields.external_field_id,
    fields.local_field_key,
    'inbound'::text,
    'a2141b92-561f-4514-92b4-9412a068d236'::uuid,  -- AC integration_id existente
    'produto_data'::text,
    TRUE,
    'a0000000-0000-0000-0000-000000000001'::uuid   -- Welcome Group (account)
FROM (VALUES
    ('contact[fields][121]', 'ww_questionario_convidados'),
    ('contact[fields][376]', 'ww_questionario_orcamento'),
    ('contact[fields][89]',  'ww_questionario_destino_sonhos')
) AS fields(external_field_id, local_field_key)
WHERE NOT EXISTS (
    SELECT 1 FROM public.integration_field_map m
     WHERE m.external_field_id = fields.external_field_id
       AND m.local_field_key   = fields.local_field_key
       AND m.direction = 'inbound'
);
