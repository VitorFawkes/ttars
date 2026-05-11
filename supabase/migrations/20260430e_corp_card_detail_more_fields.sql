-- ============================================================================
-- MIGRATION: Welcome Corporativo — adicionar tempo aberto e valor ao card
-- Date: 2026-04-30
--
-- Adiciona valor_estimado e created_at (renomeado pra "Aberto em" na Corp)
-- como campos visíveis dentro do card detalhado.
-- ============================================================================

BEGIN;

DO $more$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000003';
    v_stage_aberto UUID := 'e0000000-0000-0000-0000-000000000031';
    v_stage_fechado UUID := 'e0000000-0000-0000-0000-000000000032';
BEGIN

    -- Renomeia created_at na Corp pra um label mais semântico
    UPDATE system_fields
       SET label = 'Aberto em'
     WHERE org_id = v_org AND key = 'created_at';

    -- Garante que valor_estimado fica na seção info (não system)
    UPDATE system_fields
       SET section = 'info', label = 'Valor estimado'
     WHERE org_id = v_org AND key = 'valor_estimado';

    -- ========================================================================
    -- section_field_config: liga ambos à seção "info"
    -- ========================================================================
    DELETE FROM section_field_config
     WHERE org_id = v_org
       AND section_key = 'info'
       AND field_key IN ('valor_estimado', 'created_at');

    INSERT INTO section_field_config (org_id, section_key, field_key, is_visible, is_required)
    VALUES
        (v_org, 'info', 'created_at',     true, false),
        (v_org, 'info', 'valor_estimado', true, false);

    -- ========================================================================
    -- stage_field_config: ambos visíveis nas duas etapas
    -- ========================================================================
    DELETE FROM stage_field_config
     WHERE org_id = v_org
       AND field_key IN ('valor_estimado', 'created_at');

    INSERT INTO stage_field_config (org_id, stage_id, field_key, is_visible, is_required)
    VALUES
        (v_org, v_stage_aberto,  'created_at',     true, false),
        (v_org, v_stage_aberto,  'valor_estimado', true, false),
        (v_org, v_stage_fechado, 'created_at',     true, false),
        (v_org, v_stage_fechado, 'valor_estimado', true, false);

    RAISE NOTICE '✅ Tempo aberto e valor estimado agora aparecem no card Corp';
END $more$;

COMMIT;
