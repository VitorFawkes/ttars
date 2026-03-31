-- ============================================================================
-- Fix: Add deal field mappings for new WT ActiveCampaign fields (IDs 161001-161006)
--
-- These 6 fields were recently added to AC and contain real lead data
-- (tempo para viagem, mensagem extra, com quem, hospedagem, buscando, origem conversão)
-- but had no deal-level mappings, so their data went to unmapped_fields.
--
-- The data for these fields also comes via contact[fields] mappings in deal_add events,
-- but deal_update events only send deal[fields] (no contact data).
-- With the updated parseCustomFields using [id] instead of sequential index,
-- these mappings will correctly capture the data from deal_update webhooks.
-- ============================================================================

INSERT INTO public.integration_field_map
    (id, source, entity_type, external_field_id, local_field_key, direction, integration_id, section, external_pipeline_id, sync_always, is_active, storage_location, db_column_name)
VALUES
    -- WT Tem Hospedagem contratada (AC ID 161001)
    (gen_random_uuid(), 'active_campaign', 'deal', '161001', 'mkt_hospedagem_contratada', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL),

    -- WT Tempo para Viagem (AC ID 161002)
    (gen_random_uuid(), 'active_campaign', 'deal', '161002', 'mkt_pretende_viajar_tempo', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL),

    -- WT - Com quem? (AC ID 161003)
    (gen_random_uuid(), 'active_campaign', 'deal', '161003', 'mkt_quem_vai_viajar_junto', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL),

    -- WT - Mensagem Extra (AC ID 161004)
    (gen_random_uuid(), 'active_campaign', 'deal', '161004', 'mkt_mensagem_personalizada_formulario', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL),

    -- WTN O que voce esta buscando (AC ID 161005)
    (gen_random_uuid(), 'active_campaign', 'deal', '161005', 'mkt_buscando_para_viagem', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL),

    -- [WT]Origem da última conversão (AC ID 161006)
    (gen_random_uuid(), 'active_campaign', 'deal', '161006', 'mkt_origem_ultima_conversao', 'inbound',
     'a2141b92-561f-4514-92b4-9412a068d236', 'trip_info', '8', true, true, 'marketing_data', NULL)

ON CONFLICT DO NOTHING;
