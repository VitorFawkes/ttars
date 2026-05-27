-- Feature: Lista de Convidados — relaxar constraint has_identity
--
-- A constraint `wedding_guests_has_identity` (contato_id IS NOT NULL OR
-- nome_raw IS NOT NULL) impedia o casal de criar uma linha em branco para
-- preencher depois. Quando o casal clica "Adicionar pessoa neste convite",
-- o frontend chama upsert_pessoa com nome=''; a RPC faz NULLIF(p_nome, '')
-- que vira NULL, e a constraint rejeita.
--
-- Solução: relaxar a constraint para aceitar linhas-placeholder anexadas a
-- um casal (casal_id IS NOT NULL). Linhas órfãs sem nome E sem contato E
-- sem casal continuam sendo bloqueadas.

BEGIN;

ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_has_identity;

ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_has_identity
    CHECK (
      contato_id IS NOT NULL
      OR nome_raw IS NOT NULL
      OR casal_id IS NOT NULL
    );

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wedding_guests_has_identity') THEN
    RAISE EXCEPTION 'constraint não criada';
  END IF;
  RAISE NOTICE 'constraint relaxada OK';
END $$;
