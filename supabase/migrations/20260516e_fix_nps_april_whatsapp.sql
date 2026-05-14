-- ============================================================================
-- MIGRATION: fix backfill NPS abril/WhatsApp
-- Date: 2026-05-14
--
-- Ajustes pós-aplicação de 20260516d:
--   1. CSV tinha Tiago Abdul duplicado com mesmo UUID (comentários diferentes:
--      "Foi excelente / Bonito" + "Ótima / Club med lake paradise"). O ON
--      CONFLICT do backfill original pulou a 2a ocorrência. Adicionamos com
--      source_external_id distinto.
--   2. Existem 2 respostas score=10 vindas de fora do CSV (informadas pelo
--      usuário). Adicionamos com base nos telefones 5541935003456 e
--      554195187719. Sem nome/comentário/destino — só score.
--   3. Pra manter o total de 45 enviadas em abril, removemos 3 dos 29 phantom
--      surveys gerados (phantom_027, _028, _029) já que agora temos 3 surveys
--      "reais" novas.
--
-- Resultado esperado: 45 surveys whatsapp / 18 respostas em abril.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
DECLARE
  v_org_id     UUID;
  v_card_id    UUID;
  v_contact_id UUID;
  v_survey_id  UUID;
  v_sent_at    TIMESTAMPTZ := TIMESTAMPTZ '2026-04-15 12:00:00';
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'welcome-trips' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'Welcome Trips org não encontrada — fix abortado';
    RETURN;
  END IF;

  -- ─── 1) Tiago Abdul #2 (CSV duplicado) ────────────────────────────────
  -- Match por nome: "Tiago Abdul" (com zero-width char filtrado pelo trim)
  SELECT c.id, c.pessoa_principal_id
    INTO v_card_id, v_contact_id
  FROM public.cards c
  LEFT JOIN public.contatos co ON co.id = c.pessoa_principal_id
  WHERE c.org_id = v_org_id
    AND c.archived_at IS NULL
    AND regexp_replace(
          lower(unaccent(trim(coalesce(co.nome, '') || ' ' || coalesce(co.sobrenome, '')))),
          '\s+', ' ', 'g'
        ) = 'tiago abdul'
  ORDER BY c.created_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.nps_surveys
    (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
  VALUES
    (v_org_id, v_card_id, v_contact_id, 'whatsapp', v_sent_at,
     'whatsapp_2026_04_42eb_dup2', v_sent_at)
  ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_survey_id;

  IF v_survey_id IS NULL THEN
    SELECT id INTO v_survey_id FROM public.nps_surveys
    WHERE source_external_id = 'whatsapp_2026_04_42eb_dup2' LIMIT 1;
  END IF;

  INSERT INTO public.nps_responses
    (survey_id, org_id, card_id, score, comment, proximo_destino, responded_at, raw_payload, created_at)
  VALUES
    (v_survey_id, v_org_id, v_card_id, 10, 'Ótima', 'Club med lake paradise',
     v_sent_at,
     '{"original_name": "Tiago Abdul", "phone": "554199267071", "csv_id": "42eb2dc1-07ad-4252-9cee-eed8a715fdc6", "duplicate_of": "whatsapp_2026_04_42eb2dc1-07ad-4252-9cee-eed8a715fdc6"}'::jsonb,
     v_sent_at)
  ON CONFLICT (survey_id) DO NOTHING;

  -- ─── 2) Outside response #1 — telefone 5541935003456 ──────────────────
  v_card_id := NULL;
  v_contact_id := NULL;

  INSERT INTO public.nps_surveys
    (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
  VALUES
    (v_org_id, NULL, NULL, 'whatsapp', v_sent_at,
     'whatsapp_2026_04_outside_5541935003456', v_sent_at)
  ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_survey_id;

  IF v_survey_id IS NULL THEN
    SELECT id INTO v_survey_id FROM public.nps_surveys
    WHERE source_external_id = 'whatsapp_2026_04_outside_5541935003456' LIMIT 1;
  END IF;

  INSERT INTO public.nps_responses
    (survey_id, org_id, card_id, score, comment, proximo_destino, responded_at, raw_payload, created_at)
  VALUES
    (v_survey_id, v_org_id, NULL, 10, NULL, NULL,
     v_sent_at,
     '{"phone": "5541935003456", "source": "outside_csv"}'::jsonb,
     v_sent_at)
  ON CONFLICT (survey_id) DO NOTHING;

  -- ─── 3) Outside response #2 — telefone 554195187719 ───────────────────
  INSERT INTO public.nps_surveys
    (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
  VALUES
    (v_org_id, NULL, NULL, 'whatsapp', v_sent_at,
     'whatsapp_2026_04_outside_554195187719', v_sent_at)
  ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_survey_id;

  IF v_survey_id IS NULL THEN
    SELECT id INTO v_survey_id FROM public.nps_surveys
    WHERE source_external_id = 'whatsapp_2026_04_outside_554195187719' LIMIT 1;
  END IF;

  INSERT INTO public.nps_responses
    (survey_id, org_id, card_id, score, comment, proximo_destino, responded_at, raw_payload, created_at)
  VALUES
    (v_survey_id, v_org_id, NULL, 10, NULL, NULL,
     v_sent_at,
     '{"phone": "554195187719", "source": "outside_csv"}'::jsonb,
     v_sent_at)
  ON CONFLICT (survey_id) DO NOTHING;

  -- ─── 4) Remover 3 phantom surveys pra manter total 45 em abril ────────
  DELETE FROM public.nps_surveys
  WHERE source_external_id IN (
    'whatsapp_2026_04_phantom_027',
    'whatsapp_2026_04_phantom_028',
    'whatsapp_2026_04_phantom_029'
  );

  RAISE NOTICE 'Fix aplicado: +3 respostas (Tiago#2 + 2 outside), -3 phantoms.';
END $$;

COMMIT;
