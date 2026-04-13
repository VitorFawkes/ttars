-- H3-029: Trigger strict em cadence_steps — org_id SEMPRE = template.org_id
--
-- Antes: trigger priorizava JWT sobre template.org_id. Um admin logado na org A
-- conseguia inserir steps em template da org B e os steps ficavam na org A.
-- Foi o que causou os 4 rows cross-org corrigidos em H3-028.
--
-- Depois: org_id é sempre derivado do template. Tentativa de INSERT/UPDATE com
-- org_id divergente é rejeitada com RAISE. Tentativa de mudar template_id para
-- um template em outra org também sincroniza org_id automaticamente.

BEGIN;

DO $$
DECLARE
  has_table BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cadence_steps'
  ) INTO has_table;

  IF NOT has_table THEN
    RAISE NOTICE 'H3-029: cadence_steps não existe neste ambiente — skip (no-op).';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.auto_set_cadence_steps_org_id()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $fn$
  DECLARE
    template_org UUID;
  BEGIN
    SELECT org_id INTO template_org
    FROM public.cadence_templates
    WHERE id = NEW.template_id;

    IF template_org IS NULL THEN
      RAISE EXCEPTION 'cadence_steps: template_id % não encontrado em cadence_templates', NEW.template_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.org_id IS NOT NULL AND NEW.org_id <> template_org THEN
      RAISE EXCEPTION 'cadence_steps.org_id (%) diverge de cadence_templates.org_id (%) para template %',
        NEW.org_id, template_org, NEW.template_id
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.org_id := template_org;
    RETURN NEW;
  END
  $fn$;

  DROP TRIGGER IF EXISTS auto_set_cadence_steps_org_id_trigger ON public.cadence_steps;
  CREATE TRIGGER auto_set_cadence_steps_org_id_trigger
    BEFORE INSERT OR UPDATE OF template_id, org_id ON public.cadence_steps
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_set_cadence_steps_org_id();

  RAISE NOTICE 'H3-029: trigger auto_set_cadence_steps_org_id atualizado (strict template→org)';
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
    WHERE table_schema = 'public' AND table_name = 'cadence_steps'
  ) INTO has_table;

  IF NOT has_table THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO leak_count
  FROM cadence_steps cs
  JOIN cadence_templates t ON t.id = cs.template_id
  WHERE cs.org_id <> t.org_id;

  IF leak_count > 0 THEN
    RAISE EXCEPTION 'H3-029: % cadence_steps cross-org remanescentes — rodar H3-028 antes', leak_count;
  END IF;
END $$;
