-- HIGH-2: Adiciona UNIQUE constraint em cards(external_id, external_source)
-- Previne duplicatas de cards sincronizados do ActiveCampaign
-- Partial unique: permite NULL external_id (cards criados internamente)

ALTER TABLE public.cards
  ADD CONSTRAINT uq_cards_external_identity
  UNIQUE (external_id, external_source);

-- Nota: O index idx_cards_external_id_source (non-unique) já existe.
-- A constraint acima cria um index unique automaticamente, substituindo-o.
-- Se a migration falhar por duplicatas existentes, rode antes:
--   SELECT external_id, external_source, count(*)
--   FROM cards
--   WHERE external_id IS NOT NULL
--   GROUP BY external_id, external_source
--   HAVING count(*) > 1;
