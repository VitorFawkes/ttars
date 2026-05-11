-- ============================================================================
-- MIGRATION: Pontuação ao vivo da SDR humana — espelho literal da Estela
-- Date: 2026-05-12
--
-- Cria infraestrutura para SDRs humanas pontuarem leads em tempo real usando
-- exatamente as mesmas regras da Estela (mesma RPC, mesmas tabelas — só leitura).
--
-- RESTRIÇÃO INVIOLÁVEL: ZERO TOQUE em tabelas ai_agent_*. Esta migration:
--   - Cria tabela nova `sdr_qualifications` (namespace próprio)
--   - Adiciona coluna nova `cards.sdr_qualification_score_latest` (denormalização)
--   - Cria função utilitária `sdr_normalize_phone()`
--   - Cria 8 RPCs novas em namespace `sdr_*`
--   - Cria 5 triggers (4 em sdr_qualifications, 1 em cards)
--   - NÃO cria trigger algum em ai_agent_*, ai_conversation_*, ai_agents
--   - NÃO altera RPCs existentes (calculate_agent_qualification_score etc)
--
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Função utilitária — normaliza telefone para formato consistente
--    com contatos.telefone (DDI 55 + DDD + número, só dígitos)
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sdr_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF v_digits = '' THEN RETURN NULL; END IF;
  IF length(v_digits) BETWEEN 8 AND 11 THEN
    v_digits := '55' || v_digits;
  END IF;
  IF length(v_digits) NOT BETWEEN 12 AND 13 THEN
    RETURN NULL;
  END IF;
  RETURN v_digits;
END;
$$;

COMMENT ON FUNCTION sdr_normalize_phone IS
  'Normaliza telefone para formato 55DDDNNNNNNNN (12-13 dígitos). Retorna NULL se inválido.';

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabela sdr_qualifications
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sdr_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id()
    REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  rules_version TEXT,
  contato_id UUID NULL REFERENCES contatos(id) ON DELETE SET NULL,
  card_id UUID NULL REFERENCES cards(id) ON DELETE SET NULL,
  telefone_normalizado TEXT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'finalizado', 'descartado')),
  dados_lead JSONB NOT NULL DEFAULT '{}'::JSONB,
  scoring_inputs JSONB NOT NULL DEFAULT '{}'::JSONB,
  score_result JSONB NOT NULL DEFAULT '{}'::JSONB,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id),
  notas TEXT,
  finalized_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  parent_qualification_id UUID NULL REFERENCES sdr_qualifications(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sdr_qual_anchor CHECK (
    contato_id IS NOT NULL OR card_id IS NOT NULL OR telefone_normalizado IS NOT NULL
  )
);

COMMENT ON TABLE sdr_qualifications IS
  'Pontuações de qualificação preenchidas por SDRs humanas. Reusa regras da Estela (read-only). Histórico completo, soft-delete.';

CREATE INDEX IF NOT EXISTS idx_sdr_qual_card ON sdr_qualifications(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sdr_qual_contato ON sdr_qualifications(contato_id) WHERE contato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sdr_qual_phone ON sdr_qualifications(telefone_normalizado) WHERE telefone_normalizado IS NOT NULL AND card_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sdr_qual_org_status ON sdr_qualifications(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_qual_user ON sdr_qualifications(sdr_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_qual_parent ON sdr_qualifications(parent_qualification_id) WHERE parent_qualification_id IS NOT NULL;

-- RLS
ALTER TABLE sdr_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdr_qual_org_all ON sdr_qualifications;
CREATE POLICY sdr_qual_org_all ON sdr_qualifications
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS sdr_qual_service_all ON sdr_qualifications;
CREATE POLICY sdr_qual_service_all ON sdr_qualifications
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Coluna denormalizada em cards (resolve N+1 no Kanban)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS sdr_qualification_score_latest JSONB;

COMMENT ON COLUMN cards.sdr_qualification_score_latest IS
  'Snapshot do score humano mais recente finalizado. Atualizado por trigger em sdr_qualifications. Ex: {score, qualificado, finalized_at, sdr_user_id, qualification_id, score_outdated}';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Triggers
-- ──────────────────────────────────────────────────────────────────────────

-- 3.1 Cross-org alignment + normalize phone
CREATE OR REPLACE FUNCTION trg_fn_sdr_qual_validate_and_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contato_org UUID;
  v_card_org UUID;
BEGIN
  IF NEW.telefone_normalizado IS NOT NULL THEN
    NEW.telefone_normalizado := sdr_normalize_phone(NEW.telefone_normalizado);
  END IF;

  IF NEW.contato_id IS NOT NULL THEN
    SELECT org_id INTO v_contato_org FROM contatos WHERE id = NEW.contato_id;
    IF v_contato_org IS NULL THEN
      RAISE EXCEPTION 'sdr_qualifications: contato_id % nao existe', NEW.contato_id;
    END IF;
    IF v_contato_org != NEW.org_id THEN
      RAISE EXCEPTION 'sdr_qualifications: cross-org violation entre contato (%) e pontuacao (%)',
        v_contato_org, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.card_id IS NOT NULL THEN
    SELECT org_id INTO v_card_org FROM cards WHERE id = NEW.card_id;
    IF v_card_org IS NULL THEN
      RAISE EXCEPTION 'sdr_qualifications: card_id % nao existe', NEW.card_id;
    END IF;
    IF v_card_org != NEW.org_id THEN
      RAISE EXCEPTION 'sdr_qualifications: cross-org violation entre card (%) e pontuacao (%)',
        v_card_org, NEW.org_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdr_qual_validate ON sdr_qualifications;
CREATE TRIGGER trg_sdr_qual_validate
  BEFORE INSERT OR UPDATE ON sdr_qualifications
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sdr_qual_validate_and_normalize();

-- 3.2 Activity log no finalize
CREATE OR REPLACE FUNCTION trg_fn_sdr_qual_log_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score NUMERIC;
  v_qualificado BOOLEAN;
  v_sdr_nome TEXT;
BEGIN
  IF NEW.card_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status != 'finalizado' THEN RETURN NEW; END IF;
  IF OLD.status = 'finalizado' THEN RETURN NEW; END IF;

  v_score := COALESCE((NEW.score_result->>'score')::NUMERIC, 0);
  v_qualificado := COALESCE((NEW.score_result->>'qualificado')::BOOLEAN, false);
  SELECT nome INTO v_sdr_nome FROM profiles WHERE id = NEW.sdr_user_id;

  INSERT INTO activities (
    card_id, org_id, tipo, descricao, metadata,
    created_by, actor_type, actor_id, actor_label
  ) VALUES (
    NEW.card_id,
    NEW.org_id,
    'pontuacao_sdr',
    COALESCE(v_sdr_nome, 'SDR') || ' registrou pontuacao ' || v_score::TEXT ||
      ' (' || CASE WHEN v_qualificado THEN 'qualificado' ELSE 'nao qualificado' END || ')',
    jsonb_build_object(
      'qualification_id', NEW.id,
      'score', v_score,
      'qualificado', v_qualificado,
      'breakdown', NEW.score_result->'breakdown',
      'version', NEW.version,
      'notas', NEW.notas
    ),
    NEW.sdr_user_id,
    'user',
    NEW.sdr_user_id,
    v_sdr_nome
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdr_qual_log ON sdr_qualifications;
CREATE TRIGGER trg_sdr_qual_log
  AFTER UPDATE ON sdr_qualifications
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sdr_qual_log_activity();

-- 3.3 Denormalizar para cards.sdr_qualification_score_latest
CREATE OR REPLACE FUNCTION trg_fn_sdr_qual_denormalize_to_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest RECORD;
BEGIN
  IF NEW.card_id IS NULL AND (TG_OP = 'INSERT' OR OLD.card_id IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Busca a finalização mais recente do card (pode não ser a NEW se for update de versão antiga)
  SELECT id, score_result, sdr_user_id, finalized_at
    INTO v_latest
  FROM sdr_qualifications
  WHERE card_id = COALESCE(NEW.card_id, OLD.card_id)
    AND status = 'finalizado'
  ORDER BY finalized_at DESC NULLS LAST, version DESC, created_at DESC
  LIMIT 1;

  IF v_latest.id IS NULL THEN
    UPDATE cards SET sdr_qualification_score_latest = NULL
    WHERE id = COALESCE(NEW.card_id, OLD.card_id);
  ELSE
    UPDATE cards SET sdr_qualification_score_latest = jsonb_build_object(
      'qualification_id', v_latest.id,
      'score', (v_latest.score_result->>'score')::NUMERIC,
      'qualificado', (v_latest.score_result->>'qualificado')::BOOLEAN,
      'disqualified', COALESCE((v_latest.score_result->>'disqualified')::BOOLEAN, false),
      'finalized_at', v_latest.finalized_at,
      'sdr_user_id', v_latest.sdr_user_id
    )
    WHERE id = COALESCE(NEW.card_id, OLD.card_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdr_qual_denormalize ON sdr_qualifications;
CREATE TRIGGER trg_sdr_qual_denormalize
  AFTER INSERT OR UPDATE OF status, card_id ON sdr_qualifications
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sdr_qual_denormalize_to_card();

-- 3.4 Vincular pontuação órfã quando card é criado (trigger em CARDS, não em ai_agent_*)
CREATE OR REPLACE FUNCTION trg_fn_sdr_qual_link_on_card_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contato_phone TEXT;
  v_qualification_id UUID;
BEGIN
  IF NEW.produto IS DISTINCT FROM 'WEDDING' THEN RETURN NEW; END IF;
  IF NEW.pessoa_principal_id IS NULL THEN RETURN NEW; END IF;

  SELECT telefone INTO v_contato_phone FROM contatos WHERE id = NEW.pessoa_principal_id;

  SELECT id INTO v_qualification_id
  FROM sdr_qualifications
  WHERE org_id = NEW.org_id
    AND card_id IS NULL
    AND (
      contato_id = NEW.pessoa_principal_id
      OR (v_contato_phone IS NOT NULL AND telefone_normalizado = sdr_normalize_phone(v_contato_phone))
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_qualification_id IS NOT NULL THEN
    UPDATE sdr_qualifications
    SET card_id = NEW.id,
        contato_id = COALESCE(contato_id, NEW.pessoa_principal_id),
        updated_at = NOW()
    WHERE id = v_qualification_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sdr_qual_link_on_card ON cards;
CREATE TRIGGER trg_sdr_qual_link_on_card
  AFTER INSERT ON cards
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sdr_qual_link_on_card_insert();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPCs (todas SECURITY DEFINER em namespace sdr_*)
-- ──────────────────────────────────────────────────────────────────────────

-- 4.0 compute_rules_version — hash MD5 das regras ativas (read-only)
CREATE OR REPLACE FUNCTION sdr_compute_rules_version(p_agent_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload TEXT;
BEGIN
  SELECT string_agg(
    id::TEXT || ':' || weight::TEXT || ':' || dimension || ':' ||
      condition_value::TEXT || ':' || ativa::TEXT,
    '|' ORDER BY id
  )
  INTO v_payload
  FROM ai_agent_scoring_rules
  WHERE agent_id = p_agent_id AND ativa = true;
  RETURN md5(COALESCE(v_payload, ''));
END;
$$;

-- 4.1 iniciar_pontuacao_sdr
CREATE OR REPLACE FUNCTION sdr_iniciar_pontuacao(
  p_agent_id UUID,
  p_contato_id UUID DEFAULT NULL,
  p_card_id UUID DEFAULT NULL,
  p_telefone TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_agent_org UUID;
  v_user_id UUID;
  v_id UUID;
  v_phone_norm TEXT;
  v_rules JSONB;
  v_config JSONB;
  v_rules_version TEXT;
  v_estela_score JSONB;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: requesting_org_id eh NULL';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: usuario nao autenticado';
  END IF;

  SELECT org_id INTO v_agent_org FROM ai_agents WHERE id = p_agent_id;
  IF v_agent_org IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: agent_id % nao existe', p_agent_id;
  END IF;
  IF v_agent_org != v_org_id THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: agent pertence a outra org';
  END IF;

  IF p_contato_id IS NULL AND p_card_id IS NULL AND p_telefone IS NULL THEN
    RAISE EXCEPTION 'sdr_iniciar_pontuacao: precisa ao menos um de contato_id, card_id ou telefone';
  END IF;

  v_phone_norm := sdr_normalize_phone(p_telefone);

  v_rules_version := sdr_compute_rules_version(p_agent_id);

  INSERT INTO sdr_qualifications (
    org_id, agent_id, rules_version, contato_id, card_id,
    telefone_normalizado, sdr_user_id, status
  ) VALUES (
    v_org_id, p_agent_id, v_rules_version, p_contato_id, p_card_id,
    v_phone_norm, v_user_id, 'rascunho'
  ) RETURNING id INTO v_id;

  -- Snapshot de regras (read-only de ai_agent_scoring_rules)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id, 'dimension', dimension, 'label', label,
      'rule_type', rule_type, 'condition_type', condition_type,
      'condition_value', condition_value, 'weight', weight,
      'exclusion_group', exclusion_group, 'ordem', ordem
    ) ORDER BY rule_type, ordem
  ) INTO v_rules
  FROM ai_agent_scoring_rules
  WHERE agent_id = p_agent_id AND ativa = true;

  SELECT jsonb_build_object(
    'enabled', enabled,
    'threshold_qualify', threshold_qualify,
    'max_sinal_bonus', max_sinal_bonus,
    'fallback_action', fallback_action
  ) INTO v_config
  FROM ai_agent_scoring_config
  WHERE agent_id = p_agent_id;

  -- Score Estela mais recente (se houver) — apenas pra contexto
  IF p_card_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'score', qualification_score_at_turn,
      'turn_at', created_at
    ) INTO v_estela_score
    FROM ai_conversation_turns
    WHERE agent_id = p_agent_id
      AND qualification_score_at_turn IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'rules', COALESCE(v_rules, '[]'::JSONB),
    'config', COALESCE(v_config, '{}'::JSONB),
    'rules_version', v_rules_version,
    'estela_score_recente', v_estela_score
  );
END;
$$;

-- 4.2 atualizar_pontuacao_sdr — chama calculate_agent_qualification_score (read-only)
CREATE OR REPLACE FUNCTION sdr_atualizar_pontuacao(
  p_id UUID,
  p_dados_lead JSONB DEFAULT NULL,
  p_scoring_inputs JSONB DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_score_result JSONB;
  v_new_inputs JSONB;
  v_new_dados JSONB;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: requesting_org_id NULL';
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: pontuacao % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status != 'rascunho' THEN
    RAISE EXCEPTION 'sdr_atualizar_pontuacao: pontuacao ja % (so rascunho pode ser editado)', v_qual.status;
  END IF;

  v_new_inputs := COALESCE(p_scoring_inputs, v_qual.scoring_inputs);
  v_new_dados := COALESCE(p_dados_lead, v_qual.dados_lead);

  v_score_result := calculate_agent_qualification_score(v_qual.agent_id, v_new_inputs);

  UPDATE sdr_qualifications
  SET scoring_inputs = v_new_inputs,
      dados_lead = v_new_dados,
      score_result = v_score_result,
      notas = COALESCE(p_notas, notas),
      updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'id', p_id,
    'score_result', v_score_result,
    'scoring_inputs', v_new_inputs,
    'dados_lead', v_new_dados
  );
END;
$$;

-- 4.3 finalizar_pontuacao_sdr
CREATE OR REPLACE FUNCTION sdr_finalizar_pontuacao(
  p_id UUID,
  p_notas TEXT DEFAULT NULL,
  p_merge_strategy TEXT DEFAULT 'preserve'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_card RECORD;
  v_new_produto_data JSONB;
  v_dados JSONB;
  v_key TEXT;
  v_value JSONB;
  v_should_write BOOLEAN;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: requesting_org_id NULL';
  END IF;

  IF p_merge_strategy NOT IN ('preserve', 'overwrite', 'update_if_newer') THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: merge_strategy invalido: %', p_merge_strategy;
  END IF;

  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: pontuacao % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status != 'rascunho' THEN
    RAISE EXCEPTION 'sdr_finalizar_pontuacao: pontuacao ja %', v_qual.status;
  END IF;

  UPDATE sdr_qualifications
  SET status = 'finalizado',
      finalized_at = NOW(),
      notas = COALESCE(p_notas, notas),
      rules_version = sdr_compute_rules_version(agent_id)
  WHERE id = p_id;

  -- Copia dados_lead pra cards.produto_data conforme merge_strategy
  IF v_qual.card_id IS NOT NULL AND v_qual.dados_lead != '{}'::JSONB THEN
    SELECT id, produto_data FROM cards WHERE id = v_qual.card_id INTO v_card;
    v_new_produto_data := COALESCE(v_card.produto_data, '{}'::JSONB);
    v_dados := v_qual.dados_lead;

    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_dados) LOOP
      v_should_write := false;

      IF p_merge_strategy = 'overwrite' THEN
        v_should_write := true;
      ELSIF p_merge_strategy = 'preserve' THEN
        v_should_write := (v_new_produto_data->v_key IS NULL OR v_new_produto_data->>v_key = '' OR v_new_produto_data->>v_key = 'null');
      ELSIF p_merge_strategy = 'update_if_newer' THEN
        v_should_write := true;
      END IF;

      IF v_should_write THEN
        v_new_produto_data := jsonb_set(v_new_produto_data, ARRAY[v_key], v_value);
      END IF;
    END LOOP;

    UPDATE cards SET produto_data = v_new_produto_data, updated_at = NOW()
    WHERE id = v_qual.card_id;
  END IF;

  -- Webhook via outbox (apenas se outbox existe)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integration_outbox') THEN
    BEGIN
      INSERT INTO integration_outbox (
        topic, payload, status, created_at
      ) VALUES (
        'sdr_qualification.finalized',
        jsonb_build_object(
          'qualification_id', p_id,
          'org_id', v_qual.org_id,
          'card_id', v_qual.card_id,
          'contato_id', v_qual.contato_id,
          'agent_id', v_qual.agent_id,
          'score_result', (SELECT score_result FROM sdr_qualifications WHERE id = p_id),
          'sdr_user_id', v_qual.sdr_user_id,
          'finalized_at', NOW()
        ),
        'pending',
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Outbox pode ter schema diferente do esperado; não falhar finalize por isso
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'status', 'finalizado',
    'score_result', (SELECT score_result FROM sdr_qualifications WHERE id = p_id)
  );
END;
$$;

-- 4.4 reabrir_pontuacao_sdr — cria nova versão
CREATE OR REPLACE FUNCTION sdr_reabrir_pontuacao(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_parent RECORD;
  v_new_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'sdr_reabrir_pontuacao: nao autenticado';
  END IF;

  SELECT * INTO v_parent FROM sdr_qualifications WHERE id = p_id;
  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'sdr_reabrir_pontuacao: pontuacao % nao existe', p_id;
  END IF;
  IF v_parent.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_reabrir_pontuacao: cross-org violation';
  END IF;
  IF v_parent.status != 'finalizado' THEN
    RAISE EXCEPTION 'sdr_reabrir_pontuacao: so pontuacoes finalizadas podem ser reabertas';
  END IF;

  INSERT INTO sdr_qualifications (
    org_id, agent_id, rules_version, contato_id, card_id,
    telefone_normalizado, status, dados_lead, scoring_inputs, score_result,
    sdr_user_id, notas, version, parent_qualification_id
  ) VALUES (
    v_parent.org_id, v_parent.agent_id, sdr_compute_rules_version(v_parent.agent_id),
    v_parent.contato_id, v_parent.card_id, v_parent.telefone_normalizado,
    'rascunho', v_parent.dados_lead, v_parent.scoring_inputs, v_parent.score_result,
    v_user_id, v_parent.notas, v_parent.version + 1, v_parent.id
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id, 'version', v_parent.version + 1);
END;
$$;

-- 4.5 descartar_pontuacao_sdr — soft delete
CREATE OR REPLACE FUNCTION sdr_descartar_pontuacao(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
BEGIN
  v_org_id := requesting_org_id();
  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_descartar_pontuacao: % nao existe', p_id;
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_descartar_pontuacao: cross-org violation';
  END IF;
  IF v_qual.status != 'rascunho' THEN
    RAISE EXCEPTION 'sdr_descartar_pontuacao: so rascunhos podem ser descartados';
  END IF;

  UPDATE sdr_qualifications SET status = 'descartado', updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'descartado');
END;
$$;

-- 4.6 vincular_pontuacao_a_card
CREATE OR REPLACE FUNCTION sdr_vincular_a_card(
  p_qualification_id UUID,
  p_card_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_card_org UUID;
BEGIN
  v_org_id := requesting_org_id();
  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_qualification_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_vincular_a_card: pontuacao nao existe';
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_vincular_a_card: cross-org violation';
  END IF;

  SELECT org_id INTO v_card_org FROM cards WHERE id = p_card_id;
  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'sdr_vincular_a_card: card nao existe';
  END IF;
  IF v_card_org != v_org_id THEN
    RAISE EXCEPTION 'sdr_vincular_a_card: card pertence a outra org';
  END IF;

  UPDATE sdr_qualifications SET card_id = p_card_id, updated_at = NOW()
  WHERE id = p_qualification_id;

  RETURN jsonb_build_object('id', p_qualification_id, 'card_id', p_card_id);
END;
$$;

-- 4.7 listar_pontuacoes_sdr — pra página de gestão
CREATE OR REPLACE FUNCTION sdr_listar_pontuacoes(
  p_filtros JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_only_mine BOOLEAN;
  v_result JSONB;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_sdr_filter UUID;
  v_status_filter TEXT;
  v_qualificado_filter BOOLEAN;
  v_produto_filter TEXT;
BEGIN
  v_org_id := requesting_org_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'sdr_listar_pontuacoes: nao autenticado';
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  v_only_mine := COALESCE((p_filtros->>'only_mine')::BOOLEAN, NOT COALESCE(v_is_admin, false));

  v_from := (p_filtros->>'from')::TIMESTAMPTZ;
  v_to := (p_filtros->>'to')::TIMESTAMPTZ;
  v_sdr_filter := (p_filtros->>'sdr_user_id')::UUID;
  v_status_filter := p_filtros->>'status';
  v_qualificado_filter := (p_filtros->>'qualificado')::BOOLEAN;
  v_produto_filter := COALESCE(p_filtros->>'produto', 'WEDDING');

  WITH base AS (
    SELECT q.*, c.produto AS card_produto,
           c.titulo AS card_titulo,
           p.nome AS sdr_nome
    FROM sdr_qualifications q
    LEFT JOIN cards c ON c.id = q.card_id
    LEFT JOIN profiles p ON p.id = q.sdr_user_id
    WHERE q.org_id = v_org_id
      AND (q.card_id IS NULL OR c.produto::TEXT = v_produto_filter)
      AND (v_only_mine = false OR q.sdr_user_id = v_user_id)
      AND (v_from IS NULL OR q.created_at >= v_from)
      AND (v_to IS NULL OR q.created_at <= v_to)
      AND (v_sdr_filter IS NULL OR q.sdr_user_id = v_sdr_filter)
      AND (v_status_filter IS NULL OR q.status = v_status_filter)
      AND (v_qualificado_filter IS NULL OR
           (q.score_result->>'qualificado')::BOOLEAN = v_qualificado_filter)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM base),
    'qualificados', (SELECT COUNT(*) FROM base WHERE (score_result->>'qualificado')::BOOLEAN = true),
    'descartados', (SELECT COUNT(*) FROM base WHERE status = 'descartado'),
    'rascunhos', (SELECT COUNT(*) FROM base WHERE status = 'rascunho'),
    'score_medio', (SELECT ROUND(AVG((score_result->>'score')::NUMERIC), 1) FROM base WHERE status = 'finalizado'),
    'pontuacoes', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'card_id', card_id,
          'card_titulo', card_titulo,
          'contato_id', contato_id,
          'telefone', telefone_normalizado,
          'status', status,
          'version', version,
          'dados_lead', dados_lead,
          'scoring_inputs', scoring_inputs,
          'score_result', score_result,
          'rules_version', rules_version,
          'sdr_user_id', sdr_user_id,
          'sdr_nome', sdr_nome,
          'notas', notas,
          'finalized_at', finalized_at,
          'created_at', created_at
        ) ORDER BY created_at DESC
      )
      FROM (SELECT * FROM base ORDER BY created_at DESC LIMIT 500) sub
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4.8 obter_pontuacao — busca uma pontuação específica + histórico de versões
CREATE OR REPLACE FUNCTION sdr_obter_pontuacao(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_qual RECORD;
  v_versoes JSONB;
  v_rules_version_atual TEXT;
BEGIN
  v_org_id := requesting_org_id();
  SELECT * INTO v_qual FROM sdr_qualifications WHERE id = p_id;
  IF v_qual.id IS NULL THEN
    RAISE EXCEPTION 'sdr_obter_pontuacao: nao existe';
  END IF;
  IF v_qual.org_id != v_org_id THEN
    RAISE EXCEPTION 'sdr_obter_pontuacao: cross-org violation';
  END IF;

  -- Coleta versões anteriores (segue cadeia parent_qualification_id)
  WITH RECURSIVE chain AS (
    SELECT id, version, status, score_result, created_at, finalized_at, parent_qualification_id, sdr_user_id
    FROM sdr_qualifications WHERE id = p_id
    UNION ALL
    SELECT q.id, q.version, q.status, q.score_result, q.created_at, q.finalized_at, q.parent_qualification_id, q.sdr_user_id
    FROM sdr_qualifications q
    INNER JOIN chain c ON c.parent_qualification_id = q.id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'version', version, 'status', status,
    'score', (score_result->>'score')::NUMERIC,
    'qualificado', (score_result->>'qualificado')::BOOLEAN,
    'finalized_at', finalized_at,
    'sdr_user_id', sdr_user_id
  ) ORDER BY version DESC) INTO v_versoes FROM chain;

  v_rules_version_atual := sdr_compute_rules_version(v_qual.agent_id);

  RETURN jsonb_build_object(
    'pontuacao', row_to_json(v_qual.*),
    'historico_versoes', COALESCE(v_versoes, '[]'::JSONB),
    'rules_version_atual', v_rules_version_atual,
    'score_outdated', v_qual.rules_version IS DISTINCT FROM v_rules_version_atual
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Smoke test inline
-- ──────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_orphans INT;
  v_cross_org_contato INT;
  v_cross_org_card INT;
  v_bad_phone INT;
BEGIN
  SELECT COUNT(*) INTO v_orphans
  FROM sdr_qualifications
  WHERE contato_id IS NULL AND card_id IS NULL AND telefone_normalizado IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Smoke test FAIL: % linhas em sdr_qualifications sem ancora', v_orphans;
  END IF;

  SELECT COUNT(*) INTO v_cross_org_contato
  FROM sdr_qualifications q JOIN contatos c ON c.id = q.contato_id
  WHERE c.org_id != q.org_id;
  IF v_cross_org_contato > 0 THEN
    RAISE EXCEPTION 'Smoke test FAIL: % linhas com cross-org contato', v_cross_org_contato;
  END IF;

  SELECT COUNT(*) INTO v_cross_org_card
  FROM sdr_qualifications q JOIN cards c ON c.id = q.card_id
  WHERE c.org_id != q.org_id;
  IF v_cross_org_card > 0 THEN
    RAISE EXCEPTION 'Smoke test FAIL: % linhas com cross-org card', v_cross_org_card;
  END IF;

  SELECT COUNT(*) INTO v_bad_phone
  FROM sdr_qualifications
  WHERE telefone_normalizado IS NOT NULL
    AND telefone_normalizado !~ '^\d{12,13}$';
  IF v_bad_phone > 0 THEN
    RAISE EXCEPTION 'Smoke test FAIL: % linhas com telefone fora do padrao', v_bad_phone;
  END IF;

  RAISE NOTICE 'sdr_qualifications: schema e triggers OK';
END $$;

-- ============================================================================
-- FIM da migration. Próximo passo: aplicar em STAGING via apply-to-staging.sh
-- ============================================================================
