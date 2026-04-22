-- ============================================================
-- Travel Planner — Bloco D: Eventos da viagem no motor de automação nativo
--
-- Expõe os estados/ações do Travel Planner como gatilhos configuráveis em
-- /settings/automations. O admin pode criar automações tipo "quando o TP
-- enviar a viagem → enviar WhatsApp ao cliente", sem tocar em código.
--
-- Eventos expostos (valor em cadence_event_triggers.event_type):
--   viagem.enviada               — TP dispara envio (estado → em_recomendacao)
--   viagem.confirmada            — cliente aceita (estado → confirmada)
--   viagem.item_aprovado         — cliente aprova item (via RPC aprovar_item)
--   viagem.item_escolhido        — cliente escolhe alternativa
--   viagem.comentario_cliente    — cliente comenta (interno=false, autor=client)
--   viagem.voucher_adicionado    — PV anexa voucher_url em trip_items.operacional
--   viagem.nps_respondido        — cliente responde NPS
--   time_offset_from_date com source=viagem.embarque_inicio (temporal, via cron diário)
--
-- Além disso:
-- * Trigger AFTER UPDATE trip_items.status grava em trip_events quando status
--   muda fora das RPCs (base para analytics + timeline).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Trigger: viagens.estado muda para estado-chave → enfileira
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_viagens_enqueue_automacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_trigger RECORD;
  v_event_type TEXT;
  v_card_pipeline_id UUID;
BEGIN
  -- Só faz sentido se a viagem está ligada a um card
  IF NEW.card_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Detectar qual evento aconteceu
  IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NEW.estado = 'em_recomendacao' THEN
      v_event_type := 'viagem.enviada';
    ELSIF NEW.estado = 'confirmada' THEN
      v_event_type := 'viagem.confirmada';
    ELSE
      RETURN NEW;  -- outros estados não geram gatilho configurável
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- NPS respondido: detectar via nps_respondida_em mudou de NULL para not-null
  -- (tratado abaixo em bloco separado)

  -- Pipeline do card para filtro
  SELECT ps.pipeline_id INTO v_card_pipeline_id
  FROM cards c
  JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
  WHERE c.id = NEW.card_id;

  -- Enfileirar para cada trigger configurado
  FOR v_trigger IN
    SELECT * FROM cadence_event_triggers
    WHERE event_type = v_event_type AND is_active = true
      AND (applicable_pipeline_ids IS NULL
           OR array_length(applicable_pipeline_ids, 1) IS NULL
           OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
  LOOP
    INSERT INTO cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    VALUES (
      NEW.org_id,
      NEW.card_id,
      v_trigger.id,
      v_event_type,
      jsonb_build_object(
        'viagem_id', NEW.id,
        'estado_anterior', OLD.estado,
        'estado_novo', NEW.estado,
        'public_token', NEW.public_token
      ),
      CASE WHEN v_trigger.delay_minutes = 0 THEN NOW()
           ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_viagens_enqueue_automacao ON viagens;
CREATE TRIGGER trg_viagens_enqueue_automacao
  AFTER UPDATE OF estado ON viagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_viagens_enqueue_automacao();

-- ────────────────────────────────────────────────────────────
-- 2. Trigger: nps_respondida_em preenchido → viagem.nps_respondido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_viagens_nps_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_trigger RECORD;
  v_card_pipeline_id UUID;
BEGIN
  IF NEW.card_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.nps_respondida_em IS NOT DISTINCT FROM NEW.nps_respondida_em THEN
    RETURN NEW;
  END IF;
  IF NEW.nps_respondida_em IS NULL THEN RETURN NEW; END IF;

  SELECT ps.pipeline_id INTO v_card_pipeline_id
  FROM cards c JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
  WHERE c.id = NEW.card_id;

  FOR v_trigger IN
    SELECT * FROM cadence_event_triggers
    WHERE event_type = 'viagem.nps_respondido' AND is_active = true
      AND (applicable_pipeline_ids IS NULL
           OR array_length(applicable_pipeline_ids, 1) IS NULL
           OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
  LOOP
    INSERT INTO cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    VALUES (
      NEW.org_id, NEW.card_id, v_trigger.id, 'viagem.nps_respondido',
      jsonb_build_object(
        'viagem_id', NEW.id,
        'nota', NEW.nps_nota,
        'comentario', NEW.nps_comentario
      ),
      CASE WHEN v_trigger.delay_minutes = 0 THEN NOW()
           ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_viagens_nps_enqueue ON viagens;
CREATE TRIGGER trg_viagens_nps_enqueue
  AFTER UPDATE OF nps_respondida_em ON viagens
  FOR EACH ROW EXECUTE FUNCTION public.fn_viagens_nps_enqueue();

-- ────────────────────────────────────────────────────────────
-- 3. Trigger: trip_items mudanças → eventos automáveis + trip_events
--    - item_aprovado: status virou 'aprovado'
--    - voucher_adicionado: operacional.voucher_url apareceu
--    - Também grava em trip_events (D-19: auto-evento quando status muda
--      fora das RPCs)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_items_enqueue_automacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_trigger RECORD;
  v_event_type TEXT;
  v_event_data JSONB;
  v_card_pipeline_id UUID;
  v_old_voucher TEXT;
  v_new_voucher TEXT;
  v_should_enqueue BOOLEAN := false;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  -- item_aprovado: status 'proposto' ou 'rascunho' → 'aprovado'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'aprovado' THEN
    v_event_type := 'viagem.item_aprovado';
    v_event_data := jsonb_build_object(
      'item_id', NEW.id, 'tipo', NEW.tipo::text,
      'status_anterior', OLD.status::text
    );
    v_should_enqueue := true;
  END IF;

  -- voucher_adicionado: operacional->>voucher_url passou de null para not-null
  IF NOT v_should_enqueue THEN
    v_old_voucher := OLD.operacional->>'voucher_url';
    v_new_voucher := NEW.operacional->>'voucher_url';
    IF v_old_voucher IS DISTINCT FROM v_new_voucher AND v_new_voucher IS NOT NULL THEN
      v_event_type := 'viagem.voucher_adicionado';
      v_event_data := jsonb_build_object(
        'item_id', NEW.id, 'tipo', NEW.tipo::text,
        'voucher_url', v_new_voucher
      );
      v_should_enqueue := true;
    END IF;
  END IF;

  -- Também grava em trip_events se o status mudou, para alimentar timeline/analytics
  -- (RPCs aprovar_item, escolher_alternativa, confirmar_viagem já inserem; mas UPDATE
  --  direto via UI/editor pode não gerar — este trigger cobre esse caso)
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
    VALUES (NEW.viagem_id, NEW.org_id, 'item_status_mudou',
      jsonb_build_object(
        'item_id', NEW.id,
        'tipo', NEW.tipo::text,
        'de', OLD.status::text,
        'para', NEW.status::text
      )
    );
  END IF;

  IF NOT v_should_enqueue THEN RETURN NEW; END IF;

  -- Enfileirar para automações configuradas
  SELECT * INTO v_viagem FROM viagens WHERE id = NEW.viagem_id;
  IF v_viagem IS NULL OR v_viagem.card_id IS NULL THEN RETURN NEW; END IF;

  SELECT ps.pipeline_id INTO v_card_pipeline_id
  FROM cards c JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
  WHERE c.id = v_viagem.card_id;

  FOR v_trigger IN
    SELECT * FROM cadence_event_triggers
    WHERE event_type = v_event_type AND is_active = true
      AND (applicable_pipeline_ids IS NULL
           OR array_length(applicable_pipeline_ids, 1) IS NULL
           OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
  LOOP
    INSERT INTO cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    VALUES (
      v_viagem.org_id, v_viagem.card_id, v_trigger.id, v_event_type,
      v_event_data || jsonb_build_object('viagem_id', v_viagem.id),
      CASE WHEN v_trigger.delay_minutes = 0 THEN NOW()
           ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_items_enqueue_automacao ON trip_items;
CREATE TRIGGER trg_trip_items_enqueue_automacao
  AFTER UPDATE ON trip_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_trip_items_enqueue_automacao();

-- ────────────────────────────────────────────────────────────
-- 4. Trigger: trip_comments do cliente → viagem.comentario_cliente
--    (só quando autor=client e interno=false)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trip_comments_enqueue_automacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_trigger RECORD;
  v_card_pipeline_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.autor <> 'client' OR NEW.interno = true THEN RETURN NEW; END IF;

  SELECT * INTO v_viagem FROM viagens WHERE id = NEW.viagem_id;
  IF v_viagem IS NULL OR v_viagem.card_id IS NULL THEN RETURN NEW; END IF;

  SELECT ps.pipeline_id INTO v_card_pipeline_id
  FROM cards c JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
  WHERE c.id = v_viagem.card_id;

  FOR v_trigger IN
    SELECT * FROM cadence_event_triggers
    WHERE event_type = 'viagem.comentario_cliente' AND is_active = true
      AND (applicable_pipeline_ids IS NULL
           OR array_length(applicable_pipeline_ids, 1) IS NULL
           OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
  LOOP
    INSERT INTO cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    VALUES (
      v_viagem.org_id, v_viagem.card_id, v_trigger.id, 'viagem.comentario_cliente',
      jsonb_build_object(
        'viagem_id', v_viagem.id,
        'comment_id', NEW.id,
        'item_id', NEW.item_id,
        'texto', LEFT(NEW.texto, 500)
      ),
      CASE WHEN v_trigger.delay_minutes = 0 THEN NOW()
           ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_comments_enqueue_automacao ON trip_comments;
CREATE TRIGGER trg_trip_comments_enqueue_automacao
  AFTER INSERT ON trip_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_trip_comments_enqueue_automacao();

-- ────────────────────────────────────────────────────────────
-- 5. Source temporal viagem.embarque_inicio
--    Estende fn_enqueue_temporal_events para ler a menor data_inicio dos
--    trip_items operacionais de cada viagem. Admin configura offset_days:
--      -7   → dispara 7 dias antes do embarque
--      -1   → 24h antes
--       0   → dia do embarque
--       7   → 7 dias depois (pós-viagem)
--
-- IMPORTANTE: esta função adiciona um bloco NOVO sem remover os existentes.
-- É CREATE OR REPLACE — copia a função atual e adiciona o bloco novo no final.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_enqueue_temporal_events()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_count INT;
BEGIN
  -- ── time_offset_from_date: source = card.data_viagem_inicio ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'card.data_viagem_inicio',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'card.data_viagem_inicio'
      AND c.data_viagem_inicio IS NOT NULL
      AND DATE(c.data_viagem_inicio AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = card.data_viagem_fim ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'card.data_viagem_fim',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'card.data_viagem_fim'
      AND c.data_viagem_fim IS NOT NULL
      AND DATE(c.data_viagem_fim AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = contato.data_nascimento ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'contato.data_nascimento',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    JOIN public.contatos co ON co.id = c.contato_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'contato.data_nascimento'
      AND co.data_nascimento IS NOT NULL
      AND (
        MAKE_DATE(
          EXTRACT(YEAR FROM CURRENT_DATE)::INT,
          EXTRACT(MONTH FROM co.data_nascimento)::INT,
          EXTRACT(DAY FROM co.data_nascimento)::INT
        ) + ((t.event_config->>'offset_days')::INT)
      ) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = proposal.expires_at ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'proposal.expires_at',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    JOIN public.proposals p ON p.card_id = c.id AND p.status <> 'accepted'
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'proposal.expires_at'
      AND p.expires_at IS NOT NULL
      AND DATE(p.expires_at AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── NOVO: time_offset_from_date: source = viagem.embarque_inicio ──
  -- A data de embarque é a MENOR data_inicio entre os trip_items operacionais
  -- (tipicamente o primeiro voo ou hotel após o PV subir vouchers).
  WITH earliest_departure AS (
    SELECT v.id AS viagem_id, v.card_id, v.org_id,
      MIN(
        CASE
          WHEN (i.operacional->>'data_inicio') ~ '^\d{4}-\d{2}-\d{2}$'
          THEN (i.operacional->>'data_inicio')::DATE
          ELSE NULL
        END
      ) AS data_embarque
    FROM viagens v
    JOIN trip_items i ON i.viagem_id = v.id AND i.deleted_at IS NULL
    WHERE v.card_id IS NOT NULL
      AND v.estado IN ('confirmada', 'em_montagem', 'aguardando_embarque')
    GROUP BY v.id, v.card_id, v.org_id
  ),
  inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT ed.org_id, ed.card_id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'viagem.embarque_inicio',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE,
             'viagem_id', ed.viagem_id,
             'data_embarque', ed.data_embarque
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN earliest_departure ed ON ed.org_id = t.org_id
    JOIN public.cards c ON c.id = ed.card_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'viagem.embarque_inicio'
      AND ed.data_embarque IS NOT NULL
      AND ed.data_embarque + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = ed.card_id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  RETURN v_total;
END
$$;

COMMENT ON FUNCTION public.fn_viagens_enqueue_automacao() IS
  'Enfileira automações quando viagens.estado muda para em_recomendacao/confirmada';

COMMENT ON FUNCTION public.fn_viagens_nps_enqueue() IS
  'Enfileira automações quando cliente responde NPS';

COMMENT ON FUNCTION public.fn_trip_items_enqueue_automacao() IS
  'Enfileira automações quando item é aprovado ou voucher é adicionado. Grava também trip_events.item_status_mudou';

COMMENT ON FUNCTION public.fn_trip_comments_enqueue_automacao() IS
  'Enfileira automações quando cliente comenta (não-interno)';
