-- Feature Convidados — redefinição de status_rsvp para 4 estados de negócio
--
-- Antes: ativo | confirmado | recusado | removido
-- Depois: nao_vai | sem_reacao | intencao | confirmado
--
-- Mapeamento da migração:
--   'ativo'    → 'sem_reacao'  (sem resposta ainda)
--   'recusado' → 'nao_vai'
--   'removido' → 'nao_vai'     (consolidado: "removido" deixa de existir;
--                                 hard-delete é a única forma de tirar da lista)
--   'confirmado' → 'confirmado'
--
-- Default passa de 'ativo' para 'sem_reacao'.

BEGIN;

-- 1) Solta o CHECK antigo
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_status_rsvp_check;

-- 2) Migra os valores existentes
UPDATE public.wedding_guests SET status_rsvp = 'sem_reacao' WHERE status_rsvp = 'ativo';
UPDATE public.wedding_guests SET status_rsvp = 'nao_vai'    WHERE status_rsvp IN ('recusado','removido');

-- 3) Default novo e CHECK novo
ALTER TABLE public.wedding_guests
  ALTER COLUMN status_rsvp SET DEFAULT 'sem_reacao';

ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_status_rsvp_check
    CHECK (status_rsvp IN ('nao_vai','sem_reacao','intencao','confirmado'));

COMMIT;

-- Validação
DO $$
DECLARE
  bad_count INTEGER;
  default_val TEXT;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM public.wedding_guests
  WHERE status_rsvp NOT IN ('nao_vai','sem_reacao','intencao','confirmado');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Encontrei % linhas com status_rsvp fora do novo enum', bad_count;
  END IF;

  SELECT column_default INTO default_val FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_guests' AND column_name='status_rsvp';
  IF default_val IS NULL OR default_val NOT LIKE '%sem_reacao%' THEN
    RAISE EXCEPTION 'Default não atualizado (atual: %)', default_val;
  END IF;

  RAISE NOTICE 'status_rsvp migrado para 4 estados OK';
END $$;
