-- ============================================================================
-- MIGRATION: Backfill — cards Ganho sem Pós-Venda existentes
-- Date: 2026-05-04
--
-- Aplica nova regra a cards que já estavam como "Ganho Direto" antes da
-- mudança. Dois grupos:
--
-- GRUPO A: cards em fase 'planner' com status='ganho', ganho_planner=true,
-- ganho_pos!=true → eram "Ganho Direto" antigos. Move pra fase pos_venda
-- na etapa correta (via fn_calcular_etapa_pos_venda) e marca skip=true.
--
-- GRUPO B: cards já em fase 'pos_venda' com status='ganho', ganho_planner=true,
-- ganho_pos!=true, pos_owner_id IS NULL → cards importados em massa sem dono
-- pós-venda. Marca skip=true (não move).
--
-- Cards do Grupo A são movidos com UPDATE direto SEM disparar trigger de
-- cadência (BYPASS via SET LOCAL session_replication_role = replica), pois
-- são migrações em massa que não devem gerar tarefas/automações.
-- ============================================================================

BEGIN;

-- Bypass triggers durante backfill em massa
SET LOCAL session_replication_role = replica;

DO $do$
DECLARE
    rec RECORD;
    v_target_stage UUID;
    v_count_a INT := 0;
    v_count_b INT := 0;
    v_errors INT := 0;
BEGIN
    -- ─── GRUPO A: cards em fase planner ───
    FOR rec IN
        SELECT c.id, c.titulo, c.pipeline_stage_id, c.produto
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.deleted_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.ganho_planner = true
          AND COALESCE(c.ganho_pos, false) = false
          AND COALESCE(c.skip_pos_venda, false) = false
          AND pp.slug = 'planner'
    LOOP
        BEGIN
            v_target_stage := fn_calcular_etapa_pos_venda(rec.id);

            UPDATE cards SET
                skip_pos_venda = true,
                pipeline_stage_id = v_target_stage,
                stage_entered_at = NOW(),
                updated_at = NOW()
            WHERE id = rec.id;

            INSERT INTO activities (card_id, tipo, descricao, metadata)
            VALUES (
                rec.id,
                'backfill_skip_pos_venda',
                'Backfill: card de Ganho Direto antigo migrado para Pós-Venda em modo passivo',
                jsonb_build_object(
                    'group', 'A',
                    'from_phase', 'planner',
                    'moved_to_stage', v_target_stage
                )
            );

            v_count_a := v_count_a + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
            RAISE WARNING 'Backfill grupo A falhou para card %: %', rec.id, SQLERRM;
        END;
    END LOOP;

    -- ─── GRUPO B: cards já em pos_venda sem pos_owner_id ───
    FOR rec IN
        SELECT c.id, c.titulo, c.pipeline_stage_id, c.produto
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.deleted_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.ganho_planner = true
          AND COALESCE(c.ganho_pos, false) = false
          AND COALESCE(c.skip_pos_venda, false) = false
          AND pp.slug = 'pos_venda'
          AND c.pos_owner_id IS NULL
    LOOP
        BEGIN
            UPDATE cards SET
                skip_pos_venda = true,
                updated_at = NOW()
            WHERE id = rec.id;

            INSERT INTO activities (card_id, tipo, descricao, metadata)
            VALUES (
                rec.id,
                'backfill_skip_pos_venda',
                'Backfill: card já em Pós-Venda sem responsável marcado como Sem Pós-Venda',
                jsonb_build_object(
                    'group', 'B',
                    'stage_id', rec.pipeline_stage_id
                )
            );

            v_count_b := v_count_b + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1;
            RAISE WARNING 'Backfill grupo B falhou para card %: %', rec.id, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Backfill concluído: Grupo A (planner→pos_venda) = % cards, Grupo B (já em pos_venda) = % cards, Erros = %',
        v_count_a, v_count_b, v_errors;
END
$do$;

COMMIT;
