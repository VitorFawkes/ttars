-- ============================================================================
-- Sofia/wsdr — Whitelist de números (config-driven, igual Patricia) + reset
-- ----------------------------------------------------------------------------
-- Objetivo: tirar o número de teste do HARDCODE (estava em 4 lugares) e deixar
-- o admin gerenciar pela tela QUAIS números a Sofia responde, além de um
-- "zerar conversa pra começar do zero".
--
-- DIFERENÇA DE SEGURANÇA vs Patricia (DELIBERADA): na Patricia, lista VAZIA =
-- responde TODO MUNDO (o webhook trata length===0 como passthrough), o que
-- contradiz o texto da tela e é uma armadilha. Aqui, lista vazia = NÃO responde
-- NINGUÉM. O webhook (whatsapp-webhook) implementa essa semântica segura.
--
-- 1) coluna wsdr_agents.test_mode_phone_whitelist (TEXT[]) — espelha ai_agents
-- 2) seed: número do Vitor pra Sofia (comportamento NÃO muda no deploy)
-- 3) wsdr_ensure_contact() — acha/cria contato (reusa a lógica testada do
--    wsdr_persist_lead, SEM criar card) p/ o webhook entregar a resposta a
--    qualquer número whitelistado novo
-- 4) wsdr_reset_conversation_by_phone() — apaga memória de conversa + buffer
--    de um número (Sofia "começa do zero"); org-safe via requesting_org_id()
-- 5) limpa a rota inerte ('11964293533' como phone_line) — confundia leitura
-- ============================================================================

-- 1) coluna de whitelist (mesma semântica que ai_agents.test_mode_phone_whitelist)
ALTER TABLE wsdr_agents
  ADD COLUMN IF NOT EXISTS test_mode_phone_whitelist TEXT[] DEFAULT NULL;
COMMENT ON COLUMN wsdr_agents.test_mode_phone_whitelist IS
  'Números (só dígitos, com ou sem DDI 55) que o agente responde. VAZIO/NULL = não responde ninguém (fail-safe). Editado na tela da Sofia.';

-- 2) seed: mantém a Sofia travada no número do Vitor (comportamento inalterado)
UPDATE wsdr_agents
   SET test_mode_phone_whitelist = ARRAY['11964293533']
 WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
   AND slug = 'sofia-weddings'
   AND test_mode_phone_whitelist IS NULL;

-- 3) acha/cria contato (org-scoped), SEM card — pro webhook entregar a resposta.
--    Espelha os passos 2-3 do wsdr_persist_lead (lógica já testada em prod).
CREATE OR REPLACE FUNCTION wsdr_ensure_contact(
  p_org_id UUID,
  p_phone TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone       TEXT;
  v_contact_id  UUID;
  v_nome        TEXT;
  v_sobrenome   TEXT;
  v_name_parts  TEXT[];
BEGIN
  v_phone := normalize_phone_brazil(regexp_replace(COALESCE(p_phone,''), '\D', '', 'g'));
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_contact_id FROM contatos
   WHERE org_id = p_org_id
     AND normalize_phone_brazil(regexp_replace(COALESCE(telefone,''),'\D','','g')) = v_phone
   LIMIT 1;
  IF v_contact_id IS NULL THEN
    SELECT contato_id INTO v_contact_id FROM contato_meios
     WHERE org_id = p_org_id AND tipo = 'telefone'
       AND normalize_phone_brazil(regexp_replace(COALESCE(valor,''),'\D','','g')) = v_phone
     LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN
    -- trigger check_contato_required_fields exige sobrenome
    v_name_parts := regexp_split_to_array(trim(COALESCE(NULLIF(trim(p_name),''), 'Casal')), '\s+');
    v_nome := v_name_parts[1];
    v_sobrenome := CASE WHEN array_length(v_name_parts,1) > 1
                        THEN array_to_string(v_name_parts[2:], ' ')
                        ELSE '(casal)' END;
    INSERT INTO contatos (org_id, nome, sobrenome, telefone)
    VALUES (p_org_id, v_nome, v_sobrenome, v_phone)
    RETURNING id INTO v_contact_id;
  END IF;

  RETURN v_contact_id;
END $$;
COMMENT ON FUNCTION wsdr_ensure_contact IS
  'Acha/cria contato (Weddings) por telefone, sem card. Usado pelo webhook p/ entregar a resposta da Sofia a número whitelistado. Org-safe, sem JWT.';
GRANT EXECUTE ON FUNCTION wsdr_ensure_contact(UUID, TEXT, TEXT) TO service_role, authenticated;

-- 4) "começar do zero" COMPLETO de um número (paridade com Patricia,
--    reset_agent_conversations_with_phone). Apaga TUDO que faria a Sofia
--    "lembrar": memória consolidada + buffer + histórico bruto (whatsapp_messages,
--    de onde o webhook monta o contexto) + dados do card (resumo/contexto/produto_data
--    /pause) + anonimiza o contato (nome vazio = ela pergunta de novo).
--    Org: UI autenticada usa requesting_org_id(); o webhook (comando /reset, sem JWT)
--    passa p_org_id. Bloqueia cross-org quando autenticado.
DROP FUNCTION IF EXISTS wsdr_reset_conversation_by_phone(TEXT, TEXT);
DROP FUNCTION IF EXISTS wsdr_reset_conversation_by_phone(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION wsdr_reset_conversation_by_phone(
  p_agent_slug TEXT,
  p_phone TEXT,
  p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_org          UUID := requesting_org_id();
  v_org              UUID;
  v_noddi            TEXT;
  v_contact_ids      UUID[];
  v_state_deleted    INT := 0;
  v_buffer_deleted   INT := 0;
  v_msgs_deleted     INT := 0;
  v_cards_cleared    INT := 0;
  v_contacts_cleared INT := 0;
BEGIN
  -- org: autenticado (UI) manda pelo JWT; service_role (webhook /reset) passa p_org_id
  v_org := COALESCE(v_jwt_org, p_org_id);
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sem org no contexto');
  END IF;
  IF v_jwt_org IS NOT NULL AND p_org_id IS NOT NULL AND p_org_id <> v_jwt_org THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cross-org bloqueado');
  END IF;

  -- forma local (sem DDI 55) pra casar com qualquer formato gravado
  v_noddi := regexp_replace(regexp_replace(COALESCE(p_phone,''), '\D', '', 'g'), '^55', '');
  IF length(v_noddi) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'telefone curto');
  END IF;

  -- memória consolidada + buffer da Sofia (por telefone, na org)
  DELETE FROM wsdr_conversation_state
   WHERE org_id = v_org AND agent_slug = p_agent_slug
     AND regexp_replace(contact_phone,'\D','','g') LIKE '%' || v_noddi;
  GET DIAGNOSTICS v_state_deleted = ROW_COUNT;

  DELETE FROM wsdr_message_buffer
   WHERE org_id = v_org AND agent_slug = p_agent_slug
     AND regexp_replace(contact_phone,'\D','','g') LIKE '%' || v_noddi;
  GET DIAGNOSTICS v_buffer_deleted = ROW_COUNT;

  -- contato(s) do telefone na org
  SELECT ARRAY_AGG(DISTINCT id) INTO v_contact_ids
    FROM contatos
   WHERE org_id = v_org
     AND regexp_replace(COALESCE(telefone,''),'\D','','g') LIKE '%' || v_noddi;

  IF v_contact_ids IS NOT NULL AND array_length(v_contact_ids,1) > 0 THEN
    -- histórico bruto: o webhook monta o contexto da Sofia a partir do whatsapp_messages
    DELETE FROM whatsapp_messages WHERE contact_id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_msgs_deleted = ROW_COUNT;

    -- cards Weddings do contato: limpa memória IA + dados coletados + destrava handoff
    UPDATE cards
       SET ai_resumo = NULL, ai_contexto = NULL, produto_data = '{}'::jsonb,
           ai_pause_config = NULL, updated_at = NOW()
     WHERE pessoa_principal_id = ANY(v_contact_ids) AND org_id = v_org;
    GET DIAGNOSTICS v_cards_cleared = ROW_COUNT;

    -- contato: anonimiza (nome vazio → Sofia trata como desconhecido e pergunta de novo)
    UPDATE contatos
       SET nome = '', email = NULL, cpf = NULL, passaporte = NULL,
           data_nascimento = NULL, updated_at = NOW()
     WHERE id = ANY(v_contact_ids);
    GET DIAGNOSTICS v_contacts_cleared = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'state_deleted', v_state_deleted, 'buffer_deleted', v_buffer_deleted,
    'messages_deleted', v_msgs_deleted, 'cards_cleared', v_cards_cleared,
    'contacts_cleared', v_contacts_cleared);
END $$;
COMMENT ON FUNCTION wsdr_reset_conversation_by_phone IS
  'Começa do zero COMPLETO de um número (paridade Patricia): apaga wsdr_conversation_state + wsdr_message_buffer + whatsapp_messages + zera card (resumo/contexto/produto_data/pause) + anonimiza contato. UI usa JWT; webhook /reset passa p_org_id. Bloqueia cross-org.';
GRANT EXECUTE ON FUNCTION wsdr_reset_conversation_by_phone(TEXT, TEXT, UUID) TO authenticated, service_role;

-- 5) rota inerte: '11964293533' como phone_line nunca casa (webhook resolve por
--    phone_number_id da linha). Era seed antigo do hardcode — remove p/ clareza.
DELETE FROM wsdr_phone_line_routing
 WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
   AND phone_line = '11964293533';
