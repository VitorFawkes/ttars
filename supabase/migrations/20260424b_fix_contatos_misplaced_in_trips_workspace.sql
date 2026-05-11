-- Fix: 1131 contatos com org_id = Welcome Trips (workspace) quando deveriam estar
-- em Welcome Group (account pai). Welcome Group tem shares_contacts_with_children
-- = TRUE, então contatos vivem na account pra ficarem visíveis em todos os
-- workspaces filhos (Trips, Weddings, Courses).
--
-- Causa: webhook antigo do ActiveCampaign que criava contatos sem resolver
-- org_id pra account quando sharing estava ligado.
--
-- Complicação: ~38 contatos em Trips colidem com contatos já existentes em
-- Welcome Group pelo mesmo email/CPF (constraint unique por (org_id, email)
-- e (org_id, cpf_normalizado)). Pra esses, repontamos as FKs críticas pra
-- versão canônica em Welcome Group e deixamos CASCADE cuidar do resto.
--
-- Escopo final:
--   - ~38 duplicatas: FKs repontadas + linha Trips deletada
--   - ~1093 únicos: simples UPDATE de org_id
--   - contato_meios: acompanha o contato (move org_id junto)
--   - cards_contatos: NÃO mexemos — org_id dele reflete a do card, não a do
--     contato. (CASCADE cuida das 38 dups.)
--
-- Segurança: após mudança, RLS continua mostrando o contato pra workspace de
-- origem (Trips) via parent_org_id, e passa a mostrar também em Weddings.
--
-- Idempotente.

BEGIN;

-- =========================================================================
-- 1. Mapeamento duplicatas Trips → canônico em Welcome Group
-- =========================================================================
-- Match por email OR cpf. Quando há múltiplos candidatos, escolhe um (DISTINCT ON).
CREATE TEMP TABLE contato_dup_map ON COMMIT DROP AS
SELECT DISTINCT ON (t.id) t.id AS trips_id, w.id AS wg_id
FROM contatos t
JOIN contatos w ON (
    (t.email IS NOT NULL AND t.email <> ''
     AND lower(trim(t.email)) = lower(trim(w.email)))
    OR
    (t.cpf_normalizado IS NOT NULL
     AND t.cpf_normalizado = w.cpf_normalizado)
)
WHERE t.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND w.org_id = 'a0000000-0000-0000-0000-000000000001'::uuid
  AND t.deleted_at IS NULL
  AND w.deleted_at IS NULL
ORDER BY t.id,
    -- prefere match por email; depois por cpf
    CASE WHEN t.email IS NOT NULL AND lower(trim(t.email)) = lower(trim(w.email)) THEN 0 ELSE 1 END,
    w.created_at;

-- =========================================================================
-- 2. Repontamento de FKs críticas (SET NULL que perderíamos com CASCADE)
-- =========================================================================
UPDATE cards c
SET pessoa_principal_id = m.wg_id
FROM contato_dup_map m
WHERE c.pessoa_principal_id = m.trips_id;

UPDATE cards c
SET indicado_por_id = m.wg_id
FROM contato_dup_map m
WHERE c.indicado_por_id = m.trips_id;

UPDATE contatos c
SET responsavel_id = m.wg_id
FROM contato_dup_map m
WHERE c.responsavel_id = m.trips_id;

UPDATE ai_conversations a
SET contact_id = m.wg_id
FROM contato_dup_map m
WHERE a.contact_id = m.trips_id;

UPDATE whatsapp_groups w
SET contact_id = m.wg_id
FROM contato_dup_map m
WHERE w.contact_id = m.trips_id;

UPDATE whatsapp_messages w
SET contact_id = m.wg_id
FROM contato_dup_map m
WHERE w.contact_id = m.trips_id;

UPDATE whatsapp_raw_events w
SET contact_id = m.wg_id
FROM contato_dup_map m
WHERE w.contact_id = m.trips_id;

-- Repontar cards_contatos quando possível (dedup: se canônico já está linkado, deleta linha Trips)
DELETE FROM cards_contatos cc
USING contato_dup_map m
WHERE cc.contato_id = m.trips_id
  AND EXISTS (
    SELECT 1 FROM cards_contatos cc2
    WHERE cc2.card_id = cc.card_id AND cc2.contato_id = m.wg_id
  );

UPDATE cards_contatos cc
SET contato_id = m.wg_id
FROM contato_dup_map m
WHERE cc.contato_id = m.trips_id;

-- =========================================================================
-- 3. Deletar duplicatas — CASCADE cuida de contato_meios, ai_outbound_queue,
--    card_document_requirements, card_gift_assignments, contact_stats,
--    monde_people_queue, reactivation_patterns, reactivation_suppressions,
--    whatsapp_conversations dos contatos deletados.
-- =========================================================================
DELETE FROM contatos c
USING contato_dup_map m
WHERE c.id = m.trips_id;

-- =========================================================================
-- 4. Os ~1093 contatos que não colidem: mover org_id para Welcome Group
-- =========================================================================
UPDATE contato_meios
SET org_id = 'a0000000-0000-0000-0000-000000000001'::uuid
WHERE org_id = 'b0000000-0000-0000-0000-000000000001'::uuid;

UPDATE contatos
SET org_id = 'a0000000-0000-0000-0000-000000000001'::uuid
WHERE org_id = 'b0000000-0000-0000-0000-000000000001'::uuid;

COMMIT;
