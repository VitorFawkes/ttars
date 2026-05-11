-- ============================================================================
-- Estela (SDR IA Weddings) — Novos campos ww_sdr_* em system_fields
-- ============================================================================
-- Adiciona 7 campos novos que a Estela extrai durante a qualificacao.
-- Compatible com staging (pode nao ter coluna org_id) e producao (tem).
-- Se a section wedding_info nao existir no ambiente, emite NOTICE e skipa
-- (staging descartavel, producao tem todos os dados).
-- ============================================================================

DO $$
DECLARE
  v_section_id UUID;
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_has_org_col BOOLEAN;
  v_fields JSONB := '[
    {"key": "ww_sdr_visao_casamento", "label": "Visao do Casamento", "type": "textarea", "options": null, "order": 130},
    {"key": "ww_sdr_ajuda_familia", "label": "Ajuda da Familia no Investimento", "type": "select",
     "options": ["Somente o casal", "Pais da noiva ajudam", "Pais do noivo ajudam", "Ambas as familias ajudam", "Familia paga integral"], "order": 140},
    {"key": "ww_sdr_teto_orcamento", "label": "Teto Maximo do Orcamento (R$)", "type": "currency", "options": null, "order": 150},
    {"key": "ww_sdr_motivacao", "label": "Motivacao para Destination Wedding", "type": "textarea", "options": null, "order": 160},
    {"key": "ww_sdr_perfil_viagem_internacional", "label": "Viajou Internacional Recentemente", "type": "boolean", "options": null, "order": 170},
    {"key": "ww_sdr_referencia_casamento_premium", "label": "Mencionou Casamento Premium como Referencia", "type": "boolean", "options": null, "order": 180},
    {"key": "ww_sdr_flexibilidade", "label": "Flexibilidade do Casal", "type": "select",
     "options": ["Destino fixo, convidados fixos", "Topa trocar destino", "Topa reduzir convidados", "Topa trocar destino e reduzir convidados", "Totalmente inflexivel"], "order": 190}
  ]'::JSONB;
  v_field JSONB;
  v_options_text TEXT;
  v_sql TEXT;
BEGIN

  -- 1. Detecta se system_fields tem coluna org_id (producao sim, staging nao)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_fields' AND column_name = 'org_id'
  ) INTO v_has_org_col;

  -- 2. Busca section_id de 'wedding_info' a partir de campo ww_sdr existente
  -- (mais robusto que hardcodar UUID)
  SELECT section_id INTO v_section_id
  FROM system_fields
  WHERE key = 'ww_sdr_qualificado'
  LIMIT 1;

  -- Fallback: tenta qualquer ww_sdr
  IF v_section_id IS NULL THEN
    SELECT section_id INTO v_section_id
    FROM system_fields
    WHERE key LIKE 'ww_sdr_%'
    LIMIT 1;
  END IF;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'Section wedding_info nao encontrada neste ambiente (staging descartavel?). Skipando insert dos campos ww_sdr_*.';
    RETURN;
  END IF;

  RAISE NOTICE 'Inserindo 7 campos ww_sdr_* novos em section_id=%, org_col_exists=%', v_section_id, v_has_org_col;

  -- 3. Insere cada campo
  FOR v_field IN SELECT * FROM jsonb_array_elements(v_fields)
  LOOP

    -- Serializa options pra SQL (null ou JSONB array)
    IF v_field->'options' = 'null'::JSONB OR v_field->'options' IS NULL THEN
      v_options_text := 'NULL';
    ELSE
      v_options_text := quote_literal(v_field->>'options') || '::JSONB';
    END IF;

    -- Monta INSERT dinamico: inclui org_id so se a coluna existir
    IF v_has_org_col THEN
      v_sql := format(
        'INSERT INTO system_fields (key, label, type, options, active, section, is_system, section_id, order_index, org_id)
         VALUES (%L, %L, %L, %s, true, %L, true, %L, %s, %L)
         ON CONFLICT (key) DO NOTHING',
        v_field->>'key',
        v_field->>'label',
        v_field->>'type',
        v_options_text,
        'wedding_info',
        v_section_id,
        v_field->>'order',
        v_org_id
      );
    ELSE
      v_sql := format(
        'INSERT INTO system_fields (key, label, type, options, active, section, is_system, section_id, order_index)
         VALUES (%L, %L, %L, %s, true, %L, true, %L, %s)
         ON CONFLICT (key) DO NOTHING',
        v_field->>'key',
        v_field->>'label',
        v_field->>'type',
        v_options_text,
        'wedding_info',
        v_section_id,
        v_field->>'order'
      );
    END IF;

    EXECUTE v_sql;
  END LOOP;

  RAISE NOTICE 'Estela fields: 7 novos campos ww_sdr_* inseridos';
END $$;
