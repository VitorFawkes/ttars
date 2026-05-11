-- Consolida contatos históricos no pool único da org-mãe (Welcome Group).
-- Move contatos de orgs filhas (Trips/Weddings/Courses) para Group.
-- Mescla duplicados cross-org por match forte (monde_person_id, cpf, email, telefone).
-- Mantém todas as FKs (cards_contatos, whatsapp_*, etc.) apontando para o vencedor.
-- Soft-delete do perdedor. Idempotente.

BEGIN;

-- Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.contact_consolidation_audit (
  id                    BIGSERIAL PRIMARY KEY,
  batch                 TEXT NOT NULL DEFAULT 'consolidate_2026_04_13',
  operation             TEXT NOT NULL CHECK (operation IN ('merge','move_org')),
  loser_id              UUID,
  winner_id             UUID NOT NULL,
  loser_org_id_before   UUID,
  winner_org_id_before  UUID,
  match_reason          TEXT,
  loser_snapshot        JSONB,
  refs_updated          JSONB DEFAULT '{}'::jsonb,
  meios_merged          INT DEFAULT 0,
  meios_skipped_dup     INT DEFAULT 0,
  planned_at            TIMESTAMPTZ DEFAULT now(),
  executed_at           TIMESTAMPTZ,
  error                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_cca_batch_pending
  ON public.contact_consolidation_audit(batch) WHERE executed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cca_batch_loser
  ON public.contact_consolidation_audit(batch, loser_id) WHERE loser_id IS NOT NULL;

-- Planner: popula audit com operações pendentes (idempotente)
CREATE OR REPLACE FUNCTION public.consolidate_contacts_plan(
  p_batch TEXT DEFAULT 'consolidate_2026_04_13',
  p_parent_org UUID DEFAULT 'a0000000-0000-0000-0000-000000000001'::uuid
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $fn$
DECLARE
  v_merge_count INT := 0;
  v_move_count  INT := 0;
BEGIN
  DELETE FROM public.contact_consolidation_audit
   WHERE batch = p_batch AND executed_at IS NULL;

  WITH losers AS (
    SELECT * FROM public.contatos
     WHERE deleted_at IS NULL AND org_id <> p_parent_org
       AND EXISTS (SELECT 1 FROM public.organizations o
                    WHERE o.id = contatos.org_id AND o.parent_org_id = p_parent_org)
  ),
  winners_pool AS (
    SELECT id, nome, email, cpf_normalizado, telefone_normalizado, monde_person_id,
           data_nascimento, sobrenome, telefone, cpf, created_at,
           (CASE WHEN monde_person_id IS NOT NULL THEN 100 ELSE 0 END
            + CASE WHEN email IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN telefone IS NOT NULL THEN 10 ELSE 0 END
            + CASE WHEN cpf_normalizado IS NOT NULL THEN 20 ELSE 0 END
            + CASE WHEN data_nascimento IS NOT NULL THEN 5 ELSE 0 END
            + CASE WHEN sobrenome IS NOT NULL THEN 3 ELSE 0 END) AS completeness
    FROM public.contatos
     WHERE deleted_at IS NULL AND org_id = p_parent_org
  ),
  candidates AS (
    SELECT l.id AS loser_id, w.id AS winner_id, 'monde_person_id' AS reason, 1 AS tier,
           w.completeness, w.created_at AS w_created
      FROM losers l JOIN winners_pool w ON w.monde_person_id = l.monde_person_id
     WHERE l.monde_person_id IS NOT NULL
    UNION ALL
    SELECT l.id, w.id, 'cpf', 2, w.completeness, w.created_at
      FROM losers l JOIN winners_pool w ON w.cpf_normalizado = l.cpf_normalizado
     WHERE l.cpf_normalizado IS NOT NULL
    UNION ALL
    SELECT l.id, w.id, 'email', 3, w.completeness, w.created_at
      FROM losers l JOIN winners_pool w ON LOWER(w.email) = LOWER(l.email)
     WHERE l.email IS NOT NULL AND BTRIM(l.email) <> ''
    UNION ALL
    SELECT l.id, w.id, 'telefone', 4, w.completeness, w.created_at
      FROM losers l JOIN winners_pool w ON w.telefone_normalizado = l.telefone_normalizado
     WHERE l.telefone_normalizado IS NOT NULL AND BTRIM(l.telefone_normalizado) <> ''
  ),
  ranked AS (
    SELECT DISTINCT ON (loser_id) loser_id, winner_id, reason
    FROM candidates
    ORDER BY loser_id, tier ASC, completeness DESC, w_created ASC, winner_id ASC
  )
  INSERT INTO public.contact_consolidation_audit
    (batch, operation, loser_id, winner_id, loser_org_id_before, winner_org_id_before,
     match_reason, loser_snapshot)
  SELECT p_batch, 'merge', r.loser_id, r.winner_id, l.org_id, w.org_id,
         r.reason, to_jsonb(l.*)
    FROM ranked r
    JOIN public.contatos l ON l.id = r.loser_id
    JOIN public.contatos w ON w.id = r.winner_id
   WHERE l.id <> w.id;
  GET DIAGNOSTICS v_merge_count = ROW_COUNT;

  INSERT INTO public.contact_consolidation_audit
    (batch, operation, loser_id, winner_id, loser_org_id_before, winner_org_id_before,
     match_reason, loser_snapshot)
  SELECT p_batch, 'move_org', NULL, c.id, c.org_id, p_parent_org,
         'no_match_move_to_parent', to_jsonb(c.*)
    FROM public.contatos c
    JOIN public.organizations o ON o.id = c.org_id
   WHERE c.deleted_at IS NULL AND c.org_id <> p_parent_org
     AND o.parent_org_id = p_parent_org
     AND NOT EXISTS (
       SELECT 1 FROM public.contact_consolidation_audit a
        WHERE a.batch = p_batch AND a.operation = 'merge' AND a.loser_id = c.id
     );
  GET DIAGNOSTICS v_move_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'batch', p_batch,
    'merge_pairs_planned', v_merge_count,
    'move_org_planned', v_move_count,
    'total_planned', v_merge_count + v_move_count
  );
END;
$fn$;

-- Merge de 1 par: redireciona FKs, mescla contato_meios, enriquece winner, soft-delete loser
CREATE OR REPLACE FUNCTION public._consolidate_merge_one(p_audit_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $fn$
DECLARE
  v_loser_id UUID; v_winner_id UUID;
  v_loser public.contatos%ROWTYPE; v_winner public.contatos%ROWTYPE;
  v_refs JSONB := '{}'::jsonb; v_n INT;
  v_meios_merged INT := 0; v_meios_dup INT := 0;
BEGIN
  SELECT loser_id, winner_id INTO v_loser_id, v_winner_id
    FROM public.contact_consolidation_audit WHERE id = p_audit_id;
  SELECT * INTO v_loser  FROM public.contatos WHERE id = v_loser_id;
  SELECT * INTO v_winner FROM public.contatos WHERE id = v_winner_id;
  IF v_loser.id IS NULL OR v_winner.id IS NULL THEN
    RAISE EXCEPTION 'merge_one: loser ou winner não existe (loser=%, winner=%)', v_loser_id, v_winner_id;
  END IF;

  UPDATE public.cards SET pessoa_principal_id = v_winner_id WHERE pessoa_principal_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('cards_pessoa_principal_id', v_n);
  UPDATE public.cards SET indicado_por_id = v_winner_id WHERE indicado_por_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('cards_indicado_por_id', v_n);

  -- Remove cards_contatos do loser para cards onde winner já é pessoa_principal
  -- (evita colisão com enforce_single_role_cards_contatos)
  DELETE FROM public.cards_contatos cc
   WHERE cc.contato_id = v_loser_id
     AND EXISTS (SELECT 1 FROM public.cards c WHERE c.id = cc.card_id AND c.pessoa_principal_id = v_winner_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('cards_contatos_pre_removed_main', v_n);

  UPDATE public.cards_contatos SET contato_id = v_winner_id
    WHERE contato_id = v_loser_id
      AND NOT EXISTS (
        SELECT 1 FROM public.cards_contatos cc2
         WHERE cc2.contato_id = v_winner_id AND cc2.card_id = cards_contatos.card_id
      );
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('cards_contatos', v_n);
  DELETE FROM public.cards_contatos WHERE contato_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('cards_contatos_deleted_dup', v_n);

  UPDATE public.card_document_requirements SET contato_id = v_winner_id WHERE contato_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('card_document_requirements', v_n);
  UPDATE public.card_gift_assignments SET contato_id = v_winner_id WHERE contato_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('card_gift_assignments', v_n);
  UPDATE public.ai_conversations SET contact_id = v_winner_id WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('ai_conversations', v_n);
  UPDATE public.reactivation_patterns SET contact_id = v_winner_id WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('reactivation_patterns', v_n);

  -- whatsapp_conversations: respeita UNIQUE (contact_id, instance_id) e (contact_id, platform_id)
  UPDATE public.whatsapp_conversations wc SET contact_id = v_winner_id
    WHERE wc.contact_id = v_loser_id
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_conversations wc2
         WHERE wc2.contact_id = v_winner_id AND wc2.instance_id IS NOT DISTINCT FROM wc.instance_id)
      AND (wc.platform_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.whatsapp_conversations wc3
         WHERE wc3.contact_id = v_winner_id AND wc3.platform_id = wc.platform_id));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('whatsapp_conversations', v_n);
  UPDATE public.whatsapp_conversations SET contact_id = NULL WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('whatsapp_conversations_set_null', v_n);

  UPDATE public.whatsapp_groups SET contact_id = v_winner_id WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('whatsapp_groups', v_n);
  UPDATE public.whatsapp_messages SET contact_id = v_winner_id WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('whatsapp_messages', v_n);
  UPDATE public.whatsapp_raw_events SET contact_id = v_winner_id WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('whatsapp_raw_events', v_n);
  UPDATE public.monde_people_queue SET contato_id = v_winner_id WHERE contato_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('monde_people_queue', v_n);

  UPDATE public.contact_stats SET contact_id = v_winner_id
    WHERE contact_id = v_loser_id
      AND NOT EXISTS (SELECT 1 FROM public.contact_stats s2 WHERE s2.contact_id = v_winner_id);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contact_stats', v_n);
  DELETE FROM public.contact_stats WHERE contact_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contact_stats_deleted_dup', v_n);

  UPDATE public.contatos SET responsavel_id = v_winner_id WHERE responsavel_id = v_loser_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_refs := v_refs || jsonb_build_object('contatos_responsavel_id', v_n);

  UPDATE public.contato_meios cm
     SET contato_id = v_winner_id, org_id = v_winner.org_id
   WHERE cm.contato_id = v_loser_id
     AND (cm.valor_normalizado IS NULL
          OR NOT EXISTS (
               SELECT 1 FROM public.contato_meios cm2
                WHERE cm2.contato_id = v_winner_id
                  AND cm2.tipo = cm.tipo
                  AND cm2.valor_normalizado = cm.valor_normalizado));
  GET DIAGNOSTICS v_meios_merged = ROW_COUNT;
  DELETE FROM public.contato_meios WHERE contato_id = v_loser_id;
  GET DIAGNOSTICS v_meios_dup = ROW_COUNT;

  -- Soft-delete loser ANTES do enrich (libera índice monde_person_id global)
  UPDATE public.contatos
     SET deleted_at = now(), monde_person_id = NULL,
         observacoes = COALESCE(observacoes,'') || E'\n[consolidated into ' || v_winner_id::text || ']',
         updated_at = now()
   WHERE id = v_loser_id;

  UPDATE public.contatos w SET
    monde_person_id = COALESCE(w.monde_person_id, v_loser.monde_person_id),
    cpf             = COALESCE(w.cpf, v_loser.cpf),
    email           = COALESCE(w.email, v_loser.email),
    telefone        = COALESCE(w.telefone, v_loser.telefone),
    data_nascimento = COALESCE(w.data_nascimento, v_loser.data_nascimento),
    sobrenome       = COALESCE(w.sobrenome, v_loser.sobrenome),
    passaporte      = COALESCE(w.passaporte, v_loser.passaporte),
    passaporte_validade = COALESCE(w.passaporte_validade, v_loser.passaporte_validade),
    rg              = COALESCE(w.rg, v_loser.rg),
    sexo            = COALESCE(w.sexo, v_loser.sexo),
    endereco        = COALESCE(w.endereco, v_loser.endereco),
    primeira_venda_data = LEAST(COALESCE(w.primeira_venda_data, v_loser.primeira_venda_data),
                                COALESCE(v_loser.primeira_venda_data, w.primeira_venda_data)),
    ultima_venda_data   = GREATEST(COALESCE(w.ultima_venda_data, v_loser.ultima_venda_data),
                                   COALESCE(v_loser.ultima_venda_data, w.ultima_venda_data)),
    ultimo_retorno_data = GREATEST(COALESCE(w.ultimo_retorno_data, v_loser.ultimo_retorno_data),
                                   COALESCE(v_loser.ultimo_retorno_data, w.ultimo_retorno_data)),
    observacoes = CASE
      WHEN v_loser.observacoes IS NOT NULL AND w.observacoes IS DISTINCT FROM v_loser.observacoes
        THEN COALESCE(w.observacoes, '') ||
             CASE WHEN w.observacoes IS NOT NULL AND BTRIM(w.observacoes)<>''
                  THEN E'\n\n--- merged from ' || v_loser.id || E' ---\n' ELSE '' END ||
             v_loser.observacoes
      ELSE w.observacoes END,
    tags = ARRAY(SELECT DISTINCT unnest(COALESCE(w.tags,'{}'::text[]) || COALESCE(v_loser.tags,'{}'::text[]))),
    updated_at = now()
  WHERE w.id = v_winner_id;

  UPDATE public.contact_consolidation_audit
     SET refs_updated = v_refs, meios_merged = v_meios_merged,
         meios_skipped_dup = v_meios_dup, executed_at = now(), error = NULL
   WHERE id = p_audit_id;

  RETURN jsonb_build_object('audit_id', p_audit_id, 'loser_id', v_loser_id,
                            'winner_id', v_winner_id, 'refs', v_refs);
END;
$fn$;

-- Move 1 contato para org-mãe
CREATE OR REPLACE FUNCTION public._consolidate_move_one(p_audit_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $fn$
DECLARE v_winner_id UUID; v_parent UUID;
BEGIN
  SELECT winner_id, winner_org_id_before INTO v_winner_id, v_parent
    FROM public.contact_consolidation_audit WHERE id = p_audit_id;
  UPDATE public.contatos      SET org_id = v_parent, updated_at = now() WHERE id = v_winner_id;
  UPDATE public.contato_meios SET org_id = v_parent                     WHERE contato_id = v_winner_id;
  UPDATE public.contact_consolidation_audit
     SET executed_at = now(), refs_updated = jsonb_build_object('org_id_updated', 1)
   WHERE id = p_audit_id;
END;
$fn$;

-- Orquestrador: desabilita triggers de efeito colateral, processa, religa
CREATE OR REPLACE FUNCTION public.consolidate_contacts_execute(
  p_batch TEXT DEFAULT 'consolidate_2026_04_13',
  p_limit INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $fn$
DECLARE
  v_prev_setting TEXT; v_row RECORD;
  v_done_merge INT := 0; v_done_move INT := 0;
  v_errors INT := 0; v_err_msg TEXT;
BEGIN
  SELECT value INTO v_prev_setting FROM public.integration_settings
   WHERE key = 'MONDE_V2_SYNC_ENABLED' LIMIT 1;
  UPDATE public.integration_settings SET value = 'false' WHERE key = 'MONDE_V2_SYNC_ENABLED';

  ALTER TABLE public.contatos DISABLE TRIGGER trigger_outbound_webhook_contatos;
  ALTER TABLE public.contatos DISABLE TRIGGER trg_reprocess_whatsapp_on_contato_phone;
  ALTER TABLE public.contatos DISABLE TRIGGER trg_sync_telefone_to_meios;
  ALTER TABLE public.contatos DISABLE TRIGGER trg_check_contato_required;
  ALTER TABLE public.contato_meios DISABLE TRIGGER trg_reprocess_whatsapp_on_new_phone;
  ALTER TABLE public.contato_meios DISABLE TRIGGER trg_sync_meios_to_telefone;
  ALTER TABLE public.cards_contatos DISABLE TRIGGER enforce_single_role_cards_contatos;
  ALTER TABLE public.cards_contatos DISABLE TRIGGER trigger_recalc_stats_cards_contatos;
  ALTER TABLE public.cards_contatos DISABLE TRIGGER trg_update_group_totals_contacts;
  ALTER TABLE public.cards_contatos DISABLE TRIGGER update_travelers_count_trigger;
  ALTER TABLE public.cards_contatos DISABLE TRIGGER cards_contatos_activity_trigger;

  FOR v_row IN
    SELECT id FROM public.contact_consolidation_audit
     WHERE batch = p_batch AND operation = 'merge' AND executed_at IS NULL
     ORDER BY id LIMIT COALESCE(p_limit, 2147483647)
  LOOP
    BEGIN
      PERFORM public._consolidate_merge_one(v_row.id);
      v_done_merge := v_done_merge + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM; v_errors := v_errors + 1;
      UPDATE public.contact_consolidation_audit SET error = v_err_msg WHERE id = v_row.id;
    END;
  END LOOP;

  FOR v_row IN
    SELECT id FROM public.contact_consolidation_audit
     WHERE batch = p_batch AND operation = 'move_org' AND executed_at IS NULL
     ORDER BY id LIMIT COALESCE(p_limit, 2147483647)
  LOOP
    BEGIN
      PERFORM public._consolidate_move_one(v_row.id);
      v_done_move := v_done_move + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err_msg := SQLERRM; v_errors := v_errors + 1;
      UPDATE public.contact_consolidation_audit SET error = v_err_msg WHERE id = v_row.id;
    END;
  END LOOP;

  ALTER TABLE public.cards_contatos ENABLE TRIGGER cards_contatos_activity_trigger;
  ALTER TABLE public.cards_contatos ENABLE TRIGGER update_travelers_count_trigger;
  ALTER TABLE public.cards_contatos ENABLE TRIGGER trg_update_group_totals_contacts;
  ALTER TABLE public.cards_contatos ENABLE TRIGGER trigger_recalc_stats_cards_contatos;
  ALTER TABLE public.cards_contatos ENABLE TRIGGER enforce_single_role_cards_contatos;
  ALTER TABLE public.contato_meios ENABLE TRIGGER trg_sync_meios_to_telefone;
  ALTER TABLE public.contato_meios ENABLE TRIGGER trg_reprocess_whatsapp_on_new_phone;
  ALTER TABLE public.contatos ENABLE TRIGGER trg_check_contato_required;
  ALTER TABLE public.contatos ENABLE TRIGGER trg_sync_telefone_to_meios;
  ALTER TABLE public.contatos ENABLE TRIGGER trg_reprocess_whatsapp_on_contato_phone;
  ALTER TABLE public.contatos ENABLE TRIGGER trigger_outbound_webhook_contatos;

  IF v_prev_setting IS NOT NULL THEN
    UPDATE public.integration_settings SET value = v_prev_setting WHERE key = 'MONDE_V2_SYNC_ENABLED';
  END IF;

  RETURN jsonb_build_object(
    'batch', p_batch,
    'merges_executed', v_done_merge,
    'moves_executed',  v_done_move,
    'errors',          v_errors,
    'prev_monde_setting', v_prev_setting
  );
END;
$fn$;

COMMIT;

-- Execução (comentada — já aplicada em prod via MCP em 2026-04-13):
-- SELECT public.consolidate_contacts_plan();
-- SELECT public.consolidate_contacts_execute();
