-- H3-035: Trigger strict em cadence_event_triggers — org_id SEMPRE = template.org_id
--
-- Contexto: em 2026-04-14 a receita "Pós-venda: App & Conteúdo" estava com
-- cadence_template em Welcome Group (parent) e cadence_event_trigger em Welcome Trips
-- (child). Editar pela UI dava 406/PGRST116 porque RLS de cadence_templates exige
-- org_id = requesting_org_id(). Fix manual foi mover o template (20260414_move_posvenda_template_to_trips.sql).
--
-- Aqui instalamos a trava: assim como cadence_steps (H3-029), se um trigger aponta para
-- um template, seu org_id DEVE bater com template.org_id. INSERT/UPDATE divergente
-- é rejeitado com RAISE; se NEW.org_id vier NULL, é derivado do template.
--
-- Escopo: apenas target_template_id (usado por action_type='start_cadence').
-- template_id (coluna legacy) é ignorado pela trigger — não é mais usado.

BEGIN;

DO $$
DECLARE
  has_table BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cadence_event_triggers'
  ) INTO has_table;

  IF NOT has_table THEN
    RAISE NOTICE 'H3-035: cadence_event_triggers não existe — skip (no-op).';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.enforce_cadence_event_trigger_org()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $fn$
  DECLARE
    template_org UUID;
  BEGIN
    IF NEW.target_template_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT org_id INTO template_org
    FROM public.cadence_templates
    WHERE id = NEW.target_template_id;

    IF template_org IS NULL THEN
      RAISE EXCEPTION 'cadence_event_triggers: target_template_id % não encontrado em cadence_templates', NEW.target_template_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.org_id IS NOT NULL AND NEW.org_id <> template_org THEN
      RAISE EXCEPTION 'cadence_event_triggers.org_id (%) diverge de cadence_templates.org_id (%) para template %',
        NEW.org_id, template_org, NEW.target_template_id
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.org_id := template_org;
    RETURN NEW;
  END
  $fn$;

  DROP TRIGGER IF EXISTS enforce_cadence_event_trigger_org_trg ON public.cadence_event_triggers;
  CREATE TRIGGER enforce_cadence_event_trigger_org_trg
    BEFORE INSERT OR UPDATE OF target_template_id, org_id ON public.cadence_event_triggers
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_cadence_event_trigger_org();

  RAISE NOTICE 'H3-035: trigger enforce_cadence_event_trigger_org instalado (strict template→org)';
END $$;

COMMIT;

-- ── Validação pós-migration ──
DO $$
DECLARE
  has_table BOOLEAN;
  leak_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cadence_event_triggers'
  ) INTO has_table;

  IF NOT has_table THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO leak_count
  FROM cadence_event_triggers t
  JOIN cadence_templates tpl ON tpl.id = t.target_template_id
  WHERE t.org_id <> tpl.org_id;

  IF leak_count > 0 THEN
    RAISE EXCEPTION 'H3-035: % cadence_event_triggers cross-org remanescentes — alinhar org_id antes', leak_count;
  END IF;
END $$;
