-- Analytics v2 — Fase 0 (Backfill: lead_entry_path)
-- Plano: Bloco 8.
--
-- Deriva lead_entry_path para cards historicos com base na MESMA regra do trigger
-- public.set_lead_entry_path() criado em 20260422g. Mesma estrategia anti-cascata
-- que 20260422h (session_replication_role=replica).
--
-- Regra:
--   origem='indicacao' OR indicado_por_id IS NOT NULL  -> 'referred'
--   pessoa_principal_id com ganho previo               -> 'returning'
--   sdr_owner_id IS NULL                               -> 'direct_planner'
--   default                                            -> 'full_funnel'

BEGIN;

SET LOCAL session_replication_role = 'replica';

UPDATE public.cards c
SET lead_entry_path = (
  CASE
    WHEN c.origem = 'indicacao' OR c.indicado_por_id IS NOT NULL THEN 'referred'
    WHEN c.pessoa_principal_id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.cards prev
       WHERE prev.pessoa_principal_id = c.pessoa_principal_id
         AND prev.id <> c.id
         AND prev.org_id = c.org_id
         AND prev.deleted_at IS NULL
         AND prev.created_at < c.created_at
         AND (prev.ganho_planner = true OR prev.status_comercial = 'ganho')
    ) THEN 'returning'
    WHEN c.sdr_owner_id IS NULL THEN 'direct_planner'
    ELSE 'full_funnel'
  END
)
WHERE c.deleted_at IS NULL
  AND c.lead_entry_path IS NULL;

-- Sanity: nenhum card ativo pode ficar NULL
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT count(*) INTO v_null_count
    FROM public.cards
   WHERE deleted_at IS NULL AND lead_entry_path IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % cards ativos com lead_entry_path NULL', v_null_count;
  END IF;
END $$;

COMMIT;
