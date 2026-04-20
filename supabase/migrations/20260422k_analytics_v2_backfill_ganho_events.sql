-- Analytics v2 — Fase 0 (Backfill: eventos de ganho em activities + is_rework)
-- Plano: Bloco 8.
--
-- 1) Insere 1 activity do tipo ganho_{sdr,planner,pos}_event para cada card com
--    ganho_*_at populado. Idempotente (NOT EXISTS guard).
--    created_at = ganho_*_at do card para preservar a cronologia real.
--
--    Esses eventos alimentam o dashboard SDR/Vendas/Pos na Fase 1 (quando
--    analytics_team_performance_v2 contar handoffs por periodo).
--
-- 2) Enriquece activities.stage_changed historicas com is_rework +
--    old_stage_ordem + new_stage_ordem no metadata. Trigger log_card_update_activity
--    ja faz isso para novas atividades desde 20260422g.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Backfill eventos de ganho
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
SELECT c.id,
       'ganho_sdr_event',
       'Ganho SDR (backfill Analytics v2)',
       jsonb_build_object('backfill', true, 'source', 'analytics_v2_fase0'),
       c.org_id,
       c.ganho_sdr_at
  FROM public.cards c
 WHERE c.ganho_sdr = true
   AND c.ganho_sdr_at IS NOT NULL
   AND c.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.card_id = c.id AND a.tipo = 'ganho_sdr_event'
   );

INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
SELECT c.id,
       'ganho_planner_event',
       'Ganho Planner (backfill Analytics v2)',
       jsonb_build_object('backfill', true, 'source', 'analytics_v2_fase0'),
       c.org_id,
       c.ganho_planner_at
  FROM public.cards c
 WHERE c.ganho_planner = true
   AND c.ganho_planner_at IS NOT NULL
   AND c.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.card_id = c.id AND a.tipo = 'ganho_planner_event'
   );

INSERT INTO public.activities (card_id, tipo, descricao, metadata, org_id, created_at)
SELECT c.id,
       'ganho_pos_event',
       'Ganho Pos (backfill Analytics v2)',
       jsonb_build_object('backfill', true, 'source', 'analytics_v2_fase0'),
       c.org_id,
       c.ganho_pos_at
  FROM public.cards c
 WHERE c.ganho_pos = true
   AND c.ganho_pos_at IS NOT NULL
   AND c.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.card_id = c.id AND a.tipo = 'ganho_pos_event'
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Enriquecer metadata de stage_changed historicas com is_rework
-- ═══════════════════════════════════════════════════════════════════════════
WITH pairs AS (
  SELECT a.id,
         ps_old.ordem AS old_ordem,
         ps_new.ordem AS new_ordem
    FROM public.activities a
    LEFT JOIN public.pipeline_stages ps_old
      ON ps_old.id = NULLIF(a.metadata->>'old_stage_id', '')::uuid
    LEFT JOIN public.pipeline_stages ps_new
      ON ps_new.id = NULLIF(a.metadata->>'new_stage_id', '')::uuid
   WHERE a.tipo = 'stage_changed'
     AND (a.metadata->>'is_rework') IS NULL
     AND (a.metadata->>'old_stage_id') IS NOT NULL
     AND (a.metadata->>'new_stage_id') IS NOT NULL
)
UPDATE public.activities a
   SET metadata = a.metadata || jsonb_build_object(
         'old_stage_ordem', p.old_ordem,
         'new_stage_ordem', p.new_ordem,
         'is_rework', (
           p.new_ordem IS NOT NULL
           AND p.old_ordem IS NOT NULL
           AND p.new_ordem < p.old_ordem
         )
       )
  FROM pairs p
 WHERE a.id = p.id;

COMMIT;
