-- Isolamento por workspace nas filas de execução de cadência + enforcement de org_id.
--
-- Problema:
--   1. cadence_queue (fila viva de passos, consumida por processQueue) NÃO tinha org_id
--      e a RLS era `cadence_queue_all (ALL) USING (true)` — qualquer usuário autenticado
--      lia a fila de qualquer workspace. Viola o isolamento por workspace.
--   2. cadence_dead_letter (log de passos que falharam) idem: USING (true), sem org_id.
--   3. cadence_instances já tinha org_id mas NÃO tinha trigger forçando = card.org_id
--      (diferente de cadence_steps/cadence_event_triggers), permitindo divergência.
--
-- Esta migration:
--   - Adiciona org_id (+ backfill + FK + índice) em cadence_queue e cadence_dead_letter.
--   - Substitui as policies permissivas por isolamento org + bypass service_role.
--   - Instala triggers BEFORE INSERT/UPDATE forçando org_id derivado do pai
--     (instance → org_id) em cadence_queue, e (card → org_id) em cadence_instances.
--   - Índice parcial de polling em cadence_queue(status, execute_at) WHERE pending.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. cadence_queue — org_id + backfill + trigger + RLS + índice
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  has_table BOOLEAN;
  has_col BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='cadence_queue') INTO has_table;
  IF NOT has_table THEN
    RAISE NOTICE 'cadence_queue não existe — skip.';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cadence_queue' AND column_name='org_id') INTO has_col;

  IF NOT has_col THEN
    ALTER TABLE public.cadence_queue ADD COLUMN org_id UUID;

    -- Backfill via instance → org_id (instance_id é NOT NULL FK, sempre existe)
    UPDATE public.cadence_queue q
    SET org_id = i.org_id
    FROM public.cadence_instances i
    WHERE i.id = q.instance_id AND q.org_id IS NULL;

    -- Linhas órfãs (instância apagada): remover, não há como atribuir org com segurança
    DELETE FROM public.cadence_queue WHERE org_id IS NULL;

    ALTER TABLE public.cadence_queue ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE public.cadence_queue
      ADD CONSTRAINT cadence_queue_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id);
  END IF;

  CREATE INDEX IF NOT EXISTS idx_cadence_queue_org_id ON public.cadence_queue(org_id);
  CREATE INDEX IF NOT EXISTS idx_cadence_queue_pending_exec
    ON public.cadence_queue(status, execute_at) WHERE status = 'pending';
END $$;

-- Trigger: org_id sempre = instance.org_id
CREATE OR REPLACE FUNCTION public.auto_set_cadence_queue_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  instance_org UUID;
BEGIN
  SELECT org_id INTO instance_org
  FROM public.cadence_instances WHERE id = NEW.instance_id;

  IF instance_org IS NULL THEN
    RAISE EXCEPTION 'cadence_queue: instance_id % não encontrado em cadence_instances', NEW.instance_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> instance_org THEN
    RAISE EXCEPTION 'cadence_queue.org_id (%) diverge de cadence_instances.org_id (%) para instance %',
      NEW.org_id, instance_org, NEW.instance_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := instance_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS auto_set_cadence_queue_org_id_trigger ON public.cadence_queue;
CREATE TRIGGER auto_set_cadence_queue_org_id_trigger
  BEFORE INSERT OR UPDATE OF instance_id, org_id ON public.cadence_queue
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_cadence_queue_org_id();

-- RLS: trocar policy permissiva por isolamento org
DROP POLICY IF EXISTS cadence_queue_all ON public.cadence_queue;
DROP POLICY IF EXISTS cadence_queue_admin_all ON public.cadence_queue;
DROP POLICY IF EXISTS cadence_queue_service_role ON public.cadence_queue;
CREATE POLICY cadence_queue_org_all ON public.cadence_queue TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY cadence_queue_service_all ON public.cadence_queue TO service_role
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. cadence_dead_letter — org_id (nullable: pode ter órfãos) + RLS
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  has_table BOOLEAN;
  has_col BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='cadence_dead_letter') INTO has_table;
  IF NOT has_table THEN
    RAISE NOTICE 'cadence_dead_letter não existe — skip.';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cadence_dead_letter' AND column_name='org_id') INTO has_col;

  IF NOT has_col THEN
    ALTER TABLE public.cadence_dead_letter ADD COLUMN org_id UUID;
    UPDATE public.cadence_dead_letter d
    SET org_id = i.org_id
    FROM public.cadence_instances i
    WHERE i.id = d.instance_id AND d.org_id IS NULL;
    -- não força NOT NULL: linhas com instância apagada ficam com org_id NULL
    -- (invisíveis a authenticated, visíveis só a service_role — ok p/ log de erro)
    ALTER TABLE public.cadence_dead_letter
      ADD CONSTRAINT cadence_dead_letter_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id);
  END IF;

  CREATE INDEX IF NOT EXISTS idx_cadence_dead_letter_org_id ON public.cadence_dead_letter(org_id);
END $$;

DROP POLICY IF EXISTS cadence_dead_letter_all ON public.cadence_dead_letter;
CREATE POLICY cadence_dead_letter_org_select ON public.cadence_dead_letter TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY cadence_dead_letter_service_all ON public.cadence_dead_letter TO service_role
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. cadence_instances — trigger forçando org_id = card.org_id
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_set_cadence_instances_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
BEGIN
  SELECT org_id INTO card_org FROM public.cards WHERE id = NEW.card_id;

  IF card_org IS NULL THEN
    RAISE EXCEPTION 'cadence_instances: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'cadence_instances.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS auto_set_cadence_instances_org_id_trigger ON public.cadence_instances;
CREATE TRIGGER auto_set_cadence_instances_org_id_trigger
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.cadence_instances
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_cadence_instances_org_id();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC de auditoria para o smoke test (schema-smoke-test.sh)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cadence_queue_cross_org_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT (
    (SELECT COUNT(*) FROM cadence_queue q
       JOIN cadence_instances i ON i.id = q.instance_id
      WHERE q.org_id IS DISTINCT FROM i.org_id)
    +
    (SELECT COUNT(*) FROM cadence_instances ci
       JOIN cards c ON c.id = ci.card_id
      WHERE ci.org_id IS DISTINCT FROM c.org_id)
  )::integer;
$fn$;

GRANT EXECUTE ON FUNCTION public.cadence_queue_cross_org_count() TO anon, authenticated, service_role;

COMMIT;

-- ── Validação pós-migration ──
DO $$
DECLARE
  leak_q INTEGER;
  leak_i INTEGER;
BEGIN
  SELECT COUNT(*) INTO leak_q
  FROM cadence_queue q JOIN cadence_instances i ON i.id = q.instance_id
  WHERE q.org_id <> i.org_id;
  IF leak_q > 0 THEN
    RAISE EXCEPTION 'cadence_queue: % linhas com org_id divergente da instância', leak_q;
  END IF;

  SELECT COUNT(*) INTO leak_i
  FROM cadence_instances ci JOIN cards c ON c.id = ci.card_id
  WHERE ci.org_id <> c.org_id;
  IF leak_i > 0 THEN
    RAISE EXCEPTION 'cadence_instances: % linhas com org_id divergente do card', leak_i;
  END IF;
END $$;
