-- ============================================================================
-- MIGRATION: Corrige cards Welcome Trips com ganho_pos/etapa inconsistentes
-- Date: 2026-04-29
--
-- Auditoria 2026-04-29 identificou 3 grupos de cards Welcome Trips na fase
-- Pós-venda em etapas pré-Pós-Viagem (01..04) com inconsistências:
--
--  A) ~5 cards "(Legado)" do mass import 2026-02-19 com viagem já passada
--     mas parados em "Pré-Embarque <30d" / "App & Conteúdo".
--     Decisão Vitor 2026-04-29: mover para etapa 05 (Pós-viagem & Reativação)
--     mantendo status_comercial='ganho' (são vendas históricas legítimas).
--
--  B) ~35 cards com ganho_pos=true e data_viagem_fim < hoje (viagem terminou)
--     ainda parados em etapas 01..04. Mover para etapa 05.
--
--  C) ~20 cards com ganho_pos=true mas viagem em curso (inicio<=hoje<=fim).
--     Mover para etapa 04 (Em Viagem) e reverter ganho_pos=false (a milestone
--     de pós-venda só vale após a viagem terminar + NPS).
--
-- A migration anterior 20260427a só corrigiu cards com viagem futura. Esta
-- estende a correção para viagem passada e em curso.
-- ============================================================================

BEGIN;

-- ============================================================================
-- A) Cards Legado em etapas 01..04 com viagem já terminada → mover para 05
-- ============================================================================
UPDATE cards
SET
    pipeline_stage_id = '2c07134a-cb83-4075-bc86-4750beec9393',  -- 05 Pós-viagem & Reativação
    pos_owner_id = COALESCE(pos_owner_id, dono_atual_id),
    stage_changed_at = NOW(),
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND org_id = 'b0000000-0000-0000-0000-000000000001'  -- Welcome Trips
  AND pipeline_stage_id IN (
      'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',  -- 01 App & Conteúdo
      '1f684773-f8f3-434a-a44d-4994750c41aa',  -- 02 Pré-embarque >30d
      '3ce80249-b579-4a9c-9b82-f8569735cea9',  -- 03 Pré-Embarque <30d
      '0ebab355-6d0e-4b19-af13-b4b31268275f'   -- 04 Em Viagem
  )
  AND titulo ILIKE '%(Legado)%'
  AND data_viagem_fim IS NOT NULL
  AND data_viagem_fim < CURRENT_DATE;

-- ============================================================================
-- B) Cards com ganho_pos=true e viagem terminada → mover para 05
-- ============================================================================
UPDATE cards
SET
    pipeline_stage_id = '2c07134a-cb83-4075-bc86-4750beec9393',  -- 05 Pós-viagem & Reativação
    pos_owner_id = COALESCE(pos_owner_id, dono_atual_id),
    stage_changed_at = NOW(),
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND org_id = 'b0000000-0000-0000-0000-000000000001'
  AND pipeline_stage_id IN (
      'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
      '1f684773-f8f3-434a-a44d-4994750c41aa',
      '3ce80249-b579-4a9c-9b82-f8569735cea9',
      '0ebab355-6d0e-4b19-af13-b4b31268275f'
  )
  AND ganho_pos IS TRUE
  AND data_viagem_fim IS NOT NULL
  AND data_viagem_fim < CURRENT_DATE;

-- ============================================================================
-- C) Cards com ganho_pos=true mas viagem em curso → 04 Em Viagem + ganho_pos=false
-- (A milestone de Pós-venda só vale após viagem terminar + NPS)
-- ============================================================================
UPDATE cards
SET
    pipeline_stage_id = '0ebab355-6d0e-4b19-af13-b4b31268275f',  -- 04 Em Viagem
    ganho_pos = false,
    ganho_pos_at = NULL,
    ganho_planner = COALESCE(ganho_planner, true),
    ganho_planner_at = COALESCE(ganho_planner_at, ganho_pos_at, data_fechamento, created_at),
    stage_changed_at = NOW(),
    stage_entered_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND org_id = 'b0000000-0000-0000-0000-000000000001'
  AND pipeline_stage_id IN (
      'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
      '1f684773-f8f3-434a-a44d-4994750c41aa',
      '3ce80249-b579-4a9c-9b82-f8569735cea9'
  )
  AND ganho_pos IS TRUE
  AND data_viagem_inicio IS NOT NULL
  AND data_viagem_fim IS NOT NULL
  AND data_viagem_inicio <= CURRENT_DATE
  AND data_viagem_fim >= CURRENT_DATE;

COMMIT;
