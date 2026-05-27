-- Feature: Fluxo de Extras para Convidados Confirmados
--
-- Kanban onde cada card é um convidado com RSVP 'confirmado'. O card anda por
-- 4 colunas conforme a venda de extras (passeio, restaurante, experiência):
--   oferecido → interessado → confirmado → pago
-- Os extras são texto livre por convidado (JSONB itens).
--
-- Modelo: 1 linha por convidado (UNIQUE guest_id), criada lazy — convidado
-- confirmado sem ação aparece em 'oferecido' (default da view) sem linha.
--
-- Regras CLAUDE.md aplicadas:
--   - Tabela por-org com FK para wedding_guests (tabela por-org) → trigger que
--     força org_id = guest.org_id e espelha card_id (modelo wedding_guests_set_org_v3).
--   - RLS por-org (authenticated: org_id = requesting_org_id(); service_role: true).
--   - RPC SECURITY DEFINER valida que o guest pertence a requesting_org_id().
--   - RPC de auditoria cross-org para o smoke test (deve retornar 0).
--   - Nomes de função/tabela inéditos (grep confirmou) — sem rebase.

BEGIN;

-- ── 1) Tabela ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_guest_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL UNIQUE
    REFERENCES public.wedding_guests(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id),     -- espelhado do guest (wedding pai)
  org_id UUID NOT NULL,                          -- derivado do guest via trigger
  status TEXT NOT NULL DEFAULT 'oferecido',
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ id, descricao, valor }] texto livre
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.wedding_guest_extras
  DROP CONSTRAINT IF EXISTS wedding_guest_extras_status_check;
ALTER TABLE public.wedding_guest_extras
  ADD CONSTRAINT wedding_guest_extras_status_check
    CHECK (status IN ('oferecido','interessado','confirmado','pago'));

CREATE INDEX IF NOT EXISTS idx_wge_card_id
  ON public.wedding_guest_extras(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wge_org_status
  ON public.wedding_guest_extras(org_id, status);

COMMENT ON TABLE public.wedding_guest_extras IS
  'Estado da venda de extras (passeio/restaurante/experiência) por convidado confirmado. Por-org; org_id e card_id derivados do guest via trigger.';

-- ── 2) Trigger: força org_id = guest.org_id e espelha card_id ──────────────
DROP FUNCTION IF EXISTS public.wedding_guest_extras_set_org() CASCADE;
CREATE FUNCTION public.wedding_guest_extras_set_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID;
  v_card UUID;
BEGIN
  SELECT org_id, card_id INTO v_org, v_card
  FROM public.wedding_guests WHERE id = NEW.guest_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'wedding_guest_extras: guest_id % não encontrado em wedding_guests', NEW.guest_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> v_org THEN
    RAISE EXCEPTION 'wedding_guest_extras.org_id (%) diverge do guest (%)', NEW.org_id, v_org
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := v_org;
  NEW.card_id := v_card;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wge_set_org ON public.wedding_guest_extras;
CREATE TRIGGER trg_wge_set_org
  BEFORE INSERT OR UPDATE OF guest_id, org_id, card_id ON public.wedding_guest_extras
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_guest_extras_set_org();

-- ── 3) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.wedding_guest_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wge_org_all ON public.wedding_guest_extras;
CREATE POLICY wge_org_all ON public.wedding_guest_extras
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wge_service_all ON public.wedding_guest_extras;
CREATE POLICY wge_service_all ON public.wedding_guest_extras
  TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wedding_guest_extras TO authenticated;
GRANT ALL ON public.wedding_guest_extras TO service_role;

-- ── 4) View: convidados confirmados + estado de extras (LEFT JOIN) ─────────
-- Default 'oferecido' quando ainda não há linha em wedding_guest_extras.
CREATE OR REPLACE VIEW public.v_wedding_guest_extras AS
SELECT
  g.id                              AS guest_id,
  g.card_id,
  g.org_id,
  COALESCE(g.nome_raw, c.nome)      AS nome,
  COALESCE(NULLIF(c.sobrenome, ''), '') AS sobrenome,
  COALESCE(g.telefone_raw, c.telefone)  AS telefone,
  COALESCE(g.email_raw, c.email)        AS email,
  card.titulo                       AS casamento_nome,
  COALESCE(we.status, 'oferecido')  AS extras_status,
  COALESCE(we.itens, '[]'::jsonb)   AS itens,
  we.observacoes,
  we.id                             AS extras_id,
  we.updated_at                     AS extras_updated_at
FROM public.wedding_guests g
LEFT JOIN public.contatos c        ON c.id = g.contato_id
LEFT JOIN public.cards card        ON card.id = g.card_id
LEFT JOIN public.wedding_guest_extras we ON we.guest_id = g.id
WHERE g.status_rsvp = 'confirmado'
  AND g.card_id IS NOT NULL;

GRANT SELECT ON public.v_wedding_guest_extras TO authenticated, service_role;

-- ── 5) RPC de mutação: upsert por guest_id (SECURITY DEFINER) ──────────────
-- Valida que o guest pertence a requesting_org_id() antes de gravar.
-- Params NULL = "não mexer nesse campo" (permite mover só status, ou só itens).
DROP FUNCTION IF EXISTS public.upsert_guest_extras(uuid, text, jsonb, text);
CREATE FUNCTION public.upsert_guest_extras(
  p_guest_id   UUID,
  p_status     TEXT  DEFAULT NULL,
  p_itens      JSONB DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS public.wedding_guest_extras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_guest_org UUID;
  v_result public.wedding_guest_extras;
BEGIN
  SELECT org_id INTO v_guest_org FROM public.wedding_guests WHERE id = p_guest_id;
  IF v_guest_org IS NULL THEN
    RAISE EXCEPTION 'upsert_guest_extras: convidado % não encontrado', p_guest_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_guest_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'upsert_guest_extras: convidado fora da org atual'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('oferecido','interessado','confirmado','pago') THEN
    RAISE EXCEPTION 'upsert_guest_extras: status inválido %', p_status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.wedding_guest_extras (guest_id, status, itens, observacoes, created_by)
  VALUES (
    p_guest_id,
    COALESCE(p_status, 'oferecido'),
    COALESCE(p_itens, '[]'::jsonb),
    p_observacoes,
    auth.uid()
  )
  ON CONFLICT (guest_id) DO UPDATE SET
    status      = COALESCE(p_status, public.wedding_guest_extras.status),
    itens       = COALESCE(p_itens, public.wedding_guest_extras.itens),
    observacoes = CASE WHEN p_observacoes IS NULL
                       THEN public.wedding_guest_extras.observacoes
                       ELSE p_observacoes END,
    updated_at  = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_guest_extras(uuid, text, jsonb, text)
  TO authenticated, service_role;

-- ── 6) RPC de auditoria cross-org (smoke test → deve retornar 0) ───────────
DROP FUNCTION IF EXISTS public.wedding_guest_extras_cross_org_count();
CREATE FUNCTION public.wedding_guest_extras_cross_org_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COUNT(*)::int
  FROM public.wedding_guest_extras we
  JOIN public.wedding_guests g ON g.id = we.guest_id
  WHERE we.org_id <> g.org_id OR we.card_id IS DISTINCT FROM g.card_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.wedding_guest_extras_cross_org_count()
  TO authenticated, service_role;

COMMIT;

-- ── Verificação pós-migration ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='wedding_guest_extras') THEN
    RAISE EXCEPTION 'tabela wedding_guest_extras não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='v_wedding_guest_extras') THEN
    RAISE EXCEPTION 'view v_wedding_guest_extras não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_wge_set_org') THEN
    RAISE EXCEPTION 'trigger trg_wge_set_org não criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='upsert_guest_extras') THEN
    RAISE EXCEPTION 'RPC upsert_guest_extras não criada';
  END IF;
  RAISE NOTICE 'wedding_guest_extras + trigger + view + RPCs OK';
END $$;
