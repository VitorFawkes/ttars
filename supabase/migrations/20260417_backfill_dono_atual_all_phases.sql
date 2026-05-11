-- ============================================================================
-- BACKFILL: Sincronizar dono_atual_id com owner da fase atual (todas as fases)
--
-- Problema: migration 20260408 fez backfill apenas da fase 'planner'. Existem
-- ~50 cards em 'pos_venda' e alguns em 'planner' com dono_atual_id desatualizado
-- (ex: card em Planner mostra dono=Simone mas vendas_owner=Thayane).
--
-- Sintoma: card aparece na "Minha Fila" da pessoa errada; badges de owner
-- divergem entre UI e filtros.
--
-- Solução: UPDATE em todas as 3 fases com role-specific owner.
-- ============================================================================

-- ─── Fase SDR → dono_atual_id = sdr_owner_id ───
UPDATE cards c
SET dono_atual_id = c.sdr_owner_id
FROM pipeline_stages s
JOIN pipeline_phases pp ON pp.id = s.phase_id
WHERE c.pipeline_stage_id = s.id
  AND pp.slug = 'sdr'
  AND c.sdr_owner_id IS NOT NULL
  AND c.dono_atual_id IS DISTINCT FROM c.sdr_owner_id
  AND c.status_comercial = 'aberto'
  AND c.archived_at IS NULL;

-- ─── Fase Planner → dono_atual_id = vendas_owner_id ───
UPDATE cards c
SET dono_atual_id = c.vendas_owner_id
FROM pipeline_stages s
JOIN pipeline_phases pp ON pp.id = s.phase_id
WHERE c.pipeline_stage_id = s.id
  AND pp.slug = 'planner'
  AND c.vendas_owner_id IS NOT NULL
  AND c.dono_atual_id IS DISTINCT FROM c.vendas_owner_id
  AND c.status_comercial = 'aberto'
  AND c.archived_at IS NULL;

-- ─── Fase Pós-venda → dono_atual_id = pos_owner_id ───
UPDATE cards c
SET dono_atual_id = c.pos_owner_id
FROM pipeline_stages s
JOIN pipeline_phases pp ON pp.id = s.phase_id
WHERE c.pipeline_stage_id = s.id
  AND pp.slug = 'pos_venda'
  AND c.pos_owner_id IS NOT NULL
  AND c.dono_atual_id IS DISTINCT FROM c.pos_owner_id
  AND c.status_comercial = 'aberto'
  AND c.archived_at IS NULL;
