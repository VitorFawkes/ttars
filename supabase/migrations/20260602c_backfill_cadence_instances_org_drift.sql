-- Corrige drift de org_id em cadence_instances (36 linhas em prod) e re-sincroniza
-- cadence_queue.
--
-- Contexto: a migration 20260602 adicionou org_id + triggers, mas a validação
-- final detectou 36 cadence_instances com org_id divergente do card (resíduo do
-- split account→workspace: instances ficaram na org pai enquanto o card foi pro
-- workspace filho). O DDL commitou; faltou alinhar os dados.
--
-- Fonte de verdade = card.org_id (onde o card vive hoje, conforme RLS).
-- Como a fila (cadence_queue) foi backfillada a partir do org_id ANTIGO da
-- instance, re-sincronizamos a fila depois de corrigir as instances.

BEGIN;

-- 1) instances: alinhar ao card (trigger auto_set_cadence_instances_org_id aceita,
--    pois NEW.org_id == card.org_id)
UPDATE public.cadence_instances ci
SET org_id = c.org_id
FROM public.cards c
WHERE c.id = ci.card_id
  AND ci.org_id IS DISTINCT FROM c.org_id;

-- 2) queue: re-sincronizar a partir da instance já corrigida
UPDATE public.cadence_queue q
SET org_id = i.org_id
FROM public.cadence_instances i
WHERE i.id = q.instance_id
  AND q.org_id IS DISTINCT FROM i.org_id;

COMMIT;

-- Validação: agora a auditoria deve zerar
DO $$
DECLARE n integer;
BEGIN
  SELECT public.cadence_queue_cross_org_count() INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'cadence: ainda % linhas com org_id divergente após backfill', n;
  END IF;
  RAISE NOTICE 'cadence org drift corrigido (auditoria = 0)';
END $$;
