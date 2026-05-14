-- ============================================================================
-- MIGRATION: backfill NPS abril/2026 WhatsApp — 45 enviadas, 16 respondidas
-- Date: 2026-05-14
--
-- Em abril/2026 foram enviadas 45 pesquisas NPS via WhatsApp.
-- Recebemos 16 respostas com dados completos (CSV
-- "Envio de mensagens pós venda - NPS-WPP.csv"). Existem 2 outras respostas
-- mencionadas pelo usuário sem dados (não estão no CSV) — serão ignoradas
-- nesta importação. Total real de respostas conhecidas: 18 (16 importadas
-- aqui + 2 sem dado).
--
-- Estratégia:
--   • 45 nps_surveys com channel='whatsapp', sent_at = 2026-04-15 12:00
--   • 16 dessas surveys têm response correspondente (linhas do CSV)
--   • Restantes 29 são marcadas como "phantom" (sem resposta nem dados
--     do destinatário — só pra completar o denominador do KPI "enviadas")
--   • Match por nome normalizado (lower + unaccent) contra cards Welcome Trips
--     → contatos.pessoa_principal. Sem match: card_id e contact_id ficam NULL.
--
-- Idempotência: ON CONFLICT (source_external_id) DO NOTHING.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
DECLARE
  v_org_id        UUID;
  v_imported      INT := 0;
  v_phantom       INT := 0;
  r_row           RECORD;
  v_card_id       UUID;
  v_contact_id    UUID;
  v_survey_id     UUID;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'welcome-trips' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'Welcome Trips org não encontrada — backfill abortado';
    RETURN;
  END IF;

  -- ─── PARTE 1: 16 respostas reais (com dados do CSV) ───────────────────
  FOR r_row IN
    WITH source (source_external_id, responded_at, full_name, phone, score, comment, proximo_destino, raw_payload) AS (
      VALUES
    ('whatsapp_2026_04_8d9fa431-59e7-47a2-b9fd-7d1894be1f0c', TIMESTAMPTZ '2026-04-15 12:00:00', 'Juliana', '553186614148', 10, 'Achei muito rica a experiência com a Welcome Trips! Escolhemos um destino bastante diferente, incomum, e tivemos todo apoio possível no planejamento de nossa viagem.
Adequamos o roteiro conforme nossas expectativas com reuniões on-line, e chegamos em um resultado maravilhoso!
Foi tudo perfeito', 'Turquia e Costa Amalfitana', '{"original_name": "Juliana", "phone": "553186614148", "csv_id": "8d9fa431-59e7-47a2-b9fd-7d1894be1f0c", "proximo_destino_raw": "Turquia e Costa Amalfitana"}'::jsonb),
    ('whatsapp_2026_04_ea75dd2c-0e09-4174-8942-55e127087d6a', TIMESTAMPTZ '2026-04-15 12:00:00', 'Márcia betzel🌹', '5527997205400', 10, 'Atendimento maravilhoso, dicas incríveis e uma assistência fora do comum.🤩👏👏👏', 'Malta & Londres', '{"original_name": "Márcia betzel🌹", "phone": "5527997205400", "csv_id": "ea75dd2c-0e09-4174-8942-55e127087d6a", "proximo_destino_raw": "Malta & Londres"}'::jsonb),
    ('whatsapp_2026_04_a7b7f951-6126-4630-ae72-d4c68fcb4900', TIMESTAMPTZ '2026-04-15 12:00:00', 'Giu', '554199216061', 10, 'Foi bem legal, devido a agilidade de check in e apoio na organização e reservas', 'Noronha', '{"original_name": "Giu", "phone": "554199216061", "csv_id": "a7b7f951-6126-4630-ae72-d4c68fcb4900", "proximo_destino_raw": "Noronha"}'::jsonb),
    ('whatsapp_2026_04_bed86a5d-565a-4b5c-9253-e65107ac6569', TIMESTAMPTZ '2026-04-15 12:00:00', 'Marina', '554199088380', 10, 'Tudo excelente
Mesmo quando não tinham menor obrigação de me ajudar 
Me ajudaram demais a deixar minha viagem melhor
Obrigada pelo esforço da Duda concierge principalmente! E da Juliana tbm!!', 'Irei para Amazônia em Janeiro
Acabei fechando por milhas a passagem
Mas a viagem do Japão de janeiro de 27 já está fechada com vcs!', '{"original_name": "Marina", "phone": "554199088380", "csv_id": "bed86a5d-565a-4b5c-9253-e65107ac6569", "proximo_destino_raw": "Irei para Amazônia em Janeiro\nAcabei fechando por milhas a passagem\nMas a viagem do Japão de janeiro de 27 já está fechada com vcs!"}'::jsonb),
    ('whatsapp_2026_04_42eb2dc1-07ad-4252-9cee-eed8a715fdc6', TIMESTAMPTZ '2026-04-15 12:00:00', '‎Tiago Abdul', '554199267071', 10, 'Foi excelente', 'Bonito', '{"original_name": "‎Tiago Abdul", "phone": "554199267071", "csv_id": "42eb2dc1-07ad-4252-9cee-eed8a715fdc6", "proximo_destino_raw": "Bonito"}'::jsonb),
    ('whatsapp_2026_04_c2dd90cd-80f1-4d90-b3b2-ba0e72242da4', TIMESTAMPTZ '2026-04-15 12:00:00', 'Marise', '554196717264', 9, 'Experiência foi boa', 'ainda não tenho próximo destino definido', '{"original_name": "Marise", "phone": "554196717264", "csv_id": "c2dd90cd-80f1-4d90-b3b2-ba0e72242da4", "proximo_destino_raw": "ainda não tenho próximo destino definido"}'::jsonb),
    ('whatsapp_2026_04_e778da0b-493e-49c9-95ac-6ddc11f155c6', TIMESTAMPTZ '2026-04-15 12:00:00', 'Thais Alessandra', '556684050508', 10, 'Eu gostei muito, só fiquei triste pq o hotel não quis reembolsar… eu saí um dia antes e cheguei um dia depois, acabei que perdi duas diária que eu não usei', 'Mas em relação a welcome, tudo perfeito !!!! 

O próximo destinos esse não vai ser em cascavel, depois Goiânia, depois vou para o Chile, depois Curaçao', '{"original_name": "Thais Alessandra", "phone": "556684050508", "csv_id": "e778da0b-493e-49c9-95ac-6ddc11f155c6", "proximo_destino_raw": "Mas em relação a welcome, tudo perfeito !!!! \n\nO próximo destinos esse não vai ser em cascavel, depois Goiânia, depois vou para o Chile, depois Curaçao"}'::jsonb),
    ('whatsapp_2026_04_81103f1f-c1cf-4ea2-ae22-85e36f7786c0', TIMESTAMPTZ '2026-04-15 12:00:00', 'Giulia Tocci', '554198344147', 10, 'Foi ótimo! Todas as sugestões da Camila foram muito boas', NULL, '{"original_name": "Giulia Tocci", "phone": "554198344147", "csv_id": "81103f1f-c1cf-4ea2-ae22-85e36f7786c0"}'::jsonb),
    ('whatsapp_2026_04_e1a3999e-a493-41eb-9f40-239a30221153', TIMESTAMPTZ '2026-04-15 12:00:00', 'Ewerton Rodrigo Belini', '554499008715', 10, NULL, NULL, '{"original_name": "Ewerton Rodrigo Belini", "phone": "554499008715", "csv_id": "e1a3999e-a493-41eb-9f40-239a30221153"}'::jsonb),
    ('whatsapp_2026_04_ae421ca2-b122-40ac-8b2c-2c983db3459d', TIMESTAMPTZ '2026-04-15 12:00:00', 'Alexis', '554199204467', 10, NULL, NULL, '{"original_name": "Alexis", "phone": "554199204467", "csv_id": "ae421ca2-b122-40ac-8b2c-2c983db3459d"}'::jsonb),
    ('whatsapp_2026_04_8c06aff6-5935-43c3-a5ac-173faf0e5167', TIMESTAMPTZ '2026-04-15 12:00:00', 'Fernanda J M Abud', '5511981526858', 10, 'Foi muito boa. Hotel super bom para crianças.. adoramos tudo', NULL, '{"original_name": "Fernanda J M Abud", "phone": "5511981526858", "csv_id": "8c06aff6-5935-43c3-a5ac-173faf0e5167"}'::jsonb),
    ('whatsapp_2026_04_42eb2dc1-07ad-4252-9cee-eed8a715fdc6', TIMESTAMPTZ '2026-04-15 12:00:00', '‎Tiago Abdul', '554199267071', 10, 'Ótima', 'Club med lake paradise', '{"original_name": "‎Tiago Abdul", "phone": "554199267071", "csv_id": "42eb2dc1-07ad-4252-9cee-eed8a715fdc6", "proximo_destino_raw": "Club med lake paradise"}'::jsonb),
    ('whatsapp_2026_04_ddbfdd68-e8a8-4643-8d9a-e3d6a9a84fca', TIMESTAMPTZ '2026-04-27 00:00:00', 'Matheus', '554196288214', 10, 'Excelente', 'Não sei', '{"original_name": "Matheus", "phone": "554196288214", "csv_id": "ddbfdd68-e8a8-4643-8d9a-e3d6a9a84fca", "proximo_destino_raw": "Não sei"}'::jsonb),
    ('whatsapp_2026_04_d04075d0-6051-4885-aafa-738e3b22c3a8', TIMESTAMPTZ '2026-04-28 00:00:00', 'Erton', '554199550605', 5, 'Minha esposa achou que faltou mais proximidade e detalhamento no processo. O único foi uma ótima sugestão, mas o processo em si poderia ter sido conduzido com mais proximidade', 'Não temos nada definido no momento, tivemos tantos problemas no voo de retorno que iremos entrar com processo na Cia aérea. Não acho que tivemos mto apoio para nos ajudar a resolver os problemas também', '{"original_name": "Erton", "phone": "554199550605", "csv_id": "d04075d0-6051-4885-aafa-738e3b22c3a8", "proximo_destino_raw": "Não temos nada definido no momento, tivemos tantos problemas no voo de retorno que iremos entrar com processo na Cia aérea. Não acho que tivemos mto apoio para nos ajudar a resolver os problemas também"}'::jsonb),
    ('whatsapp_2026_04_e07731e5-ef6d-4478-b70a-893e905845b4', TIMESTAMPTZ '2026-04-28 00:00:00', 'Eugenio', '554199721555', 10, 'Olha segunda vez ou terceira que viajamos com vocês, e foi tudo sempre ótimo', NULL, '{"original_name": "Eugenio", "phone": "554199721555", "csv_id": "e07731e5-ef6d-4478-b70a-893e905845b4"}'::jsonb),
    ('whatsapp_2026_04_14bc2556-855c-4423-ac7a-b68039ebc5e5', TIMESTAMPTZ '2026-04-30 00:00:00', 'Leticia', '554199310101', 10, NULL, NULL, '{"original_name": "Leticia", "phone": "554199310101", "csv_id": "14bc2556-855c-4423-ac7a-b68039ebc5e5"}'::jsonb)
    ),
    normalized AS (
      SELECT
        s.*,
        regexp_replace(lower(unaccent(trim(s.full_name))), '\s+', ' ', 'g') AS norm_name
      FROM source s
    ),
    candidates AS (
      SELECT
        n.source_external_id,
        n.responded_at,
        n.full_name,
        n.phone,
        n.score,
        n.comment,
        n.proximo_destino,
        n.raw_payload,
        c.id AS card_id,
        c.pessoa_principal_id AS contact_id,
        ROW_NUMBER() OVER (
          PARTITION BY n.source_external_id
          ORDER BY c.created_at DESC NULLS LAST
        ) AS rn
      FROM normalized n
      LEFT JOIN public.cards c ON c.org_id = v_org_id
        AND c.archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.contatos co
          WHERE co.id = c.pessoa_principal_id
            AND regexp_replace(
                  lower(unaccent(trim(coalesce(co.nome, '') || ' ' || coalesce(co.sobrenome, '')))),
                  '\s+', ' ', 'g'
                ) = n.norm_name
        )
    )
    SELECT source_external_id, responded_at, score, comment, proximo_destino, raw_payload, card_id, contact_id
    FROM candidates
    WHERE rn = 1
    ORDER BY responded_at
  LOOP
    v_card_id := r_row.card_id;
    v_contact_id := r_row.contact_id;

    -- Survey (sent_at = 2026-04-15, mesmo pra todas as 16 — não temos data real de envio)
    INSERT INTO public.nps_surveys
      (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
    VALUES
      (v_org_id, v_card_id, v_contact_id, 'whatsapp', TIMESTAMPTZ '2026-04-15 12:00:00', r_row.source_external_id, TIMESTAMPTZ '2026-04-15 12:00:00')
    ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_survey_id;

    IF v_survey_id IS NULL THEN
      SELECT id INTO v_survey_id FROM public.nps_surveys
      WHERE source_external_id = r_row.source_external_id LIMIT 1;
    END IF;

    INSERT INTO public.nps_responses
      (survey_id, org_id, card_id, score, comment, proximo_destino, responded_at, raw_payload, created_at)
    VALUES
      (v_survey_id, v_org_id, v_card_id, r_row.score, r_row.comment, r_row.proximo_destino, r_row.responded_at, r_row.raw_payload, r_row.responded_at)
    ON CONFLICT (survey_id) DO NOTHING;

    v_imported := v_imported + 1;
  END LOOP;

  -- ─── PARTE 2: 29 phantom surveys (sem dados do destinatário) ──────────
  FOR i IN 1..29 LOOP
    INSERT INTO public.nps_surveys
      (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
    VALUES
      (v_org_id, NULL, NULL, 'whatsapp', TIMESTAMPTZ '2026-04-15 12:00:00',
       'whatsapp_2026_04_phantom_' || lpad(i::text, 3, '0'),
       TIMESTAMPTZ '2026-04-15 12:00:00')
    ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING;

    v_phantom := v_phantom + 1;
  END LOOP;

  RAISE NOTICE 'NPS abril/whatsapp: % respostas importadas + % phantom surveys = 45 enviadas / 16 respondidas.',
    v_imported, v_phantom;
END $$;

COMMIT;
