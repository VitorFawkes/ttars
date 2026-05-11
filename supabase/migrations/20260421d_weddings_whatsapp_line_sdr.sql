-- ============================================================================
-- Estela — Linha WhatsApp "SDR Weddings" no Echo
-- ============================================================================
-- Registra a linha nao-oficial (UUID Echo) que a Estela vai usar pra receber
-- mensagens dos casais. A linha ja existe no Echo; aqui so registramos no CRM
-- pra o router (ai-agent-router) conseguir rotear mensagens dessa linha.
--
-- ID da linha (Echo UUID): 4b731573-511d-4f6a-ba55-40b5046d2f1d
-- Platform: Echo (0ce942d3-244f-41a7-a9dd-9d69d3830be6)
-- Produto: WEDDING, Org: Welcome Weddings
-- Pipeline: f4611f84-ce9c-48ad-814b-dcd6081f15db (Weddings)
-- Stage inicial: Novo Lead (6acb35af-d1a2-48e7-bc48-133907ae9554)
-- Phase: SDR Weddings (545a78f5-e58b-48a7-980a-e2a2652dc755)
--
-- Idempotente: ON CONFLICT DO NOTHING via check manual.
-- ============================================================================

DO $$
DECLARE
  v_phone_number_id TEXT := '4b731573-511d-4f6a-ba55-40b5046d2f1d';
  v_platform_id UUID := '0ce942d3-244f-41a7-a9dd-9d69d3830be6';  -- Echo
  v_org_id UUID := 'a0000000-0000-0000-0000-000000000001';       -- Welcome Group (padrao)
  v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';  -- Weddings
  v_stage_id UUID := '6acb35af-d1a2-48e7-bc48-133907ae9554';     -- Novo Lead
  v_phase_id UUID := '545a78f5-e58b-48a7-980a-e2a2652dc755';     -- SDR Weddings
BEGIN

  -- 0. Valida que as tabelas core existem (staging descartavel pode nao ter tudo)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'whatsapp_linha_config'
  ) THEN
    RAISE NOTICE 'Tabela whatsapp_linha_config nao existe neste ambiente. Skipando.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'whatsapp_platforms'
  ) THEN
    RAISE NOTICE 'Tabela whatsapp_platforms nao existe neste ambiente. Skipando.';
    RETURN;
  END IF;

  -- 1. Valida que o platform Echo existe
  IF NOT EXISTS (SELECT 1 FROM whatsapp_platforms WHERE id = v_platform_id) THEN
    RAISE NOTICE 'Plataforma Echo (%) nao encontrada neste ambiente. Skipando registro da linha.', v_platform_id;
    RETURN;
  END IF;

  -- 2. Valida que o pipeline Weddings existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'pipelines'
  ) OR NOT EXISTS (SELECT 1 FROM pipelines WHERE id = v_pipeline_id) THEN
    RAISE NOTICE 'Pipeline Weddings (%) nao encontrado neste ambiente. Skipando.', v_pipeline_id;
    RETURN;
  END IF;

  -- 3. UPSERT manual (phone_number_id nao tem UNIQUE constraint na tabela)
  IF EXISTS (
    SELECT 1 FROM whatsapp_linha_config
    WHERE phone_number_id = v_phone_number_id
  ) THEN
    UPDATE whatsapp_linha_config SET
      platform_id = v_platform_id,
      phone_number_label = 'SDR Weddings',
      ativo = true,
      produto = 'WEDDING',
      pipeline_id = v_pipeline_id,
      stage_id = v_stage_id,
      phase_id = v_phase_id,
      updated_at = NOW()
    WHERE phone_number_id = v_phone_number_id;
    RAISE NOTICE 'Linha SDR Weddings atualizada (phone_number_id=%)', v_phone_number_id;
  ELSE
    INSERT INTO whatsapp_linha_config (
      platform_id,
      phone_number_label,
      phone_number_id,
      ativo,
      produto,
      pipeline_id,
      stage_id,
      phase_id,
      org_id
    )
    VALUES (
      v_platform_id,
      'SDR Weddings',
      v_phone_number_id,
      true,
      'WEDDING',
      v_pipeline_id,
      v_stage_id,
      v_phase_id,
      v_org_id
    );
    RAISE NOTICE 'Linha SDR Weddings criada (phone_number_id=%)', v_phone_number_id;
  END IF;
END $$;
