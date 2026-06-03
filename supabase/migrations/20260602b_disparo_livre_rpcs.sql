-- ============================================================================
-- Disparo Livre — RPCs (ingestão de público, agenda/throttle, controles)
-- ============================================================================
-- Todas SECURITY DEFINER e validam requesting_org_id(). Reusam normalize_phone_brazil
-- (mesma fn da coluna gerada contatos.telefone_normalizado — sem prefixo 55).
--   disparo_ingest_recipients   — cola lista + escolhe do CRM → match/cria contato → fila
--   disparo_calcular_agenda     — calcula execute_at (throttle) + renderiza corpo por pessoa
--   disparo_pausar/retomar/cancelar
--   disparo_marcar_opt_out      — opt-out manual
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- disparo_ingest_recipients
--   p_publico: array de { telefone, nome?, variaveis? {coluna: valor} }
--   p_wedding_guest_ids: seleção de convidados do CRM (v_wedding_guests_resolved)
-- Para cada telefone: normaliza → dedup por telefone_normalizado (advisory lock)
--   → match em contatos (deleted_at IS NULL); existente preenche SÓ campos vazios;
--   novo é criado → enfileira em disparo_fila (execute_at placeholder = now()).
-- Pula quem está em disparo_opt_outs. Idempotente (UNIQUE campaign_id+contact_id).
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
  out_resultado   TEXT,   -- 'aceito' | 'rejeitado'
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

-- ─────────────────────────────────────────────────────────────────────────
-- disparo_calcular_agenda — THROTTLE + render por pessoa
--   Calcula execute_at de cada destinatário: 20–60s + jitter, janela 08–20h BR,
--   cap diário com ramp opcional, pausas periódicas, "quem já interagiu primeiro".
--   Renderiza corpo_renderizado: regra "lista preenche, CRM completa"
--   (variaveis da lista têm prioridade; o que faltar vem do contato).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_calcular_agenda(p_campaign_id UUID)
RETURNS TABLE(out_total INT, out_termino TIMESTAMPTZ, out_dias INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org      UUID;
  v_corpo    TEXT;
  v_cap      INT;
  v_ramp     BOOLEAN;
  v_jini     TIME;
  v_jfim     TIME;
  v_clock    TIMESTAMPTZ;
  v_current_day DATE := NULL;
  v_day_number  INT := 0;
  v_count_day   INT := 0;
  v_day_cap     INT;
  v_idx      INT := 0;
  v_gap      INT;
  v_last     TIMESTAMPTZ;
  v_total    INT := 0;
  rec        RECORD;
  v_eff      JSONB;
  v_body     TEXT;
  v_k        TEXT;
  v_v        TEXT;
  v_repl     TEXT;
  v_spin     TEXT;
  v_opts     TEXT[];
  v_choice   TEXT;
BEGIN
  SELECT org_id, corpo_mensagem, cap_diario, usar_ramp, janela_inicio, janela_fim
    INTO v_org, v_corpo, v_cap, v_ramp, v_jini, v_jfim
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Campanha % não encontrada', p_campaign_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_cap := GREATEST(COALESCE(v_cap, 500), 1);

  -- Toda a matemática de janela/dia em horário de Brasília
  SET LOCAL TimeZone = 'America/Sao_Paulo';
  v_clock := now();

  FOR rec IN
    SELECT f.id, f.variaveis,
           c.nome, c.sobrenome, c.email, c.telefone,
           EXISTS (SELECT 1 FROM public.whatsapp_messages m
                    WHERE m.contact_id = f.contact_id AND m.direction = 'inbound') AS interagiu
      FROM public.disparo_fila f
      JOIN public.contatos c ON c.id = f.contact_id
     WHERE f.campaign_id = p_campaign_id
       AND f.status = 'pending'
     ORDER BY (EXISTS (SELECT 1 FROM public.whatsapp_messages m
                        WHERE m.contact_id = f.contact_id AND m.direction = 'inbound')) DESC,
              f.created_at ASC
  LOOP
    -- 1. Espaçamento entre mensagens (jitter real) + pausas periódicas
    IF v_idx > 0 THEN
      v_gap := 20 + floor(random() * 41)::int;        -- 20..60s
      IF v_idx % 100 = 0 THEN v_gap := v_gap + 900;    -- +15min a cada 100
      ELSIF v_idx % 25 = 0 THEN v_gap := v_gap + 300;  -- +5min a cada 25
      END IF;
      v_clock := v_clock + make_interval(secs => v_gap);
    END IF;

    -- 2. Achar slot válido (janela 08–20h + cap diário com ramp)
    LOOP
      IF v_clock::time < v_jini THEN
        v_clock := date_trunc('day', v_clock) + v_jini::interval;
      ELSIF v_clock::time >= v_jfim THEN
        v_clock := date_trunc('day', v_clock) + interval '1 day' + v_jini::interval;
      END IF;

      IF v_current_day IS NULL OR v_clock::date <> v_current_day THEN
        v_current_day := v_clock::date;
        v_day_number  := v_day_number + 1;
        v_count_day   := 0;
        v_day_cap := CASE
                       WHEN NOT v_ramp        THEN v_cap
                       WHEN v_day_number = 1  THEN LEAST(v_cap, 100)
                       WHEN v_day_number = 2  THEN LEAST(v_cap, 200)
                       ELSE v_cap
                     END;
        v_day_cap := GREATEST(v_day_cap, 1);
      END IF;

      IF v_count_day >= v_day_cap THEN
        v_clock := date_trunc('day', v_clock) + interval '1 day' + v_jini::interval;
        CONTINUE;  -- re-avalia janela + troca de dia
      END IF;

      EXIT;  -- slot ok
    END LOOP;

    -- 3. Render "lista preenche, CRM completa"
    v_eff := jsonb_build_object(
      'nome',          COALESCE(NULLIF(btrim(rec.nome), ''), ''),
      'primeiro_nome', split_part(COALESCE(rec.nome, ''), ' ', 1),
      'sobrenome',     COALESCE(rec.sobrenome, ''),
      'email',         COALESCE(rec.email, ''),
      'telefone',      COALESCE(rec.telefone, '')
    );
    -- variaveis da lista têm prioridade quando não-vazias
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each_text(COALESCE(rec.variaveis, '{}'::jsonb)) LOOP
      IF v_v IS NOT NULL AND btrim(v_v) <> '' THEN
        v_eff := jsonb_set(v_eff, ARRAY[v_k], to_jsonb(v_v), true);
      ELSIF NOT (v_eff ? v_k) THEN
        v_eff := jsonb_set(v_eff, ARRAY[v_k], to_jsonb(''::text), true);
      END IF;
    END LOOP;
    -- primeiro_nome reflete o nome final
    v_eff := jsonb_set(v_eff, ARRAY['primeiro_nome'],
                       to_jsonb(split_part(COALESCE(v_eff->>'nome', ''), ' ', 1)), true);

    v_body := v_corpo;

    -- 3a. Variações {opção a|opção b|...}: sorteia uma por destinatário (anti-repetição).
    -- Resolve ANTES das variáveis, então uma variação pode conter [nome] etc.
    LOOP
      v_spin := substring(v_body FROM '\{[^{}]*\|[^{}]*\}');  -- 1º bloco {…|…}
      EXIT WHEN v_spin IS NULL;
      v_opts := string_to_array(substring(v_spin FROM 2 FOR length(v_spin) - 2), '|');
      v_choice := v_opts[1 + floor(random() * array_length(v_opts, 1))::int];
      v_body := overlay(v_body PLACING COALESCE(v_choice, '')
                        FROM position(v_spin IN v_body) FOR length(v_spin));
    END LOOP;

    -- 3b. Render variáveis (lista preenche, CRM completa)
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each_text(v_eff) LOOP
      -- aceita {{var}} E [var], com espaços opcionais, sem diferenciar maiúsc/minúsc
      -- (ex: o usuário escreve [Nome] e a gente troca pelo nome). v_k é sempre
      -- [a-z0-9_] (seguro em regex); escapa '\' no valor pro regexp_replace.
      v_repl := replace(COALESCE(v_v, ''), '\', '\\');
      v_body := regexp_replace(v_body, '\{\{\s*' || v_k || '\s*\}\}', v_repl, 'gi');
      v_body := regexp_replace(v_body, '\[\s*' || v_k || '\s*\]', v_repl, 'gi');
    END LOOP;
    -- remove só {{...}} não preenchidos; [...] pode ser texto normal, não mexe
    v_body := regexp_replace(v_body, '\{\{\s*[^}]+\s*\}\}', '', 'g');

    -- 4. Grava agenda + corpo
    UPDATE public.disparo_fila
       SET execute_at = v_clock,
           priority = CASE WHEN rec.interagiu THEN 1 ELSE 0 END,
           corpo_renderizado = v_body,
           status = 'pending',
           claimed_at = NULL,
           attempts = 0
     WHERE id = rec.id;

    v_count_day := v_count_day + 1;
    v_idx := v_idx + 1;
    v_last := v_clock;
    v_total := v_total + 1;
  END LOOP;

  -- Atualiza campanha → agendado + estimativas
  out_total   := v_total;
  out_termino := v_last;
  out_dias    := CASE WHEN v_last IS NULL THEN 0
                      ELSE GREATEST(1, (v_last::date - now()::date) + 1) END;

  UPDATE public.disparo_campanhas
     SET status = CASE WHEN v_total > 0 THEN 'agendado' ELSE status END,
         total = v_total,
         estimado_termino_at = v_last,
         estimado_dias = out_dias
   WHERE id = p_campaign_id;

  RETURN NEXT;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Controles: pausar / retomar / cancelar  (validam org via requesting_org_id)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disparo_pausar(p_campaign_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.disparo_campanhas
     SET status = 'pausado', paused_at = now()
   WHERE id = p_campaign_id AND org_id = requesting_org_id()
     AND status IN ('agendado', 'disparando');
END; $$;

CREATE OR REPLACE FUNCTION public.disparo_retomar(p_campaign_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.disparo_campanhas
     SET status = 'agendado', paused_at = NULL
   WHERE id = p_campaign_id AND org_id = requesting_org_id()
     AND status = 'pausado';
END; $$;

CREATE OR REPLACE FUNCTION public.disparo_cancelar(p_campaign_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.disparo_campanhas
     SET status = 'cancelado', finished_at = now()
   WHERE id = p_campaign_id AND org_id = requesting_org_id()
     AND status NOT IN ('concluido', 'cancelado');
  UPDATE public.disparo_fila
     SET status = 'cancelado'
   WHERE campaign_id = p_campaign_id
     AND org_id = requesting_org_id()
     AND status IN ('pending', 'processing');
END; $$;

-- Opt-out manual (botão no relatório): bloqueia o telefone e tira da fila desta campanha
CREATE OR REPLACE FUNCTION public.disparo_marcar_opt_out(p_campaign_id UUID, p_contact_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org   UUID;
  v_norm  TEXT;
  v_line  TEXT;
BEGIN
  SELECT org_id, phone_number_id INTO v_org, v_line
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL OR v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT telefone_normalizado INTO v_norm
    FROM public.contatos WHERE id = p_contact_id AND org_id = v_org;
  IF v_norm IS NULL THEN
    SELECT telefone_normalizado INTO v_norm
      FROM public.disparo_fila WHERE campaign_id = p_campaign_id AND contact_id = p_contact_id;
  END IF;
  IF v_norm IS NULL THEN RETURN; END IF;

  INSERT INTO public.disparo_opt_outs (org_id, contact_id, telefone_normalizado, phone_number_id, reason)
  VALUES (v_org, p_contact_id, v_norm, v_line, 'manual')
  ON CONFLICT (org_id, telefone_normalizado) DO NOTHING;

  UPDATE public.disparo_fila
     SET status = 'opt_out'
   WHERE campaign_id = p_campaign_id AND contact_id = p_contact_id
     AND status IN ('pending', 'processing');
END; $$;

GRANT EXECUTE ON FUNCTION public.disparo_ingest_recipients(UUID, JSONB, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_calcular_agenda(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_pausar(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_retomar(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_cancelar(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_marcar_opt_out(UUID, UUID) TO authenticated;

COMMIT;
