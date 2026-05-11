-- H3-024: CRÍTICO — corrigir DEFAULT org_id hardcoded para requesting_org_id()
--
-- Problema: 67 tabelas têm DEFAULT org_id = 'a0000000-0000-0000-0000-000000000001'
-- (Welcome Group hardcoded). Isso causa falha silenciosa em INSERTs de orgs
-- não-Welcome-Group:
--
-- 1. Usuário de OrgB faz INSERT sem passar org_id
-- 2. Default insere 'a0000000...' (Welcome Group)
-- 3. RLS WITH CHECK (org_id = requesting_org_id()) valida
--    'a0000000...' = orgB_id → FALSE → INSERT negado
--
-- Resultado: UIs quebradas para qualquer org que não seja Welcome Group.
--
-- Fix: DEFAULT requesting_org_id() — função STABLE que extrai org_id do JWT.
--
-- Verificação pós-migration: SELECT count(*) FROM information_schema.columns
--   WHERE column_name='org_id' AND column_default LIKE '%a0000000%'
--   Deve retornar 0.

DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'activities', 'api_keys', 'arquivos', 'automation_log', 'automation_rules',
        'cadence_entry_queue', 'cadence_event_log', 'cadence_instances',
        'cadence_steps', 'cadence_templates', 'card_creation_rules',
        'card_document_requirements', 'card_financial_items', 'card_milestones',
        'card_owner_history', 'card_phase_owners', 'card_tag_assignments',
        'card_tags', 'card_team_members', 'cards', 'cards_contatos',
        'contato_meios', 'contatos', 'departments', 'destinations',
        'future_opportunities', 'historico_fases', 'integration_field_map',
        'integration_inbound_triggers', 'integration_outbound_queue',
        'integration_outbound_triggers', 'integration_settings',
        'integration_stage_map', 'invitations', 'mensagens', 'motivos_perda',
        'notification_type_config', 'notifications', 'phase_visibility_rules',
        'pipeline_card_settings', 'pipeline_phases', 'pipeline_stages',
        'pipelines', 'product_requirements', 'proposal_events',
        'proposal_items', 'proposal_sections', 'proposal_versions', 'proposals',
        'push_notification_preferences', 'push_subscriptions', 'reunioes',
        'roles', 'section_field_config', 'sections', 'stage_field_config',
        'stage_section_config', 'stage_transitions', 'system_fields', 'tarefas',
        'teams', 'text_blocks', 'whatsapp_conversations', 'whatsapp_groups',
        'whatsapp_messages', 'whatsapp_raw_events'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = v_table
              AND column_name = 'org_id'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ALTER COLUMN org_id SET DEFAULT requesting_org_id()',
                v_table
            );
            RAISE NOTICE 'Updated default for %.org_id', v_table;
        ELSE
            RAISE NOTICE 'Skipping % (table or column not found)', v_table;
        END IF;
    END LOOP;
END $$;

-- profiles é caso especial: default fica hardcoded Welcome Group porque no moment
-- do signup, o JWT ainda não tem org_id (ele é injetado pelo custom_access_token_hook
-- baseado no profile.org_id existente). Convites definem org_id explicitamente.
-- Se o convite não definir, cai no Welcome Group como fallback — que é o comportamento
-- desejado para super-admins da Welcome Group.
--
-- Exceção: se quisermos que novos signups SEM convite não caiam em Welcome Group,
-- isso precisa ser tratado no handle_new_user() trigger (fora do escopo desta migration).
