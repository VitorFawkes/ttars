-- H3-028: Backfill de cadence_steps cross-org
-- Corrige 4 rows em cadence_steps onde cs.org_id ≠ template.org_id (artefato pré-H3-025).
-- O trigger BEFORE INSERT auto_set_cadence_steps_org_id (H3-025) prioriza JWT sobre template,
-- então rows cross-org ainda podem aparecer — hardening fica para H3-029 (decisão separada).
--
-- Evidência (2026-04-13): 4 rows do template "Pós-venda: App & Conteúdo" (Welcome Weddings)
-- com org_id=Welcome Trips. Single batch timestamp 2026-04-13 13:46:56.551572.

BEGIN;

DO $$
DECLARE
  has_table BOOLEAN;
  leak_count INTEGER;
  fixed_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cadence_steps'
  ) INTO has_table;

  IF NOT has_table THEN
    RAISE NOTICE 'H3-028: cadence_steps não existe neste ambiente — skip (no-op).';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO leak_count
  FROM cadence_steps cs
  JOIN cadence_templates t ON t.id = cs.template_id
  WHERE cs.org_id <> t.org_id;
  RAISE NOTICE 'H3-028: % cadence_steps cross-org encontrados antes do backfill', leak_count;

  UPDATE cadence_steps cs
  SET org_id = t.org_id
  FROM cadence_templates t
  WHERE cs.template_id = t.id
    AND cs.org_id <> t.org_id;
  GET DIAGNOSTICS fixed_count = ROW_COUNT;

  SELECT COUNT(*) INTO leak_count
  FROM cadence_steps cs
  JOIN cadence_templates t ON t.id = cs.template_id
  WHERE cs.org_id <> t.org_id;
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'H3-028: backfill falhou, % rows ainda cross-org', leak_count;
  END IF;
  RAISE NOTICE 'H3-028: backfill ok (% rows corrigidos, 0 remanescentes)', fixed_count;
END $$;

COMMIT;
