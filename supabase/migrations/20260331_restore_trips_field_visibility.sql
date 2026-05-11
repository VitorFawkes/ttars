-- =============================================================================
-- RESTORE TRIPS stage_field_config — visibilidade de campos trip_info por fase
--
-- Logica de negocio:
-- SDR: campos basicos de qualificacao (destino, orcamento, viajantes, motivo, epoca, duracao, cidade)
-- T. Planner: SDR + campos de venda (reuniao, servico, hospedagem, taxa, degustacao)
-- Pos-Venda: tudo visivel
-- =============================================================================

DO $$
DECLARE
    v_pipeline_id UUID := 'c8022522-4a1d-411c-9387-efe03ca725ee';
    v_stage RECORD;
    v_field RECORD;
    v_phase_slug TEXT;
    v_visible_fields TEXT[];
BEGIN
    FOR v_stage IN
        SELECT ps.id AS stage_id, ps.nome, pp.slug AS phase_slug
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.pipeline_id = v_pipeline_id
          AND ps.ativo = true
        ORDER BY pp.order_index, ps.ordem
    LOOP
        v_phase_slug := v_stage.phase_slug;

        -- Campos visiveis por fase
        IF v_phase_slug = 'sdr' THEN
            -- SDR: campos basicos de qualificacao
            v_visible_fields := ARRAY[
                'destinos', 'epoca_viagem', 'orcamento', 'motivo',
                'quantidade_viajantes', 'cidade_origem', 'duracao_viagem'
            ];
        ELSIF v_phase_slug = 'planner' THEN
            -- Planner: SDR + campos de venda
            v_visible_fields := ARRAY[
                'destinos', 'epoca_viagem', 'orcamento', 'motivo',
                'quantidade_viajantes', 'cidade_origem', 'duracao_viagem',
                'como_foi_primeira_reuniao', 'servico_contratado',
                'qual_servio_contratado', 'tipo_de_hospedagem',
                'taxa_planejamento', 'pagou_taxa', 'degustacao_tp'
            ];
        ELSE
            -- Pos-Venda e Resolucao: tudo visivel
            v_visible_fields := ARRAY[
                'destinos', 'epoca_viagem', 'orcamento', 'motivo',
                'quantidade_viajantes', 'cidade_origem', 'duracao_viagem',
                'como_foi_primeira_reuniao', 'servico_contratado',
                'qual_servio_contratado', 'tipo_de_hospedagem',
                'taxa_planejamento', 'pagou_taxa', 'degustacao_tp',
                'data_exata_da_viagem', 'numero_venda_monde'
            ];
        END IF;

        -- Para cada campo de trip_info
        FOR v_field IN
            SELECT sf.key AS field_key
            FROM system_fields sf
            WHERE sf.section = 'trip_info'
              AND sf.active = true
        LOOP
            IF v_field.field_key = ANY(v_visible_fields) THEN
                -- Campo visivel
                INSERT INTO stage_field_config (
                    stage_id, field_key, is_visible, is_required,
                    requirement_type, is_blocking, show_in_header
                ) VALUES (
                    v_stage.stage_id, v_field.field_key, true, false,
                    'field', false, false
                ) ON CONFLICT (stage_id, field_key) DO UPDATE SET
                    is_visible = true;
            ELSE
                -- Campo oculto
                INSERT INTO stage_field_config (
                    stage_id, field_key, is_visible, is_required,
                    requirement_type, is_blocking, show_in_header
                ) VALUES (
                    v_stage.stage_id, v_field.field_key, false, false,
                    'field', false, false
                ) ON CONFLICT (stage_id, field_key) DO UPDATE SET
                    is_visible = false;
            END IF;
        END LOOP;
    END LOOP;

    -- Manter numero_venda_monde como obrigatorio em Pos-Venda
    UPDATE stage_field_config
    SET is_required = true, is_blocking = true
    WHERE stage_id IN (
        SELECT s.id FROM pipeline_stages s
        WHERE s.pipeline_id = v_pipeline_id
          AND s.phase_id = '95e78a06-92af-447c-9f71-60b2c23f1420'
    )
    AND field_key = 'numero_venda_monde';

    RAISE NOTICE 'TRIPS trip_info field visibility restored: % entries',
        (SELECT COUNT(*) FROM stage_field_config sfc
         JOIN pipeline_stages ps ON ps.id = sfc.stage_id
         WHERE ps.pipeline_id = v_pipeline_id
           AND sfc.field_key IN (SELECT key FROM system_fields WHERE section = 'trip_info'));
END $$;

-- Tambem esconder campos de observacoes_criticas que sao de SDR/briefing no Pos-Venda
-- (briefing, usa_agencia, algo_especial, etc. sao preenchidos no SDR/Planner)
-- Esses campos ficam visiveis em todas as fases (nao havia restricao por fase)
-- Entao nao precisa de config especial aqui.
