-- ============================================================================
-- Disparo Livre — manda o disparo PRIMEIRO, conecta as conversas antigas DEPOIS
-- ============================================================================
-- BUG (prod, 08/06): "Falha ao preparar o disparo." ao montar um disparo que
-- cria contatos novos. Causa raiz:
--
--   disparo_ingest_recipients
--     └─ INSERT INTO contatos (origem='whatsapp')                 (por contato novo)
--          └─ trg_reprocess_whatsapp_on_contato_phone  (AFTER INSERT)
--               └─ reprocess_orphan_whatsapp_for_phone(telefone)
--                    └─ SEQ SCAN em whatsapp_raw_events (~245k linhas, ~349ms)
--                       + process_whatsapp_raw_event_v2 (até 100x por telefone)
--
-- Isso roda SÍNCRONO dentro do loop do ingest. Com vários contatos novos numa
-- lista, o tempo acumulado passa do statement_timeout do papel `authenticated`
-- (8s) → "canceling statement due to statement timeout" → RPC 500 → erro pro
-- usuário. Funcionava quando os destinatários JÁ eram contatos (sem INSERT, sem
-- trigger). Latente também pra qualquer criação de contato em massa (Monde etc).
--
-- CORREÇÃO (ideia do Vitor): desacoplar. O disparo cria os contatos e agenda os
-- envios na hora (rápido); a parte pesada de reconectar conversas antigas vai
-- pra uma fila e roda no fundo (pg_cron, sem limite de tempo). Nada se perde —
-- só sai do caminho crítico do envio.
--
--   1. trg respeita flag transaction-local app.skip_orphan_reprocess
--   2. disparo_ingest_recipients liga o flag + enfileira os telefones novos
--   3. disparo_orphan_reprocess_queue (fila) + disparo_drain_orphan_reprocess()
--   4. cron 'disparo-drain-orphan-reprocess' drena a fila a cada 1 min
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Fila técnica de reprocessamento (drenada no fundo). Global/service_role,
--    como integration_outbox — é fila de plataforma, não dado de negócio.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disparo_orphan_reprocess_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone     TEXT NOT NULL,
  contact_id   UUID REFERENCES public.contatos(id) ON DELETE CASCADE,
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  attempts     INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_disparo_orphan_queue_pending
  ON public.disparo_orphan_reprocess_queue (enqueued_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.disparo_orphan_reprocess_queue ENABLE ROW LEVEL SECURITY;
-- Fila interna: só service_role. authenticated nem lê (nada de negócio aqui).
DROP POLICY IF EXISTS disparo_orphan_queue_service_all ON public.disparo_orphan_reprocess_queue;
CREATE POLICY disparo_orphan_queue_service_all ON public.disparo_orphan_reprocess_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.disparo_orphan_reprocess_queue IS
  'Fila técnica (global, service_role). Telefones de contatos criados pelo Disparo Livre que precisam reconectar conversas órfãs de WhatsApp. Drenada no fundo por disparo_drain_orphan_reprocess() (cron disparo-drain-orphan-reprocess) pra não travar o preparo do disparo.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Trigger de reprocessamento respeita o flag transaction-local. Quando o
--    disparo liga app.skip_orphan_reprocess, o relink retroativo NÃO roda na
--    hora do INSERT — vai pra fila e é feito no fundo. (Base: fonte viva em
--    prod + a checagem do flag no topo. Demais fluxos seguem idênticos.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_reprocess_whatsapp_on_contato_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    -- Disparo (e outros bulk inserts) podem adiar o relink retroativo pra fora
    -- do caminho crítico: o flag desliga o reprocesso síncrono e quem ligou o
    -- flag fica responsável por enfileirar/rodar depois. Evita estourar o
    -- statement_timeout criando vários contatos de uma vez.
    IF current_setting('app.skip_orphan_reprocess', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Só processar se telefone é novo ou mudou
    IF NEW.telefone IS NULL OR NEW.telefone = '' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.telefone = NEW.telefone THEN
        RETURN NEW;
    END IF;

    SELECT reprocess_orphan_whatsapp_for_phone(NEW.telefone) INTO v_result;

    RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. disparo_ingest_recipients: liga o flag (escopo da própria transação) e
--    enfileira o telefone de cada contato NOVO pra reprocessar no fundo.
--    (Base: fonte viva em prod + 2 acréscimos marcados com ⮕ ADICIONADO.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_ingest_recipients(
  p_campaign_id       UUID,
  p_publico           JSONB DEFAULT '[]'::jsonb,
  p_wedding_guest_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  out_contact_id  UUID,
  out_telefone    TEXT,
  out_nome        TEXT,
  out_criado_novo BOOLEAN,
  out_resultado   TEXT,
  out_motivo      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        UUID;
  v_items      JSONB;
  v_guest_items JSONB;
  v_item       JSONB;
  v_tel_raw    TEXT;
  v_nome       TEXT;
  v_vars       JSONB;
  v_norm       TEXT;
  v_contact_id UUID;
  v_existing   RECORD;
  v_new        BOOLEAN;
  v_out_nome   TEXT;
  v_inserted   INT;
BEGIN
  SELECT org_id INTO v_org FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Campanha % não encontrada', p_campaign_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ⮕ ADICIONADO: criar contato dispara trg_reprocess_whatsapp_on_contato_phone,
  -- que faz um seq scan pesado em whatsapp_raw_events POR contato. Num disparo
  -- isso acumula e estoura o statement_timeout (8s). Desligamos o reprocesso
  -- síncrono só nesta transação e enfileiramos os telefones novos pra rodar no
  -- fundo (disparo_drain_orphan_reprocess via cron). O disparo sai na hora.
  PERFORM set_config('app.skip_orphan_reprocess', 'true', true);

  -- Monta itens vindos do CRM (convidados selecionados)
  v_guest_items := '[]'::jsonb;
  IF p_wedding_guest_ids IS NOT NULL AND array_length(p_wedding_guest_ids, 1) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'telefone', g.telefone_display,
             'nome',     g.nome_display,
             'variaveis', '{}'::jsonb
           )), '[]'::jsonb)
      INTO v_guest_items
      FROM public.v_wedding_guests_resolved g
     WHERE g.id = ANY(p_wedding_guest_ids)
       AND g.org_id = v_org
       AND COALESCE(g.telefone_display, '') <> '';
  END IF;

  v_items := COALESCE(p_publico, '[]'::jsonb) || v_guest_items;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_tel_raw := v_item->>'telefone';
    v_nome    := NULLIF(btrim(COALESCE(v_item->>'nome', '')), '');
    v_vars    := COALESCE(v_item->'variaveis', '{}'::jsonb);
    -- normalize_phone_brazil = MESMA função da coluna gerada contatos.telefone_normalizado
    -- (sem prefixo 55). Usar a mesma garante match/dedup correto contra contatos.
    v_norm    := normalize_phone_brazil(v_tel_raw);

    IF v_norm IS NULL OR length(v_norm) < 10 OR length(v_norm) > 13 THEN
      out_contact_id := NULL; out_telefone := v_tel_raw; out_nome := v_nome;
      out_criado_novo := false; out_resultado := 'rejeitado'; out_motivo := 'telefone_invalido';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Opt-out: nunca manda pra quem pediu pra sair
    IF EXISTS (SELECT 1 FROM public.disparo_opt_outs o
                WHERE o.org_id = v_org AND o.telefone_normalizado = v_norm) THEN
      out_contact_id := NULL; out_telefone := v_norm; out_nome := v_nome;
      out_criado_novo := false; out_resultado := 'rejeitado'; out_motivo := 'opt_out';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Serializa criação/lookup do mesmo telefone na mesma org (evita duplicata em corrida)
    PERFORM pg_advisory_xact_lock(hashtext(v_org::text || ':' || v_norm));

    SELECT id, nome INTO v_existing
      FROM public.contatos
     WHERE org_id = v_org AND telefone_normalizado = v_norm AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF FOUND THEN
      v_contact_id := v_existing.id;
      v_new := false;
      v_out_nome := COALESCE(v_nome, v_existing.nome);
      -- Completar SÓ o que falta (nunca sobrescreve)
      IF v_nome IS NOT NULL AND COALESCE(btrim(v_existing.nome), '') = '' THEN
        UPDATE public.contatos SET nome = v_nome WHERE id = v_contact_id;
      END IF;
    ELSE
      -- telefone_normalizado é coluna GERADA (normalize_phone_brazil(telefone)) — não inserir.
      -- origem='whatsapp' isenta do trigger check_contato_required_fields (que exigiria
      -- sobrenome) — listas de disparo nem sempre têm sobrenome.
      INSERT INTO public.contatos (org_id, nome, telefone, origem)
      VALUES (v_org, COALESCE(v_nome, v_norm), v_tel_raw, 'whatsapp')
      RETURNING id INTO v_contact_id;
      v_new := true;
      v_out_nome := v_nome;

      -- ⮕ ADICIONADO: contato novo → enfileira pra reconectar conversas órfãs
      -- no fundo (o trigger síncrono foi desligado acima pelo flag).
      INSERT INTO public.disparo_orphan_reprocess_queue (telefone, contact_id)
      VALUES (v_tel_raw, v_contact_id);
    END IF;

    -- Enfileira (execute_at placeholder; agenda real vem em disparo_calcular_agenda)
    INSERT INTO public.disparo_fila (campaign_id, contact_id, telefone_normalizado, execute_at, variaveis, status)
    VALUES (p_campaign_id, v_contact_id, v_norm, now(), v_vars, 'pending')
    ON CONFLICT (campaign_id, contact_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 0 THEN
      out_contact_id := v_contact_id; out_telefone := v_norm; out_nome := v_out_nome;
      out_criado_novo := false; out_resultado := 'rejeitado'; out_motivo := 'duplicado';
      RETURN NEXT; CONTINUE;
    END IF;

    out_contact_id := v_contact_id; out_telefone := v_norm; out_nome := v_out_nome;
    out_criado_novo := v_new; out_resultado := 'aceito'; out_motivo := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_ingest_recipients(UUID, JSONB, UUID[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Dreno da fila — roda no fundo, SEM limite de tempo (statement_timeout=0).
--    Processa um lote pequeno por tick; FOR UPDATE SKIP LOCKED tolera ticks
--    sobrepostos. attempts < 5 evita reprocesso eterno de telefone problemático.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_drain_orphan_reprocess(p_limit INT DEFAULT 15)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec  RECORD;
  v_done INT := 0;
BEGIN
  -- Background: a reconexão pode demorar (seq scan + reprocesso). Sem o teto de 8s.
  SET LOCAL statement_timeout = 0;

  FOR v_rec IN
    SELECT id, telefone
      FROM public.disparo_orphan_reprocess_queue
     WHERE processed_at IS NULL AND attempts < 5
     ORDER BY enqueued_at ASC
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.reprocess_orphan_whatsapp_for_phone(v_rec.telefone);
      UPDATE public.disparo_orphan_reprocess_queue
         SET processed_at = now(), attempts = attempts + 1
       WHERE id = v_rec.id;
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      -- não trava a fila por um telefone ruim; conta a tentativa e segue
      UPDATE public.disparo_orphan_reprocess_queue
         SET attempts = attempts + 1
       WHERE id = v_rec.id;
    END;
  END LOOP;

  RETURN v_done;
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_drain_orphan_reprocess(INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. pg_cron: drena a fila a cada 1 min (SQL puro, in-DB — não precisa de
--    edge function nem service_role_key, ao contrário do disparo-dispatcher).
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('disparo-drain-orphan-reprocess');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'disparo-drain-orphan-reprocess',
  '* * * * *',
  $$ SELECT public.disparo_drain_orphan_reprocess(15); $$
);

COMMIT;
