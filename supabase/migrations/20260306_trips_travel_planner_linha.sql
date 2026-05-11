-- ============================================================
-- Adiciona linha "Trips - Travel Planner" do Echo ao CRM
-- Configura roteamento + backfill mensagens sem produto
-- ============================================================

-- 1. UPSERT whatsapp_linha_config
INSERT INTO whatsapp_linha_config (
    platform_id,
    phone_number_label,
    phone_number_id,
    ativo,
    produto,
    fase_label,
    phase_id,
    pipeline_id,
    stage_id
) VALUES (
    '0ce942d3-244f-41a7-a9dd-9d69d3830be6',  -- Echo platform
    'Trips - Travel Planner',
    'da3edcc0-a04a-4962-aa68-13758ec409be',   -- Echo phone ID
    true,
    'TRIPS',
    'Planner',
    'eafb7dff-663c-4713-bca2-035dcf2093ba',  -- Planner phase
    'c8022522-4a1d-411c-9387-efe03ca725ee',  -- TRIPS pipeline
    '706926c6-ed45-45ba-b393-e8338b46c066'   -- Aguardando Briefing (1ª etapa Planner)
) ON CONFLICT (phone_number_label) DO UPDATE SET
    phone_number_id = EXCLUDED.phone_number_id,
    ativo       = true,
    produto     = 'TRIPS',
    fase_label  = 'Planner',
    phase_id    = EXCLUDED.phase_id,
    pipeline_id = EXCLUDED.pipeline_id,
    stage_id    = EXCLUDED.stage_id;

-- 2. Backfill mensagens existentes sem produto/fase_label
UPDATE whatsapp_messages
SET produto    = 'TRIPS',
    fase_label = 'Planner'
WHERE phone_number_label = 'Trips - Travel Planner'
  AND (produto IS NULL OR fase_label IS NULL);
