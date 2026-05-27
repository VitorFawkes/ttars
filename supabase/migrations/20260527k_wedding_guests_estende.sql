-- Feature: Lista de Convidados — Estende wedding_guests (Marco 1.3)
--
-- Conferi as 2 migrations anteriores que tocam auto_set_wedding_guests_org_id():
--   20260515d_wedding_guests.sql       — versão original (valida card_org, deriva org_id)
--   20260515f_wedding_guests_link_contatos.sql — adicionou validação contato_exists +
--     atualizou trigger para incluir contato_id na lista de UPDATE OF.
--
-- Para evitar rebase da função antiga, esta migration cria uma FUNÇÃO NOVA
-- com nome distinto `wedding_guests_set_org_v3()` e substitui o trigger
-- atomicamente. A função antiga permanece em pg_proc (dead code) mas não
-- está mais referenciada por trigger algum. PRESERVADO:
--   - validação card_org cross-org (v20260515d)
--   - validação contato_exists (v20260515f)
--   - trigger fire on UPDATE OF card_id, org_id, contato_id (v20260515f)
-- ADICIONADO:
--   - precedência casal_id > card_id ao derivar org_id
--   - espelhamento de card_id a partir do casal pai
--   - trigger fire on UPDATE OF casal_id também
--
-- Demais mudanças:
-- 1) Vínculo a convite (grupo) e a casal órfão
-- 2) Campos novos: faixa etária, lado (noiva/noivo/ambos), tipo de relação
-- 3) Identidade "raw" preenchida pelo casal antes de virar contato no CRM
-- 4) Relaxar NOT NULL em contato_id e card_id
-- 5) View v_wedding_guests_resolved para uso pelo frontend

BEGIN;

-- ── 1) Adiciona colunas novas ────────────────────────────────────────────
ALTER TABLE public.wedding_guests
  ADD COLUMN IF NOT EXISTS convite_id UUID NULL
    REFERENCES public.wedding_convites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS casal_id UUID NULL
    REFERENCES public.wedding_casais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS faixa TEXT NOT NULL DEFAULT 'adulto',
  ADD COLUMN IF NOT EXISTS lado TEXT NULL,
  ADD COLUMN IF NOT EXISTS tipo TEXT NULL,
  ADD COLUMN IF NOT EXISTS nome_raw TEXT NULL,
  ADD COLUMN IF NOT EXISTS telefone_raw TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_raw TEXT NULL,
  ADD COLUMN IF NOT EXISTS posicao INTEGER NOT NULL DEFAULT 0;

-- ── 2) CHECK constraints ─────────────────────────────────────────────────
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_faixa_check;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_faixa_check
    CHECK (faixa IN ('adulto','idoso','crianca','bebe'));

ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_lado_check;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_lado_check
    CHECK (lado IS NULL OR lado IN ('ambos','noiva','noivo'));

ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_tipo_check;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_tipo_check
    CHECK (tipo IS NULL OR tipo IN ('amigo','familia','padrinho'));

-- ── 3) Relaxa NOT NULL em contato_id e card_id ────────────────────────────
ALTER TABLE public.wedding_guests
  ALTER COLUMN contato_id DROP NOT NULL,
  ALTER COLUMN card_id DROP NOT NULL;

-- ── 4) Cada guest precisa de uma âncora (card OU casal) e identidade
--      (contato_id OU nome_raw). ─────────────────────────────────────────
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_has_anchor;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_has_anchor
    CHECK (card_id IS NOT NULL OR casal_id IS NOT NULL);

ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_has_identity;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_has_identity
    CHECK (contato_id IS NOT NULL OR nome_raw IS NOT NULL);

-- ── 5) Drop UNIQUE antigo (card_id, contato_id) — substituído por índice
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_card_contato_unique;

-- ── 6) Índices novos ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wedding_guests_convite_id
  ON public.wedding_guests(convite_id) WHERE convite_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wedding_guests_casal_id
  ON public.wedding_guests(casal_id) WHERE casal_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wedding_guests_card_contato_uniq
  ON public.wedding_guests(card_id, contato_id)
  WHERE card_id IS NOT NULL AND contato_id IS NOT NULL;

-- ── 7) Função NOVA: wedding_guests_set_org_v3 ────────────────────────────
-- Nome distinto da auto_set_wedding_guests_org_id (v1/v2) para evitar rebase
-- cego. Preserva validações originais. Documenta lineage abaixo.
DROP FUNCTION IF EXISTS public.wedding_guests_set_org_v3() CASCADE;
CREATE FUNCTION public.wedding_guests_set_org_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID;
  v_casal_card UUID;
  v_card_org UUID;
  v_contato_exists BOOLEAN;
BEGIN
  -- Precedência casal > card: se casal_id presente, deriva dele
  IF NEW.casal_id IS NOT NULL THEN
    SELECT org_id, card_id INTO v_org, v_casal_card
    FROM public.wedding_casais
    WHERE id = NEW.casal_id;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'wedding_guests: casal_id % não encontrado em wedding_casais', NEW.casal_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    -- Espelha card_id do casal (idempotente)
    IF v_casal_card IS NOT NULL AND (NEW.card_id IS NULL OR NEW.card_id <> v_casal_card) THEN
      NEW.card_id := v_casal_card;
    END IF;
  ELSIF NEW.card_id IS NOT NULL THEN
    -- Caminho original preservado de v20260515d: deriva de cards
    SELECT org_id INTO v_card_org FROM public.cards WHERE id = NEW.card_id;
    IF v_card_org IS NULL THEN
      RAISE EXCEPTION 'wedding_guests: card_id % não encontrado em cards', NEW.card_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    v_org := v_card_org;
  ELSE
    RAISE EXCEPTION 'wedding_guests: precisa de card_id ou casal_id'
      USING ERRCODE = 'check_violation';
  END IF;

  -- PRESERVADO da v20260515f: contato_exists check quando contato_id presente.
  IF NEW.contato_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.contatos WHERE id = NEW.contato_id) INTO v_contato_exists;
    IF NOT v_contato_exists THEN
      RAISE EXCEPTION 'wedding_guests: contato_id % não encontrado em contatos', NEW.contato_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- PRESERVADO da v20260515d: check cross-org antes de gravar.
  IF NEW.org_id IS NOT NULL AND NEW.org_id <> v_org THEN
    RAISE EXCEPTION 'wedding_guests.org_id (%) diverge da origem (%)',
      NEW.org_id, v_org
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := v_org;
  RETURN NEW;
END
$fn$;

-- Substitui trigger antigo (que apontava pra auto_set_wedding_guests_org_id).
-- Função antiga continua em pg_proc mas sem trigger ativo.
DROP TRIGGER IF EXISTS trg_wedding_guests_strict_org ON public.wedding_guests;
CREATE TRIGGER trg_wedding_guests_strict_org_v3
  BEFORE INSERT OR UPDATE OF card_id, org_id, contato_id, casal_id ON public.wedding_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_guests_set_org_v3();

-- ── 8) View v_wedding_guests_resolved ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_wedding_guests_resolved AS
SELECT
  g.id,
  g.card_id,
  g.casal_id,
  g.convite_id,
  g.contato_id,
  g.org_id,
  g.faixa,
  g.lado,
  g.tipo,
  g.status_rsvp,
  g.observacoes,
  g.posicao,
  g.created_at,
  g.updated_at,
  g.created_by,
  g.nome_raw,
  g.telefone_raw,
  g.email_raw,
  COALESCE(g.nome_raw, c.nome) AS nome_display,
  COALESCE(NULLIF(c.sobrenome, ''), '') AS sobrenome_display,
  COALESCE(g.telefone_raw, c.telefone) AS telefone_display,
  COALESCE(g.email_raw, c.email) AS email_display,
  cv.nome AS convite_nome,
  cv.posicao AS convite_posicao
FROM public.wedding_guests g
LEFT JOIN public.contatos c ON c.id = g.contato_id
LEFT JOIN public.wedding_convites cv ON cv.id = g.convite_id;

GRANT SELECT ON public.v_wedding_guests_resolved TO authenticated, service_role;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='wedding_guests' AND column_name='convite_id') THEN
    RAISE EXCEPTION 'convite_id não adicionado a wedding_guests';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='v_wedding_guests_resolved') THEN
    RAISE EXCEPTION 'view v_wedding_guests_resolved não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgname='trg_wedding_guests_strict_org_v3') THEN
    RAISE EXCEPTION 'trigger v3 não criado';
  END IF;
  RAISE NOTICE 'wedding_guests estendido + view + trigger v3 OK';
END $$;
