-- ============================================================================
-- Fase 4: Config por Workspace — Duplicar config para orgs filhas
-- ============================================================================
-- Cada org filha (Welcome Trips / Welcome Weddings) recebe sua própria cópia
-- da config de pipeline. IDs de stages e pipelines são PRESERVADOS para evitar
-- remap de 7.886 cards e 15+ tabelas dependentes.
--
-- Estratégia:
--   Pipeline-specific config → UPDATE org_id (mantém IDs)
--   Shared config (phases, motivos, tags, etc.) → DUPLICATE com novos IDs
-- ============================================================================

BEGIN;

-- Constantes
DO $migrate$
DECLARE
    v_wg_org    UUID := 'a0000000-0000-0000-0000-000000000001';
    v_trips_org UUID := 'b0000000-0000-0000-0000-000000000001';
    v_wed_org   UUID := 'b0000000-0000-0000-0000-000000000002';

    v_trips_pipeline UUID := 'c8022522-4a1d-411c-9387-efe03ca725ee';
    v_wed_pipeline   UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';

    -- Phase mapping variables
    v_old_phase_id UUID;
    v_new_trips_phase UUID;
    v_new_wed_phase UUID;
    v_rec RECORD;

    -- Team mapping
    v_old_team_id UUID;
    v_new_team_id UUID;

    -- Cadence template mapping
    v_old_template_id UUID;
    v_new_template_id UUID;

BEGIN
    -- ========================================================================
    -- STEP 1: Validação pré-migration
    -- ========================================================================
    RAISE NOTICE '=== STEP 1: Validação pré-migration ===';

    ASSERT (SELECT count(*) FROM pipelines WHERE org_id = v_wg_org) = 3,
        'Expected 3 pipelines in WG';
    ASSERT (SELECT count(*) FROM pipeline_phases WHERE org_id = v_wg_org) = 4,
        'Expected 4 pipeline_phases in WG';
    ASSERT (SELECT count(*) FROM pipeline_stages WHERE org_id = v_wg_org) = 37,
        'Expected 37 pipeline_stages in WG';
    ASSERT (SELECT count(*) FROM cards WHERE org_id = v_trips_org) >= 7000,
        'Expected >= 7000 cards in Trips org';
    ASSERT (SELECT count(*) FROM cards WHERE org_id = v_wed_org) >= 600,
        'Expected >= 600 cards in Weddings org';

    RAISE NOTICE 'Pre-migration validation passed';

    -- ========================================================================
    -- STEP 2: Criar temp table para mapeamento de phases
    -- ========================================================================
    CREATE TEMP TABLE phase_map (
        old_id UUID NOT NULL,
        slug TEXT NOT NULL,
        trips_new_id UUID NOT NULL,
        wed_new_id UUID NOT NULL
    ) ON COMMIT DROP;

    -- Gerar novos IDs para cada phase
    FOR v_rec IN
        SELECT id, slug FROM pipeline_phases WHERE org_id = v_wg_org
    LOOP
        INSERT INTO phase_map (old_id, slug, trips_new_id, wed_new_id)
        VALUES (v_rec.id, v_rec.slug, gen_random_uuid(), gen_random_uuid());
    END LOOP;

    RAISE NOTICE '=== STEP 2: Phase mapping created ===';

    -- ========================================================================
    -- STEP 3: DUPLICATE pipeline_phases para cada org filha
    -- ========================================================================
    RAISE NOTICE '=== STEP 3: Duplicating pipeline_phases ===';

    -- Welcome Trips phases
    INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
        supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color,
        visible_in_card, owner_field)
    SELECT pm.trips_new_id, pp.name, pp.label, pp.slug, pp.color, pp.order_index, pp.active,
        v_trips_org,
        pp.supports_win, pp.win_action, pp.is_entry_phase, pp.is_terminal_phase,
        pp.owner_label, pp.accent_color, pp.visible_in_card, pp.owner_field
    FROM pipeline_phases pp
    JOIN phase_map pm ON pm.old_id = pp.id;

    -- Welcome Weddings phases
    INSERT INTO pipeline_phases (id, name, label, slug, color, order_index, active, org_id,
        supports_win, win_action, is_entry_phase, is_terminal_phase, owner_label, accent_color,
        visible_in_card, owner_field)
    SELECT pm.wed_new_id, pp.name, pp.label, pp.slug, pp.color, pp.order_index, pp.active,
        v_wed_org,
        pp.supports_win, pp.win_action, pp.is_entry_phase, pp.is_terminal_phase,
        pp.owner_label, pp.accent_color, pp.visible_in_card, pp.owner_field
    FROM pipeline_phases pp
    JOIN phase_map pm ON pm.old_id = pp.id;

    RAISE NOTICE 'Created % phases for Trips and % for Weddings',
        (SELECT count(*) FROM pipeline_phases WHERE org_id = v_trips_org),
        (SELECT count(*) FROM pipeline_phases WHERE org_id = v_wed_org);

    -- ========================================================================
    -- STEP 4: UPDATE pipeline_stages — phase_id + target_phase_id + org_id
    -- ========================================================================
    RAISE NOTICE '=== STEP 4: Updating pipeline_stages ===';

    -- TRIPS stages: remap phase_id + set org_id
    UPDATE pipeline_stages ps
    SET phase_id = pm.trips_new_id,
        org_id = v_trips_org
    FROM phase_map pm
    WHERE ps.pipeline_id = v_trips_pipeline
      AND ps.phase_id = pm.old_id
      AND ps.org_id = v_wg_org;

    -- TRIPS stages: remap target_phase_id (se existir)
    UPDATE pipeline_stages ps
    SET target_phase_id = pm.trips_new_id
    FROM phase_map pm
    WHERE ps.pipeline_id = v_trips_pipeline
      AND ps.target_phase_id = pm.old_id;

    -- WEDDING stages: remap phase_id + set org_id
    UPDATE pipeline_stages ps
    SET phase_id = pm.wed_new_id,
        org_id = v_wed_org
    FROM phase_map pm
    WHERE ps.pipeline_id = v_wed_pipeline
      AND ps.phase_id = pm.old_id
      AND ps.org_id = v_wg_org;

    -- WEDDING stages: remap target_phase_id (se existir)
    UPDATE pipeline_stages ps
    SET target_phase_id = pm.wed_new_id
    FROM phase_map pm
    WHERE ps.pipeline_id = v_wed_pipeline
      AND ps.target_phase_id = pm.old_id;

    RAISE NOTICE 'Trips stages: %, Weddings stages: %',
        (SELECT count(*) FROM pipeline_stages WHERE org_id = v_trips_org),
        (SELECT count(*) FROM pipeline_stages WHERE org_id = v_wed_org);

    -- ========================================================================
    -- STEP 5: UPDATE pipelines.org_id
    -- ========================================================================
    RAISE NOTICE '=== STEP 5: Updating pipelines.org_id ===';

    UPDATE pipelines SET org_id = v_trips_org WHERE id = v_trips_pipeline;
    UPDATE pipelines SET org_id = v_wed_org   WHERE id = v_wed_pipeline;
    -- CORP pipeline stays in WG

    -- ========================================================================
    -- STEP 6: Cascade org_id em config pipeline-specific
    -- ========================================================================
    RAISE NOTICE '=== STEP 6: Cascading org_id to config tables ===';

    -- stage_field_config (1.040 rows)
    UPDATE stage_field_config sfc
    SET org_id = ps.org_id
    FROM pipeline_stages ps
    WHERE sfc.stage_id = ps.id
      AND sfc.org_id = v_wg_org;

    RAISE NOTICE 'stage_field_config updated: % Trips, % Weddings',
        (SELECT count(*) FROM stage_field_config WHERE org_id = v_trips_org),
        (SELECT count(*) FROM stage_field_config WHERE org_id = v_wed_org);

    -- stage_section_config (155 rows)
    UPDATE stage_section_config ssc
    SET org_id = ps.org_id
    FROM pipeline_stages ps
    WHERE ssc.stage_id = ps.id
      AND ssc.org_id = v_wg_org;

    -- card_alert_rules (1 row — stage-specific)
    UPDATE card_alert_rules car
    SET org_id = ps.org_id
    FROM pipeline_stages ps
    WHERE car.stage_id = ps.id
      AND car.org_id = v_wg_org;

    -- card_alert_rules sem stage_id mas com pipeline_id
    UPDATE card_alert_rules car
    SET org_id = p.org_id
    FROM pipelines p
    WHERE car.pipeline_id = p.id
      AND car.stage_id IS NULL
      AND car.org_id = v_wg_org;

    -- ========================================================================
    -- STEP 7: Sections — split por produto + duplicate shared
    -- ========================================================================
    RAISE NOTICE '=== STEP 7: Migrating sections ===';

    -- Sections com produto TRIPS → Update org_id para Trips
    UPDATE sections
    SET org_id = v_trips_org
    WHERE org_id = v_wg_org
      AND produto::text = 'TRIPS';

    -- Sections com produto WEDDING → Update org_id para Weddings
    UPDATE sections
    SET org_id = v_wed_org
    WHERE org_id = v_wg_org
      AND produto::text = 'WEDDING';

    -- Sections sem produto (shared) → DUPLICATE para cada org filha
    -- UNIQUE constraint: (org_id, pipeline_id, key) — pipeline_id é NULL, org_id diferente → OK
    INSERT INTO sections (id, key, label, color, icon, position, order_index,
        is_governable, is_system, active, pipeline_id, widget_component, produto,
        default_collapsed, org_id)
    SELECT gen_random_uuid(), s.key, s.label, s.color, s.icon, s.position, s.order_index,
        s.is_governable, s.is_system, s.active, s.pipeline_id, s.widget_component, s.produto,
        s.default_collapsed, v_trips_org
    FROM sections s
    WHERE s.org_id = v_wg_org
      AND s.produto IS NULL;

    INSERT INTO sections (id, key, label, color, icon, position, order_index,
        is_governable, is_system, active, pipeline_id, widget_component, produto,
        default_collapsed, org_id)
    SELECT gen_random_uuid(), s.key, s.label, s.color, s.icon, s.position, s.order_index,
        s.is_governable, s.is_system, s.active, s.pipeline_id, s.widget_component, s.produto,
        s.default_collapsed, v_wed_org
    FROM sections s
    WHERE s.org_id = v_wg_org
      AND s.produto IS NULL;

    RAISE NOTICE 'Sections: Trips=%, Weddings=%',
        (SELECT count(*) FROM sections WHERE org_id = v_trips_org),
        (SELECT count(*) FROM sections WHERE org_id = v_wed_org);

    -- ========================================================================
    -- STEP 8: pipeline_card_settings — DUPLICATE (shared phases → each org)
    -- ========================================================================
    RAISE NOTICE '=== STEP 8: Duplicating pipeline_card_settings ===';

    -- 4 settings rows, each referencing a shared phase.
    -- Both orgs need a copy with their own phase_id.
    -- UNIQUE: (phase_id, usuario_id) — new phase_ids → no conflict

    -- Trips copy
    INSERT INTO pipeline_card_settings (id, fase, phase_id, campos_visiveis, ordem_campos,
        usuario_id, campos_kanban, ordem_kanban, org_id)
    SELECT gen_random_uuid(), pcs.fase, pm.trips_new_id, pcs.campos_visiveis, pcs.ordem_campos,
        pcs.usuario_id, pcs.campos_kanban, pcs.ordem_kanban, v_trips_org
    FROM pipeline_card_settings pcs
    JOIN phase_map pm ON pm.old_id = pcs.phase_id
    WHERE pcs.org_id = v_wg_org;

    -- Weddings copy
    INSERT INTO pipeline_card_settings (id, fase, phase_id, campos_visiveis, ordem_campos,
        usuario_id, campos_kanban, ordem_kanban, org_id)
    SELECT gen_random_uuid(), pcs.fase, pm.wed_new_id, pcs.campos_visiveis, pcs.ordem_campos,
        pcs.usuario_id, pcs.campos_kanban, pcs.ordem_kanban, v_wed_org
    FROM pipeline_card_settings pcs
    JOIN phase_map pm ON pm.old_id = pcs.phase_id
    WHERE pcs.org_id = v_wg_org;

    -- Deletar originais da WG (já duplicados)
    DELETE FROM pipeline_card_settings WHERE org_id = v_wg_org;

    -- ========================================================================
    -- STEP 9: DUPLICATE phase_visibility_rules (6 rows → 6 per org)
    -- ========================================================================
    RAISE NOTICE '=== STEP 9: Duplicating phase_visibility_rules ===';

    -- Trips
    INSERT INTO phase_visibility_rules (id, source_phase_id, target_phase_id, org_id)
    SELECT gen_random_uuid(), pm_src.trips_new_id, pm_tgt.trips_new_id, v_trips_org
    FROM phase_visibility_rules pvr
    JOIN phase_map pm_src ON pm_src.old_id = pvr.source_phase_id
    JOIN phase_map pm_tgt ON pm_tgt.old_id = pvr.target_phase_id
    WHERE pvr.org_id = v_wg_org;

    -- Weddings
    INSERT INTO phase_visibility_rules (id, source_phase_id, target_phase_id, org_id)
    SELECT gen_random_uuid(), pm_src.wed_new_id, pm_tgt.wed_new_id, v_wed_org
    FROM phase_visibility_rules pvr
    JOIN phase_map pm_src ON pm_src.old_id = pvr.source_phase_id
    JOIN phase_map pm_tgt ON pm_tgt.old_id = pvr.target_phase_id
    WHERE pvr.org_id = v_wg_org;

    -- Deletar originais da WG
    DELETE FROM phase_visibility_rules WHERE org_id = v_wg_org;

    -- ========================================================================
    -- STEP 10: DUPLICATE teams (4 teams → 4 por org filha)
    -- ========================================================================
    RAISE NOTICE '=== STEP 10: Duplicating teams ===';

    CREATE TEMP TABLE team_map (
        old_id UUID NOT NULL,
        name TEXT NOT NULL,
        trips_new_id UUID NOT NULL,
        wed_new_id UUID NOT NULL
    ) ON COMMIT DROP;

    FOR v_rec IN
        SELECT id, name FROM teams WHERE org_id = v_wg_org AND phase_id IS NOT NULL
    LOOP
        INSERT INTO team_map (old_id, name, trips_new_id, wed_new_id)
        VALUES (v_rec.id, v_rec.name, gen_random_uuid(), gen_random_uuid());
    END LOOP;

    -- Trips teams
    INSERT INTO teams (id, name, description, is_active, org_id, phase_id)
    SELECT tm.trips_new_id, t.name, t.description, t.is_active,
        v_trips_org, pm.trips_new_id
    FROM teams t
    JOIN team_map tm ON tm.old_id = t.id
    JOIN phase_map pm ON pm.old_id = t.phase_id;

    -- Weddings teams
    INSERT INTO teams (id, name, description, is_active, org_id, phase_id)
    SELECT tm.wed_new_id, t.name, t.description, t.is_active,
        v_wed_org, pm.wed_new_id
    FROM teams t
    JOIN team_map tm ON tm.old_id = t.id
    JOIN phase_map pm ON pm.old_id = t.phase_id;

    RAISE NOTICE 'Teams duplicated: Trips=%, Weddings=%',
        (SELECT count(*) FROM teams WHERE org_id = v_trips_org),
        (SELECT count(*) FROM teams WHERE org_id = v_wed_org);

    -- ========================================================================
    -- STEP 11: card_creation_rules — UPDATE org_id + team_id
    -- ========================================================================
    RAISE NOTICE '=== STEP 11: Updating card_creation_rules ===';

    -- Validar que todos os teams referenciados têm mapeamento
    ASSERT NOT EXISTS (
        SELECT 1 FROM card_creation_rules ccr
        WHERE ccr.org_id = v_wg_org
          AND NOT EXISTS (SELECT 1 FROM team_map tm WHERE tm.old_id = ccr.team_id)
    ), 'card_creation_rules references teams not found in team_map!';

    -- All 3 rules are TRIPS pipeline stages → go to Trips org
    -- Also remap team_id to the new Trips team
    UPDATE card_creation_rules ccr
    SET org_id = v_trips_org,
        team_id = tm.trips_new_id
    FROM pipeline_stages ps, team_map tm
    WHERE ccr.stage_id = ps.id
      AND ccr.team_id = tm.old_id
      AND ccr.org_id = v_wg_org
      AND ps.org_id = v_trips_org;

    -- ========================================================================
    -- STEP 12: DUPLICATE motivos_perda (8→16, ambas orgs)
    -- ========================================================================
    RAISE NOTICE '=== STEP 12: Duplicating motivos_perda ===';

    INSERT INTO motivos_perda (id, nome, ativo, org_id, produto)
    SELECT gen_random_uuid(), nome, ativo, v_trips_org, produto
    FROM motivos_perda WHERE org_id = v_wg_org;

    INSERT INTO motivos_perda (id, nome, ativo, org_id, produto)
    SELECT gen_random_uuid(), nome, ativo, v_wed_org, produto
    FROM motivos_perda WHERE org_id = v_wg_org;

    -- ========================================================================
    -- STEP 13: DUPLICATE card_tags (1→2, ambas orgs)
    -- ========================================================================
    RAISE NOTICE '=== STEP 13: Duplicating card_tags ===';

    INSERT INTO card_tags (id, name, color, description, produto, is_active, created_by, org_id)
    SELECT gen_random_uuid(), name, color, description, produto, is_active, created_by, v_trips_org
    FROM card_tags WHERE org_id = v_wg_org;

    INSERT INTO card_tags (id, name, color, description, produto, is_active, created_by, org_id)
    SELECT gen_random_uuid(), name, color, description, produto, is_active, created_by, v_wed_org
    FROM card_tags WHERE org_id = v_wg_org;

    -- ========================================================================
    -- STEP 14: DUPLICATE cadence_templates + cadence_steps
    -- ========================================================================
    RAISE NOTICE '=== STEP 14: Duplicating cadence_templates + steps ===';

    CREATE TEMP TABLE template_map (
        old_id UUID NOT NULL,
        trips_new_id UUID NOT NULL,
        wed_new_id UUID NOT NULL
    ) ON COMMIT DROP;

    FOR v_rec IN
        SELECT id FROM cadence_templates WHERE org_id = v_wg_org
    LOOP
        INSERT INTO template_map (old_id, trips_new_id, wed_new_id)
        VALUES (v_rec.id, gen_random_uuid(), gen_random_uuid());
    END LOOP;

    -- Trips templates
    INSERT INTO cadence_templates (id, name, description, target_audience, applicable_stages,
        respect_business_hours, auto_cancel_on_stage_change, soft_break_after_days,
        is_active, created_by, day_pattern, schedule_mode, require_completion_for_next,
        business_hours_start, business_hours_end, allowed_weekdays, org_id, execution_mode)
    SELECT tmm.trips_new_id, ct.name, ct.description, ct.target_audience, ct.applicable_stages,
        ct.respect_business_hours, ct.auto_cancel_on_stage_change, ct.soft_break_after_days,
        ct.is_active, ct.created_by, ct.day_pattern, ct.schedule_mode, ct.require_completion_for_next,
        ct.business_hours_start, ct.business_hours_end, ct.allowed_weekdays, v_trips_org, ct.execution_mode
    FROM cadence_templates ct
    JOIN template_map tmm ON tmm.old_id = ct.id;

    -- Weddings templates
    INSERT INTO cadence_templates (id, name, description, target_audience, applicable_stages,
        respect_business_hours, auto_cancel_on_stage_change, soft_break_after_days,
        is_active, created_by, day_pattern, schedule_mode, require_completion_for_next,
        business_hours_start, business_hours_end, allowed_weekdays, org_id, execution_mode)
    SELECT tmm.wed_new_id, ct.name, ct.description, ct.target_audience, ct.applicable_stages,
        ct.respect_business_hours, ct.auto_cancel_on_stage_change, ct.soft_break_after_days,
        ct.is_active, ct.created_by, ct.day_pattern, ct.schedule_mode, ct.require_completion_for_next,
        ct.business_hours_start, ct.business_hours_end, ct.allowed_weekdays, v_wed_org, ct.execution_mode
    FROM cadence_templates ct
    JOIN template_map tmm ON tmm.old_id = ct.id;

    -- Trips steps
    INSERT INTO cadence_steps (id, template_id, step_order, step_key, step_type,
        task_config, wait_config, branch_config, end_config, next_step_key,
        day_offset, time_of_day_minutes, requires_previous_completed,
        visibility_conditions, org_id, block_index, due_offset)
    SELECT gen_random_uuid(), tmm.trips_new_id, cs.step_order, cs.step_key, cs.step_type,
        cs.task_config, cs.wait_config, cs.branch_config, cs.end_config, cs.next_step_key,
        cs.day_offset, cs.time_of_day_minutes, cs.requires_previous_completed,
        cs.visibility_conditions, v_trips_org, cs.block_index, cs.due_offset
    FROM cadence_steps cs
    JOIN template_map tmm ON tmm.old_id = cs.template_id
    WHERE cs.org_id = v_wg_org;

    -- Weddings steps
    INSERT INTO cadence_steps (id, template_id, step_order, step_key, step_type,
        task_config, wait_config, branch_config, end_config, next_step_key,
        day_offset, time_of_day_minutes, requires_previous_completed,
        visibility_conditions, org_id, block_index, due_offset)
    SELECT gen_random_uuid(), tmm.wed_new_id, cs.step_order, cs.step_key, cs.step_type,
        cs.task_config, cs.wait_config, cs.branch_config, cs.end_config, cs.next_step_key,
        cs.day_offset, cs.time_of_day_minutes, cs.requires_previous_completed,
        cs.visibility_conditions, v_wed_org, cs.block_index, cs.due_offset
    FROM cadence_steps cs
    JOIN template_map tmm ON tmm.old_id = cs.template_id
    WHERE cs.org_id = v_wg_org;

    RAISE NOTICE 'Cadence templates: Trips=%, Weddings=%. Steps: Trips=%, Weddings=%',
        (SELECT count(*) FROM cadence_templates WHERE org_id = v_trips_org),
        (SELECT count(*) FROM cadence_templates WHERE org_id = v_wed_org),
        (SELECT count(*) FROM cadence_steps WHERE org_id = v_trips_org),
        (SELECT count(*) FROM cadence_steps WHERE org_id = v_wed_org);

    -- ========================================================================
    -- STEP 15: ASSIGN automacao_regras por produto
    -- ========================================================================
    RAISE NOTICE '=== STEP 15: Assigning automacao_regras by produto ===';

    UPDATE automacao_regras
    SET org_id = v_trips_org
    WHERE org_id = v_wg_org AND produto::text = 'TRIPS';

    UPDATE automacao_regras
    SET org_id = v_wed_org
    WHERE org_id = v_wg_org AND produto::text = 'WEDDING';

    -- ========================================================================
    -- STEP 16: Validação pós-migration
    -- ========================================================================
    RAISE NOTICE '=== STEP 16: Post-migration validation ===';

    -- Phases: 4 por org filha
    ASSERT (SELECT count(*) FROM pipeline_phases WHERE org_id = v_trips_org) = 4,
        'Expected 4 phases in Trips';
    ASSERT (SELECT count(*) FROM pipeline_phases WHERE org_id = v_wed_org) = 4,
        'Expected 4 phases in Weddings';

    -- Pipelines: 1 por org filha, 1 CORP no WG
    ASSERT (SELECT count(*) FROM pipelines WHERE org_id = v_trips_org) = 1,
        'Expected 1 pipeline in Trips';
    ASSERT (SELECT count(*) FROM pipelines WHERE org_id = v_wed_org) = 1,
        'Expected 1 pipeline in Weddings';
    ASSERT (SELECT count(*) FROM pipelines WHERE org_id = v_wg_org) = 1,
        'Expected 1 pipeline (CORP) in WG';

    -- Nenhum stage com phase_id orphan
    ASSERT (SELECT count(*) FROM pipeline_stages ps
        WHERE ps.phase_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pipeline_phases pp WHERE pp.id = ps.phase_id)) = 0,
        'Orphaned phase_id in pipeline_stages!';

    -- Nenhum stage ficou no WG (exceto CORP)
    ASSERT (SELECT count(*) FROM pipeline_stages
        WHERE org_id = v_wg_org
        AND pipeline_id NOT IN (SELECT id FROM pipelines WHERE org_id = v_wg_org)) = 0,
        'Stages left in WG that should have migrated!';

    -- Cards inalterados
    ASSERT (SELECT count(*) FROM cards WHERE org_id = v_trips_org) >= 7000,
        'Cards count changed in Trips!';
    ASSERT (SELECT count(*) FROM cards WHERE org_id = v_wed_org) >= 600,
        'Cards count changed in Weddings!';

    -- Nenhum card com stage inexistente
    ASSERT (SELECT count(*) FROM cards c
        WHERE c.pipeline_stage_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id)) = 0,
        'Orphaned pipeline_stage_id in cards!';

    -- Nenhum card com pipeline inexistente
    ASSERT (SELECT count(*) FROM cards c
        WHERE c.pipeline_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pipelines p WHERE p.id = c.pipeline_id)) = 0,
        'Orphaned pipeline_id in cards!';

    -- Teams duplicados
    ASSERT (SELECT count(*) FROM teams WHERE org_id = v_trips_org) >= 4,
        'Expected >= 4 teams in Trips';
    ASSERT (SELECT count(*) FROM teams WHERE org_id = v_wed_org) >= 4,
        'Expected >= 4 teams in Weddings';

    -- card_creation_rules: team_id deve apontar para team da mesma org
    ASSERT NOT EXISTS (
        SELECT 1 FROM card_creation_rules ccr
        JOIN teams t ON t.id = ccr.team_id
        WHERE ccr.org_id != t.org_id
    ), 'card_creation_rules has cross-org team references!';

    RAISE NOTICE '=== All post-migration validations PASSED ===';

END;
$migrate$;


-- ============================================================================
-- STEP 17: UPDATE RLS policies — remover requesting_parent_org_id() das config tables
-- ============================================================================
-- Cada org agora tem sua própria config. Não precisa mais ler da parent org.
-- system_fields e section_field_config MANTÊM o padrão parent_org.

-- pipelines
DROP POLICY IF EXISTS "pipelines_org_select" ON pipelines;
CREATE POLICY "pipelines_org_select" ON pipelines
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- pipeline_phases
DROP POLICY IF EXISTS "pipeline_phases_org_select" ON pipeline_phases;
CREATE POLICY "pipeline_phases_org_select" ON pipeline_phases
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- pipeline_stages
DROP POLICY IF EXISTS "pipeline_stages_org_select" ON pipeline_stages;
CREATE POLICY "pipeline_stages_org_select" ON pipeline_stages
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- stage_field_config
DROP POLICY IF EXISTS "stage_field_config_org_select" ON stage_field_config;
CREATE POLICY "stage_field_config_org_select" ON stage_field_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- stage_section_config
DROP POLICY IF EXISTS "stage_section_config_org_select" ON stage_section_config;
CREATE POLICY "stage_section_config_org_select" ON stage_section_config
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- stage_transitions
DROP POLICY IF EXISTS "stage_transitions_org_select" ON stage_transitions;
CREATE POLICY "stage_transitions_org_select" ON stage_transitions
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- pipeline_card_settings
DROP POLICY IF EXISTS "pipeline_card_settings_org_select" ON pipeline_card_settings;
CREATE POLICY "pipeline_card_settings_org_select" ON pipeline_card_settings
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- card_creation_rules
DROP POLICY IF EXISTS "card_creation_rules_org_select" ON card_creation_rules;
CREATE POLICY "card_creation_rules_org_select" ON card_creation_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- phase_visibility_rules
DROP POLICY IF EXISTS "phase_visibility_rules_org_select" ON phase_visibility_rules;
CREATE POLICY "phase_visibility_rules_org_select" ON phase_visibility_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- sections
DROP POLICY IF EXISTS "sections_org_select" ON sections;
CREATE POLICY "sections_org_select" ON sections
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- motivos_perda
DROP POLICY IF EXISTS "motivos_perda_org_select" ON motivos_perda;
CREATE POLICY "motivos_perda_org_select" ON motivos_perda
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- card_tags
DROP POLICY IF EXISTS "card_tags_org_select" ON card_tags;
CREATE POLICY "card_tags_org_select" ON card_tags
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- cadence_templates
DROP POLICY IF EXISTS "cadence_templates_org_select" ON cadence_templates;
CREATE POLICY "cadence_templates_org_select" ON cadence_templates
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- cadence_steps
DROP POLICY IF EXISTS "cadence_steps_org_select" ON cadence_steps;
CREATE POLICY "cadence_steps_org_select" ON cadence_steps
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- automacao_regras
DROP POLICY IF EXISTS "automacao_regras_org_select" ON automacao_regras;
CREATE POLICY "automacao_regras_org_select" ON automacao_regras
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- card_alert_rules
DROP POLICY IF EXISTS "card_alert_rules_org_select" ON card_alert_rules;
CREATE POLICY "card_alert_rules_org_select" ON card_alert_rules
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- teams (agora com config por org, não mais compartilhado)
DROP POLICY IF EXISTS "teams_org_select" ON teams;
CREATE POLICY "teams_org_select" ON teams
    FOR SELECT TO authenticated
    USING (org_id = requesting_org_id());

-- ============================================================================
-- system_fields e section_field_config MANTÊM requesting_parent_org_id()
-- (PK constraint impede duplicação; são metadata de campo compartilhada)
-- ============================================================================

COMMIT;
