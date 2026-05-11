-- ============================================================================
-- Wedding Planning Fields (2026-04-22)
-- ============================================================================
-- Adiciona os ~25 campos novos que cobrem as frentes de trabalho do pos-venda
-- do Weddings: Concepcao, Fornecedores, Convidados & Logistica, Pre-evento,
-- Pos-casamento. Todos entram na secao wedding_info (consistencia com os 43
-- campos ww_* existentes que ja estao la).
-- ============================================================================

DO $$
DECLARE
  v_section_id UUID;
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
  v_has_org_col BOOLEAN;
  v_fields JSONB := '[
    {"key": "ww_plan_conceito", "label": "Conceito e Mood", "type": "textarea", "options": null, "order": 200},
    {"key": "ww_plan_paleta_cores", "label": "Paleta de Cores", "type": "text", "options": null, "order": 210},
    {"key": "ww_plan_estilo", "label": "Estilo do Casamento", "type": "select",
     "options": ["Classico", "Rustico", "Moderno", "Tropical", "Boho", "Minimalista"], "order": 220},
    {"key": "ww_plan_moodboard_link", "label": "Link do Moodboard", "type": "text", "options": null, "order": 230},

    {"key": "ww_plan_forn_venue_status", "label": "Fornecedor: Venue", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 300},
    {"key": "ww_plan_forn_buffet_status", "label": "Fornecedor: Buffet", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 310},
    {"key": "ww_plan_forn_fotografia_status", "label": "Fornecedor: Fotografia", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 320},
    {"key": "ww_plan_forn_video_status", "label": "Fornecedor: Video", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 330},
    {"key": "ww_plan_forn_dj_status", "label": "Fornecedor: DJ / Musica", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 340},
    {"key": "ww_plan_forn_decor_status", "label": "Fornecedor: Decoracao", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 350},
    {"key": "ww_plan_forn_flores_status", "label": "Fornecedor: Flores", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 360},
    {"key": "ww_plan_forn_bolo_status", "label": "Fornecedor: Bolo", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 370},
    {"key": "ww_plan_forn_cerimonialista_status", "label": "Fornecedor: Cerimonialista", "type": "select",
     "options": ["Pendente", "Negociando", "Contratado"], "order": 380},

    {"key": "ww_plan_num_convidados_final", "label": "Numero de Convidados (Final)", "type": "number", "options": null, "order": 400},
    {"key": "ww_plan_rsvp_abertura", "label": "Abertura do RSVP", "type": "date", "options": null, "order": 410},
    {"key": "ww_plan_rsvp_fechamento", "label": "Fechamento do RSVP", "type": "date", "options": null, "order": 420},
    {"key": "ww_plan_convidados_confirmados", "label": "Convidados Confirmados", "type": "number", "options": null, "order": 430},
    {"key": "ww_plan_hospedagem_link", "label": "Link da Hospedagem / Bloqueio", "type": "text", "options": null, "order": 440},
    {"key": "ww_plan_transfer_contratado", "label": "Transfer Contratado", "type": "boolean", "options": null, "order": 450},

    {"key": "ww_plan_cronograma_link", "label": "Link do Cronograma (Dia D)", "type": "text", "options": null, "order": 500},
    {"key": "ww_plan_ensaio_data", "label": "Data do Ensaio", "type": "date", "options": null, "order": 510},
    {"key": "ww_plan_ensaio_feito", "label": "Ensaio Realizado", "type": "boolean", "options": null, "order": 520},
    {"key": "ww_plan_checklist_final_ok", "label": "Checklist Final OK", "type": "boolean", "options": null, "order": 530},

    {"key": "ww_plan_data_casamento_realizado", "label": "Data do Casamento Realizado", "type": "date", "options": null, "order": 600},
    {"key": "ww_plan_fotos_entregues", "label": "Fotos Entregues", "type": "boolean", "options": null, "order": 610},
    {"key": "ww_plan_video_entregue", "label": "Video Entregue", "type": "boolean", "options": null, "order": 620},
    {"key": "ww_plan_nps_coletado", "label": "NPS Coletado", "type": "boolean", "options": null, "order": 630},
    {"key": "ww_plan_nps_nota", "label": "Nota NPS (0-10)", "type": "number", "options": null, "order": 640},
    {"key": "ww_plan_lua_de_mel_interesse", "label": "Interesse em Lua de Mel (cross-Trips)", "type": "boolean", "options": null, "order": 650}
  ]'::JSONB;
  v_field JSONB;
  v_options_text TEXT;
  v_sql TEXT;
  v_inserted INT := 0;
BEGIN

  -- Detectar se system_fields tem coluna org_id
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_fields' AND column_name = 'org_id'
  ) INTO v_has_org_col;

  -- Buscar section_id de wedding_info via campo ww_sdr_qualificado
  SELECT section_id INTO v_section_id
  FROM system_fields
  WHERE key = 'ww_sdr_qualificado'
  LIMIT 1;

  IF v_section_id IS NULL THEN
    SELECT section_id INTO v_section_id
    FROM system_fields
    WHERE key LIKE 'ww_%'
    LIMIT 1;
  END IF;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'Section wedding_info nao encontrada (staging descartavel?). Skipando insert.';
    RETURN;
  END IF;

  RAISE NOTICE 'Inserindo campos de planejamento em section_id=%, org_col=%', v_section_id, v_has_org_col;

  FOR v_field IN SELECT * FROM jsonb_array_elements(v_fields)
  LOOP
    IF v_field->'options' = 'null'::JSONB OR v_field->'options' IS NULL THEN
      v_options_text := 'NULL';
    ELSE
      v_options_text := quote_literal(v_field->>'options') || '::JSONB';
    END IF;

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
    v_inserted := v_inserted + 1;
  END LOOP;

  RAISE NOTICE 'Wedding planning fields: % campos processados (ON CONFLICT DO NOTHING protege duplicacao)', v_inserted;
END $$;
