-- Fase A1 do plano de isolamento por workspace
-- Remove políticas RLS `USING (true)` para authenticated/public que convivem
-- com policies org-scoped e neutralizam o isolamento (PostgreSQL OR entre
-- policies permissivas).
--
-- Lista gerada a partir de pg_policies em 2026-04-14, restrita a tabelas
-- que JÁ têm coluna org_id E JÁ têm policy `*_org_*` ativa — portanto o
-- DROP apenas remove o buraco, sem deixar a tabela sem policy.
--
-- Vazamento comprovado antes do fix: user logado em Welcome Trips via
-- REST API retornava whatsapp_messages de Welcome Group e Welcome Weddings.

DO $$
DECLARE
  r RECORD;
  drops TEXT[][] := ARRAY[
    ['card_document_requirements', 'cdr_all'],
    ['card_owner_history', 'Users can view owner history'],
    ['card_tag_assignments', 'card_tag_assignments_select'],
    ['card_tag_assignments', 'card_tag_assignments_write'],
    ['contato_meios', 'contato_meios_select'],
    ['destinations', 'Anyone can view destinations'],
    ['integration_field_map', 'integration_field_map_authenticated_select'],
    ['integration_inbound_triggers', 'Allow authenticated select'],
    ['integration_outbound_queue', 'Allow authenticated read'],
    ['notification_type_config', 'Anyone can read notification config'],
    ['phase_visibility_rules', 'phase_visibility_rules_read'],
    ['product_requirements', 'product_requirements_select'],
    ['proposal_events', 'Authenticated users can view proposal events'],
    ['proposal_items', 'Users can view proposal items'],
    ['proposal_sections', 'Users can view proposal sections'],
    ['proposal_versions', 'Users can view proposal versions'],
    ['stage_field_config', 'Public read access'],
    ['stage_section_config', 'Public read access'],
    ['stage_transitions', 'Allow read access to everyone'],
    ['whatsapp_conversations', 'Authenticated users can view whatsapp_conversations'],
    ['whatsapp_groups', 'Authenticated users can view whatsapp_groups'],
    ['whatsapp_messages', 'Authenticated users can view whatsapp_messages']
  ];
  t TEXT;
  p TEXT;
  i INT;
BEGIN
  FOR i IN 1..array_length(drops, 1) LOOP
    t := drops[i][1];
    p := drops[i][2];
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END IF;
  END LOOP;
END $$;
