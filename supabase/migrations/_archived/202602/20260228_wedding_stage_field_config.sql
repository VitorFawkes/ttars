-- ============================================================
-- Stage Field Config: visibilidade de campos por stage (Wedding)
-- SDR: wedding_info + wedding_sdr + wedding_marketing
-- Closer: + wedding_closer
-- Planejamento: + wedding_planejamento
-- Terminais: tudo visível, nada required
-- Depende de: wedding_pipeline_stages + wedding_system_fields
-- ============================================================

DO $$
DECLARE
    v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
    v_stage RECORD;
    v_field RECORD;
    v_phase_slug TEXT;
    v_sections TEXT[];
BEGIN
    -- Para cada stage do pipeline Wedding
    FOR v_stage IN
        SELECT ps.id AS stage_id, ps.nome, ps.ordem, ps.phase_id, pp.slug AS phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.pipeline_id = v_pipeline_id
        ORDER BY pp.order_index, ps.ordem
    LOOP
        v_phase_slug := v_stage.phase_slug;

        -- Determinar seções visíveis baseado na fase
        IF v_phase_slug = 'sdr' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing'];
        ELSIF v_phase_slug = 'planner' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer'];
        ELSIF v_phase_slug = 'pos-venda' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer', 'wedding_planejamento'];
        ELSIF v_phase_slug = 'resolucao' THEN
            v_sections := ARRAY['wedding_info', 'wedding_sdr', 'wedding_marketing', 'wedding_closer', 'wedding_planejamento'];
        ELSE
            v_sections := ARRAY['wedding_info'];
        END IF;

        -- Para cada campo das seções visíveis, criar config de visibilidade
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
            ) ON CONFLICT DO NOTHING;
        END LOOP;

        -- Campos de seções NÃO visíveis ficam ocultos
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
            ) ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;

    -- ═══════════════════════════════════════════════════════
    -- REQUIRED FIELDS (gates específicos)
    -- ═══════════════════════════════════════════════════════

    -- Stage "Taxa Paga" (is_sdr_won): requer destino e qualificação
    UPDATE stage_field_config
    SET is_required = true
    WHERE stage_id = (SELECT id FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND nome = 'Taxa Paga')
      AND field_key IN ('ww_destino', 'ww_sdr_qualificado');

    -- Stage "Contrato Assinado" (is_planner_won): requer valor do contrato
    UPDATE stage_field_config
    SET is_required = true
    WHERE stage_id = (SELECT id FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND nome = 'Contrato Assinado')
      AND field_key = 'ww_closer_valor_contrato';

    RAISE NOTICE 'Wedding stage_field_config: % entries created',
        (SELECT COUNT(*) FROM stage_field_config sfc
         JOIN pipeline_stages ps ON ps.id = sfc.stage_id
         WHERE ps.pipeline_id = v_pipeline_id AND sfc.field_key LIKE 'ww_%');
END $$;
