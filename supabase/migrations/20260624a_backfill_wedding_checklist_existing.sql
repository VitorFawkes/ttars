-- Backfill: aplica as tarefas-padrão (wedding_stage_default_tasks) aos casamentos
-- que JÁ estão em pos_venda. O gatilho seed_wedding_checklist_on_pos_venda só
-- semeia na ENTRADA em pos_venda — os 115 casamentos que já estavam lá ficaram com
-- checklist VAZIO. Sem isto, a tela de Planejamento aparece sem nenhuma tarefa.
--
-- Aditivo e idempotente: insere SÓ em cards WEDDING/pos_venda com 0 linhas em
-- wedding_checklist (não duplica, não mexe em quem já tem tarefas). prazo NULL
-- (planejadora preenche; o relógio dos 45 dias usa a entrada/criação do card).
-- org_id é carimbado por trg_wedding_checklist_strict_org.

BEGIN;

INSERT INTO public.wedding_checklist (card_id, titulo, tipo, marco, ordem, feito, prazo)
SELECT c.id, d.titulo, d.tipo, d.marco, d.ordem, false, NULL
  FROM public.cards c
  JOIN public.pipelines p        ON p.id  = c.pipeline_id
  JOIN public.pipeline_stages cs ON cs.id = c.pipeline_stage_id
  JOIN public.pipeline_phases ph ON ph.id = cs.phase_id
  JOIN public.pipeline_stages ds ON ds.pipeline_id = c.pipeline_id
  JOIN public.wedding_stage_default_tasks d
       ON d.stage_id = ds.id AND d.org_id = c.org_id AND d.ativo = true
 WHERE p.produto::TEXT = 'WEDDING'
   AND ph.slug = 'pos_venda'
   AND c.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.wedding_checklist wc WHERE wc.card_id = c.id);

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_vazios INT;
BEGIN
  SELECT count(*) INTO v_vazios
    FROM public.cards c
    JOIN public.pipelines p        ON p.id  = c.pipeline_id
    JOIN public.pipeline_stages cs ON cs.id = c.pipeline_stage_id
    JOIN public.pipeline_phases ph ON ph.id = cs.phase_id
   WHERE p.produto::TEXT = 'WEDDING'
     AND ph.slug = 'pos_venda'
     AND c.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.wedding_checklist wc WHERE wc.card_id = c.id);
  IF v_vazios > 0 THEN
    RAISE EXCEPTION 'backfill: ainda há % casamentos em planejamento sem tarefas', v_vazios;
  END IF;
  RAISE NOTICE 'backfill wedding_checklist: OK (0 casamentos vazios)';
END $$;
