-- ============================================================================
-- Retry final: mappings AC + backfill McQueen com org_id correto
-- ============================================================================
-- A 20260512o e 20260512p falharam silenciosamente porque o INSERT em
-- integration_task_type_map nao incluia org_id (NOT NULL via H3
-- multi-tenant). A transacao deu rollback e nem o UPDATE de cards nem o
-- backfill de tarefas persistiram.
--
-- org_id por pipeline:
--   c8022522 (Pipeline Welcome Trips)   → b0000000-...-001
--   f4611f84 (Pipeline Welcome Wedding) → b0000000-...-002
-- ============================================================================

INSERT INTO public.integration_task_type_map
    (integration_id, pipeline_id, ac_task_type, crm_task_tipo, sync_direction, is_active, org_id)
VALUES
    ('a2141b92-561f-4514-92b4-9412a068d236', 'c8022522-4a1d-411c-9387-efe03ca725ee', 4, 'reuniao', 'both', true, 'b0000000-0000-0000-0000-000000000001'),
    ('a2141b92-561f-4514-92b4-9412a068d236', 'c8022522-4a1d-411c-9387-efe03ca725ee', 1, 'ligacao', 'both', true, 'b0000000-0000-0000-0000-000000000001'),
    ('a2141b92-561f-4514-92b4-9412a068d236', 'f4611f84-ce9c-48ad-814b-dcd6081f15db', 4, 'reuniao', 'both', true, 'b0000000-0000-0000-0000-000000000002'),
    ('a2141b92-561f-4514-92b4-9412a068d236', 'f4611f84-ce9c-48ad-814b-dcd6081f15db', 1, 'ligacao', 'both', true, 'b0000000-0000-0000-0000-000000000002')
ON CONFLICT (integration_id, pipeline_id, ac_task_type) DO UPDATE
    SET crm_task_tipo = EXCLUDED.crm_task_tipo,
        is_active = true;

UPDATE public.tarefas
SET tipo = 'reuniao'
WHERE tipo = 'tarefa'
  AND external_source = 'active_campaign'
  AND (titulo ILIKE '%reuni%' OR titulo ILIKE '%meeting%')
  AND deleted_at IS NULL;

UPDATE public.cards
SET pipeline_stage_id = '120a33fd-2544-49e8-ba59-61a09edb6555',
    updated_at = NOW()
WHERE id = '5d3d2428-7284-44dd-9c0a-92048382918c'
  AND pipeline_stage_id = '46c2cc2e-e9cb-4255-b889-3ee4d1248ba9';
