-- =============================================================================
-- RESTORE stage_field_config
-- Dados foram acidentalmente deletados. Esta migration restaura:
-- 1. Wedding: visibilidade de campos ww_* por fase
-- 2. TRIPS Pos-Venda: numero_venda_monde como obrigatorio
-- =============================================================================

-- ══════════════════════════════════════════════════════════
-- PARTE 1: WEDDING — visibilidade de campos por fase
-- (Replay da migration 20260228_wedding_stage_field_config)
-- ══════════════════════════════════════════════════════════

DO $$
DECLARE
    v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
    v_stage RECORD;
    v_field RECORD;
    v_phase_slug TEXT;
    v_sections TEXT[];
BEGIN
    FOR v_stage IN
        SELECT ps.id AS stage_id, ps.nome, ps.ordem, ps.phase_id, pp.slug AS phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.pipeline_id = v_pipeline_id
        ORDER BY pp.order_index, ps.ordem
    LOOP
        v_phase_slug := v_stage.phase_slug;

        IF v_phase_slug = 'sdr' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing'];
        ELSIF v_phase_slug = 'planner' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer'];
        ELSIF v_phase_slug = 'pos_venda' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer', 'wedding_planejamento'];
        ELSIF v_phase_slug = 'resolucao' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer', 'wedding_planejamento'];
        ELSE
            v_sections := ARRAY['wedding_info'];
        END IF;

        -- Campos das secoes VISIVEIS: is_visible = true
        FOR v_field IN
            SELECT sf.key AS field_key
            FROM system_fields sf
            WHERE sf.section = ANY(v_sections)
              AND sf.active = true
              AND sf.key LIKE 'ww_%'
        LOOP
            INSERT INTO stage_field_config (
                stage_id, field_key, is_visible, is_required,
                requirement_type, is_blocking, show_in_header
            ) VALUES (
                v_stage.stage_id, v_field.field_key, true, false,
                'field', true, false
            ) ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_visible = true;
        END LOOP;

        -- Campos das secoes NAO visiveis: is_visible = false
        FOR v_field IN
            SELECT sf.key AS field_key
            FROM system_fields sf
            WHERE sf.section NOT IN (SELECT unnest(v_sections))
              AND sf.active = true
              AND sf.key LIKE 'ww_%'
        LOOP
            INSERT INTO stage_field_config (
                stage_id, field_key, is_visible, is_required,
                requirement_type, is_blocking, show_in_header
            ) VALUES (
                v_stage.stage_id, v_field.field_key, false, false,
                'field', true, false
            ) ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_visible = false;
        END LOOP;
    END LOOP;

    -- REQUIRED: Taxa Paga requer destino e qualificacao
    UPDATE stage_field_config
    SET is_required = true
    WHERE stage_id = (SELECT id FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND nome = 'Taxa Paga')
      AND field_key IN ('ww_destino', 'ww_sdr_qualificado');

    -- REQUIRED: Contrato Assinado requer valor
    UPDATE stage_field_config
    SET is_required = true
    WHERE stage_id = (SELECT id FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND nome = 'Contrato Assinado')
      AND field_key = 'ww_closer_valor_contrato';

    RAISE NOTICE 'Wedding stage_field_config restored: % entries',
        (SELECT COUNT(*) FROM stage_field_config sfc
         JOIN pipeline_stages ps ON ps.id = sfc.stage_id
         WHERE ps.pipeline_id = v_pipeline_id AND sfc.field_key LIKE 'ww_%');
END $$;


-- ══════════════════════════════════════════════════════════
-- PARTE 2: TRIPS Pos-Venda — numero_venda_monde obrigatorio
-- (Replay da migration 20260330_require_numero_venda_monde)
-- ══════════════════════════════════════════════════════════

INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, is_blocking, requirement_type, "order")
SELECT s.id, 'numero_venda_monde', true, true, true, 'field', 99
FROM pipeline_stages s
WHERE s.pipeline_id = 'c8022522-4a1d-411c-9387-efe03ca725ee'
  AND s.phase_id = '95e78a06-92af-447c-9f71-60b2c23f1420'
ON CONFLICT (stage_id, field_key) DO UPDATE SET
    is_required = true,
    is_visible = true,
    is_blocking = true;
