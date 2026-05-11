-- Org Split Fase 3: Migrar cards e entidades filhas para orgs corretas
--
-- Cards com produto='TRIPS' → Welcome Trips (b0...01)
-- Cards com produto='WEDDING' → Welcome Weddings (b0...02)
-- Todas as 32 tabelas filhas herdam org_id do card pai

BEGIN;

-- =========================================================================
-- 1. Cards — split por produto
-- =========================================================================
UPDATE cards SET org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE produto::TEXT = 'TRIPS'
  AND org_id = 'a0000000-0000-0000-0000-000000000001';

UPDATE cards SET org_id = 'b0000000-0000-0000-0000-000000000002'
WHERE produto::TEXT = 'WEDDING'
  AND org_id = 'a0000000-0000-0000-0000-000000000001';

-- =========================================================================
-- 2. Tabelas filhas — herdam org_id do card
-- =========================================================================
-- Macro: para cada tabela com (org_id, card_id), copiar org_id do card pai

UPDATE activities t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE arquivos t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE automacao_execucoes t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE automation_log t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE cadence_entry_queue t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE cadence_event_log t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE cadence_instances t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_document_requirements t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_financial_items t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_milestones t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_opens t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_owner_history t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_phase_owners t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_tag_assignments t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE card_team_members t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE cards_contatos t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE contratos t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE historico_fases t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE integration_outbound_queue t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE iterpec_bookings t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE mensagens t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE monde_sales t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE n8n_ai_extraction_queue t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE notifications t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE product_requirements t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE proposal_trip_plans t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE proposals t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE reunioes t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE tarefas t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE whatsapp_groups t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE whatsapp_messages t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;
UPDATE whatsapp_raw_events t SET org_id = c.org_id FROM cards c WHERE c.id = t.card_id AND t.org_id = 'a0000000-0000-0000-0000-000000000001' AND c.org_id != t.org_id;

-- =========================================================================
-- 3. Contatos — atribuir à org do card mais recente
-- =========================================================================
-- Contatos que só têm cards TRIPS → Welcome Trips
UPDATE contatos co SET org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE co.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND EXISTS (
    SELECT 1 FROM cards_contatos cc JOIN cards c ON c.id = cc.card_id
    WHERE cc.contato_id = co.id AND c.produto::TEXT = 'TRIPS'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cards_contatos cc JOIN cards c ON c.id = cc.card_id
    WHERE cc.contato_id = co.id AND c.produto::TEXT = 'WEDDING'
  );

-- Contatos que só têm cards WEDDING → Welcome Weddings
UPDATE contatos co SET org_id = 'b0000000-0000-0000-0000-000000000002'
WHERE co.org_id = 'a0000000-0000-0000-0000-000000000001'
  AND EXISTS (
    SELECT 1 FROM cards_contatos cc JOIN cards c ON c.id = cc.card_id
    WHERE cc.contato_id = co.id AND c.produto::TEXT = 'WEDDING'
  )
  AND NOT EXISTS (
    SELECT 1 FROM cards_contatos cc JOIN cards c ON c.id = cc.card_id
    WHERE cc.contato_id = co.id AND c.produto::TEXT = 'TRIPS'
  );

-- Contatos com cards em AMBOS os produtos → ficam no Welcome Group
-- (visíveis via RLS que será atualizada para permitir parent org)

-- =========================================================================
-- 4. Contatos RLS — permitir ver contatos da org pai (holding)
-- =========================================================================
-- Contatos compartilhados ficam no Welcome Group e precisam ser visíveis
DROP POLICY IF EXISTS "contatos_org_select" ON contatos;

CREATE POLICY "contatos_org_select" ON contatos
    FOR SELECT TO authenticated
    USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
    );

COMMIT;
