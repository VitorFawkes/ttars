-- ============================================================================
-- Limpeza de órfãos na account "Welcome Group"
--
-- Remove dados que não deveriam existir no nível da account (parent_org_id IS
-- NULL). Esses são resíduos do pré-Org Split que continuam servindo de pegadinha
-- para lookups por slug sem filtro de pipeline_id (bug original do sub-card).
--
-- Auditoria prévia (2026-04-22 em produção):
--   - pipeline_phases em WG: 4 linhas (sdr, planner, pos_venda, resolucao)
--     — todas SEM stages associadas (órfãs puras, invisíveis via JOIN).
--   - stage_field_confirmations em WG: 2 linhas apontando para stages em
--     outras orgs (cross-org FK).
--   - products em WG: 3 linhas (TRIPS, WEDDING, CORP); TRIPS/WEDDING apontam
--     para pipelines em workspaces filhos (cross-org FK). Workspaces já têm
--     seus próprios produtos.
--   - pipeline "Pipeline Welcome Corp" em WG: órfã (produto CORP desativado,
--     sem cards).
--   - cadence_templates em WG: 7 linhas referenciadas por 1000 cadence_instances
--     (todas com status='cancelled') — nenhum trigger ativo, nenhuma instância
--     rodando. Seguro limpar.
--   - cadence_steps em WG: 62 linhas associadas aos 7 templates acima.
--
-- O que NÃO mexemos aqui:
--   - contatos (60k) — legítimos via shares_contacts_with_children=TRUE.
--   - system_fields (147) — fonte de verdade usada por provision_workspace.
--   - sections is_system (13 de 14) — catálogo compartilhado herdado.
--   - teams/departments/roles em WG — avaliar em pass separado (precisam de
--     análise de FKs com profiles).
--   - seção "marketing" custom — avaliar junto com section_field_config.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_wg UUID := 'a0000000-0000-0000-0000-000000000001'; -- Welcome Group
    v_deleted INT;
BEGIN
    -- Staging defasado pode não ter as colunas org_id em várias tabelas.
    -- No-op nesse caso — a limpeza só faz sentido em produção.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pipeline_phases' AND column_name = 'org_id'
    ) THEN
        RAISE NOTICE 'pipeline_phases.org_id ausente, pulando limpeza (staging defasado)';
        RETURN;
    END IF;

    -- =========================================================================
    -- 1. stage_field_confirmations cross-org (apontam para stages em outros workspaces)
    -- =========================================================================
    DELETE FROM stage_field_confirmations WHERE org_id = v_wg;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'stage_field_confirmations em WG apagados: %', v_deleted;

    -- =========================================================================
    -- 2. pipeline_phases em WG: SKIP — são referenciadas por `teams.phase_id`
    --    (4 teams em WG) e ~1000 linhas de `card_phase_owners`. Remover exige
    --    migrar teams para os workspaces e atualizar card_phase_owners,
    --    trabalho que foge do escopo deste balde. Fica documentado como
    --    "phases canônicas compartilhadas" — NÃO aparecem no count do smoke
    --    test (RPC faz JOIN com stages e WG phases não têm stages).
    -- =========================================================================
    RAISE NOTICE 'pipeline_phases em WG: SKIP (deferido — referenciadas por teams e card_phase_owners)';

    -- =========================================================================
    -- 3. products em WG: TRIPS/WEDDING apontam cross-org (workspace tem o seu);
    --    CORP aponta para pipeline local em WG que também é órfão (passo 8).
    --    Todos os 3 são seguros: cards não têm FK direta para products.
    -- =========================================================================
    DELETE FROM products p WHERE p.org_id = v_wg;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'products em WG apagados: %', v_deleted;

    -- =========================================================================
    -- 4. cadence_instances cancelladas apontando para templates da WG
    --    (templates locais ficam, mas instances são histórico sem valor)
    -- =========================================================================
    DELETE FROM cadence_instances ci
    WHERE ci.status = 'cancelled'
      AND EXISTS (
          SELECT 1 FROM cadence_templates t
          WHERE t.id = ci.template_id AND t.org_id = v_wg
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'cadence_instances cancelled apontando p/ templates WG apagadas: %', v_deleted;

    -- =========================================================================
    -- 5. cadence_queue apontando para steps dos templates WG (se houver)
    -- =========================================================================
    DELETE FROM cadence_queue q
    WHERE EXISTS (
        SELECT 1 FROM cadence_steps s
        JOIN cadence_templates t ON t.id = s.template_id
        WHERE s.id = q.step_id AND t.org_id = v_wg
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'cadence_queue de templates WG apagados: %', v_deleted;

    -- =========================================================================
    -- 6. cadence_steps dos templates WG
    -- =========================================================================
    DELETE FROM cadence_steps s
    WHERE EXISTS (
        SELECT 1 FROM cadence_templates t
        WHERE t.id = s.template_id AND t.org_id = v_wg
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'cadence_steps em WG apagados: %', v_deleted;

    -- =========================================================================
    -- 7. cadence_templates órfãos em WG
    --    Só apaga se não houver mais instances/steps/triggers ativos.
    -- =========================================================================
    DELETE FROM cadence_templates t
    WHERE t.org_id = v_wg
      AND NOT EXISTS (SELECT 1 FROM cadence_instances WHERE template_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM cadence_steps WHERE template_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM cadence_event_triggers WHERE target_template_id = t.id);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'cadence_templates em WG apagados: %', v_deleted;

    -- =========================================================================
    -- 8. Pipeline "Pipeline Welcome Corp" em WG
    --    (single pipeline com produto CORP desativado, sem stages úteis)
    -- =========================================================================
    DELETE FROM pipelines p
    WHERE p.org_id = v_wg
      AND NOT EXISTS (
          SELECT 1 FROM pipeline_stages s WHERE s.pipeline_id = p.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM cards c WHERE c.pipeline_id = p.id
      );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'pipelines órfãos em WG apagados: %', v_deleted;

END
$$;

COMMIT;
