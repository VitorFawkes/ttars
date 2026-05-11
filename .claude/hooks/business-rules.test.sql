-- ============================================================================
-- BUSINESS RULES TEST SUITE
--
-- Testa regras de negócio críticas contra regressões. Roda em transação que
-- faz ROLLBACK no final — nenhum dado persiste.
--
-- Cobertura atual: validate_stage_requirements (todos os tipos de regra).
-- Adicionar novos casos conforme novas regras forem criadas.
--
-- Uso: .claude/hooks/test-business-rules.sh
-- Como funciona: o DO block dispara RAISE EXCEPTION se algum teste falhar,
-- o que aborta a transação e o runner detecta via parsing da resposta da API.
-- ============================================================================

BEGIN;

-- ─── FIXTURES ────────────────────────────────────────────────────────────────
-- Usamos UUIDs sintéticos ('deadbeef' pattern) para não colidir com dados reais.
-- Criamos uma org de teste dedicada pra evitar unique constraints contra dados
-- reais (ex: pipelines_org_produto_key).

-- Org de teste
INSERT INTO organizations (id, name, slug, active)
VALUES ('deadbeef-0000-0000-0000-0000000000aa', 'Test Rules Org', 'test_rules_org_' || substr(md5(random()::text), 1, 8), true);

-- Pipeline de teste
INSERT INTO pipelines (id, produto, nome, org_id, ativo)
VALUES ('deadbeef-0000-0000-0000-000000000001', 'TRIPS', 'Test Rules Pipeline', 'deadbeef-0000-0000-0000-0000000000aa', true);

-- Phase de teste
INSERT INTO pipeline_phases (id, name, label, color, slug, order_index, org_id, active)
VALUES ('deadbeef-0000-0000-0000-000000000002', 'Test Phase', 'Test Phase', '#888888', 'test_rules', 1, 'deadbeef-0000-0000-0000-0000000000aa', true);

-- Stages de teste (um pra cada tipo de regra)
INSERT INTO pipeline_stages (id, nome, pipeline_id, phase_id, ordem, org_id, ativo) VALUES
  ('deadbeef-0000-0000-0000-000000000011', 'Stage Sem Regras', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 1, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000012', 'Stage Contato Completo', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 2, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000013', 'Stage Contato Basico', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 3, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000014', 'Stage Lost Reason', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 4, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000015', 'Stage Field Required', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 5, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000016', 'Stage Team Member', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 6, 'deadbeef-0000-0000-0000-0000000000aa', true),
  ('deadbeef-0000-0000-0000-000000000017', 'Stage Non Blocking', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000002', 7, 'deadbeef-0000-0000-0000-0000000000aa', true);

-- Regras em cada stage
INSERT INTO stage_field_config (stage_id, field_key, requirement_type, requirement_label, is_required, is_blocking, is_visible, org_id, required_team_role) VALUES
  ('deadbeef-0000-0000-0000-000000000012', 'contato_principal_completo', 'rule', 'Contato Completo', true, true, true, 'deadbeef-0000-0000-0000-0000000000aa', NULL),
  ('deadbeef-0000-0000-0000-000000000013', 'contato_principal_basico', 'rule', 'Contato Basico', true, true, true, 'deadbeef-0000-0000-0000-0000000000aa', NULL),
  ('deadbeef-0000-0000-0000-000000000014', 'lost_reason_required', 'rule', 'Motivo da Perda', true, true, true, 'deadbeef-0000-0000-0000-0000000000aa', NULL),
  ('deadbeef-0000-0000-0000-000000000015', 'numero_venda_monde', 'field', 'Numero Venda', true, true, true, 'deadbeef-0000-0000-0000-0000000000aa', NULL),
  ('deadbeef-0000-0000-0000-000000000016', NULL, 'team_member', 'Responsavel Pos-Venda', true, true, true, 'deadbeef-0000-0000-0000-0000000000aa', 'pos_venda'),
  ('deadbeef-0000-0000-0000-000000000017', 'contato_principal_completo', 'rule', 'Contato Completo (non-blocking)', true, false, true, 'deadbeef-0000-0000-0000-0000000000aa', NULL);

-- Contatos de teste — criamos todos com telefone (trigger check_contato_required_fields
-- exige telefone no INSERT) e depois zeramos campos nos que devem ficar vazios.
INSERT INTO contatos (id, nome, sobrenome, telefone, email, cpf, org_id) VALUES
  ('deadbeef-0000-0000-0000-000000000101', 'Teste', 'Completo', '11999999901', 'teste@teste.com', '00000000001', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000102', 'Teste', 'SemEmail', '11999999902', NULL, '00000000002', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000103', 'Teste', 'SemTel', '11999999903', 'st@t.com', '00000000003', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000104', 'Teste', 'SemCPF', '11999999904', 'sc@t.com', NULL, 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000106', 'SoNome', 'Sobrenome', '11999999906', NULL, NULL, 'deadbeef-0000-0000-0000-0000000000aa');

-- Zerar telefone/cpf em contatos específicos pra simular dados incompletos
UPDATE contatos SET telefone = NULL WHERE id = 'deadbeef-0000-0000-0000-000000000103';

-- Cards de teste (todos no stage "Sem Regras" — move via função, não via UPDATE)
INSERT INTO cards (id, titulo, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id, org_id) VALUES
  ('deadbeef-0000-0000-0000-000000000201', 'Card ComContatoCompleto', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', 'deadbeef-0000-0000-0000-000000000101', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000202', 'Card SemEmail', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', 'deadbeef-0000-0000-0000-000000000102', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000203', 'Card SemTel', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', 'deadbeef-0000-0000-0000-000000000103', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000204', 'Card SemCPF', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', 'deadbeef-0000-0000-0000-000000000104', 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000205', 'Card SemPessoa', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', NULL, 'deadbeef-0000-0000-0000-0000000000aa'),
  ('deadbeef-0000-0000-0000-000000000206', 'Card ContatoBasico', 'TRIPS', 'deadbeef-0000-0000-0000-000000000001', 'deadbeef-0000-0000-0000-000000000011', 'deadbeef-0000-0000-0000-000000000106', 'deadbeef-0000-0000-0000-0000000000aa');

-- Card com motivo de perda
UPDATE cards SET motivo_perda_comentario = 'Cliente desistiu'
 WHERE id = 'deadbeef-0000-0000-0000-000000000201';

-- Card com produto_data preenchido
UPDATE cards SET produto_data = '{"numero_venda_monde": "99999"}'::jsonb
 WHERE id = 'deadbeef-0000-0000-0000-000000000202';

-- Card com briefing_inicial preenchido
UPDATE cards SET briefing_inicial = '{"numero_venda_monde": "88888"}'::jsonb
 WHERE id = 'deadbeef-0000-0000-0000-000000000203';

-- Card com pos_owner_id atribuído (para team_member test)
-- Precisa ser user real (FK pra auth.users). Pega qualquer user existente.
UPDATE cards SET pos_owner_id = (SELECT id FROM auth.users LIMIT 1)
 WHERE id = 'deadbeef-0000-0000-0000-000000000201';

-- ─── TESTES ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r jsonb;
  failed text[] := ARRAY[]::text[];
  passed int := 0;

  -- Helper IDs
  stage_sem_regras       uuid := 'deadbeef-0000-0000-0000-000000000011';
  stage_contato_completo uuid := 'deadbeef-0000-0000-0000-000000000012';
  stage_contato_basico   uuid := 'deadbeef-0000-0000-0000-000000000013';
  stage_lost_reason      uuid := 'deadbeef-0000-0000-0000-000000000014';
  stage_field_required   uuid := 'deadbeef-0000-0000-0000-000000000015';
  stage_team_member      uuid := 'deadbeef-0000-0000-0000-000000000016';
  stage_non_blocking     uuid := 'deadbeef-0000-0000-0000-000000000017';

  card_completo      uuid := 'deadbeef-0000-0000-0000-000000000201';
  card_sem_email     uuid := 'deadbeef-0000-0000-0000-000000000202';
  card_sem_tel       uuid := 'deadbeef-0000-0000-0000-000000000203';
  card_sem_cpf       uuid := 'deadbeef-0000-0000-0000-000000000204';
  card_sem_pessoa    uuid := 'deadbeef-0000-0000-0000-000000000205';
  card_contato_bas   uuid := 'deadbeef-0000-0000-0000-000000000206';
BEGIN
  -- ── Sanity ─────────────────────────────────────────────────────
  r := validate_stage_requirements(card_completo, stage_sem_regras);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T01 sanity (stage sem regras) — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── contato_principal_completo: nome+sobrenome+telefone+cpf (email NÃO obrigatório) ──
  r := validate_stage_requirements(card_completo, stage_contato_completo);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T02 contato completo (todos campos) — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- Esse é o caso da Mariana/Bárbara — regressão de 17/abril
  r := validate_stage_requirements(card_sem_email, stage_contato_completo);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T03 contato SEM EMAIL — esperava valid=true (email NÃO é obrigatório desde 13/04). Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_tel, stage_contato_completo);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T04 contato SEM TELEFONE — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_cpf, stage_contato_completo);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T05 contato SEM CPF — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_pessoa, stage_contato_completo);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T06 card sem pessoa_principal_id — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── contato_principal_basico: nome+sobrenome ──
  r := validate_stage_requirements(card_contato_bas, stage_contato_basico);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T07 contato basico com nome+sobrenome — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── lost_reason_required ──
  r := validate_stage_requirements(card_completo, stage_lost_reason);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T08 lost_reason com motivo_comentario — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_email, stage_lost_reason);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T09 lost_reason sem motivo — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── field (produto_data / briefing_inicial waterfall) ──
  r := validate_stage_requirements(card_sem_email, stage_field_required);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T10 field em produto_data — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_tel, stage_field_required);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T11 field em briefing_inicial — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_completo, stage_field_required);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T12 field ausente em ambos — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── team_member pos_venda ──
  r := validate_stage_requirements(card_completo, stage_team_member);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T13 team_member pos_venda com pos_owner_id — esperava valid=true. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  r := validate_stage_requirements(card_sem_email, stage_team_member);
  IF (r->>'valid')::bool IS TRUE THEN
    failed := array_append(failed, format('T14 team_member pos_venda sem owner — esperava valid=false. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── is_blocking=false deve ser ignorada ──
  r := validate_stage_requirements(card_sem_pessoa, stage_non_blocking);
  IF (r->>'valid')::bool IS NOT TRUE THEN
    failed := array_append(failed, format('T15 regra non-blocking — esperava valid=true mesmo sem contato. Got: %s', r));
  ELSE passed := passed + 1; END IF;

  -- ── Relatório final ──
  IF array_length(failed, 1) > 0 THEN
    RAISE EXCEPTION E'BUSINESS_RULES_TESTS_FAILED\nPassed: %/%.\nFailures:\n%',
      passed, passed + array_length(failed, 1), array_to_string(failed, E'\n  • ');
  END IF;

  RAISE NOTICE 'BUSINESS_RULES_TESTS_PASSED: % tests', passed;
END $$;

ROLLBACK;