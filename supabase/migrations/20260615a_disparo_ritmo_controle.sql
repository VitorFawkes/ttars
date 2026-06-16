-- ============================================================================
-- Disparos — ritmo configurável (leva + intervalo) + envio manual de levas
-- ============================================================================
-- 1. Colunas de ritmo em disparo_campanhas (tamanho_leva, intervalo_leva_min).
-- 2. disparo_calcular_agenda: espaçamento por LEVA ("X a cada Y") no lugar do gap
--    contínuo 20–60s. O resto do corpo (janela/cap/ramp + render) fica inalterado.
--    Recriação fiel do corpo de 20260602b, mudando só o passo 1 e as colunas lidas.
-- 3. disparo_enviar_agora: antecipa execute_at de itens (seleção OU próximos N),
--    escalonado ~45s, e garante campanha ativa (pausada → agendado) — senão o
--    disparo_claim_batch não drena (ele exige status agendado/disparando).
-- 4. disparo_ajustar_ritmo: atualiza colunas e reescala os pendentes reusando
--    disparo_calcular_agenda (que só toca status='pending').
--
-- Produto WEDDING / workspace Welcome Weddings. Todas as RPCs SECURITY DEFINER
-- validam requesting_org_id() antes de mutar (regra CLAUDE.md §7).
-- ============================================================================

BEGIN;

-- 1. Colunas de ritmo ---------------------------------------------------------
ALTER TABLE public.disparo_campanhas
  ADD COLUMN IF NOT EXISTS tamanho_leva       INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS intervalo_leva_min INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.disparo_campanhas.tamanho_leva IS 'Quantas mensagens por leva (ritmo). Espaçadas ~20-40s entre si dentro da leva.';
COMMENT ON COLUMN public.disparo_campanhas.intervalo_leva_min IS 'Minutos de pausa entre uma leva e a próxima.';

-- 2. Agenda por leva ----------------------------------------------------------
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
  v_tam_leva INT;
  v_int_leva INT;
  v_clock    TIMESTAMPTZ;
  v_current_day DATE := NULL;
  v_day_number  INT := 0;
  v_count_day   INT := 0;
  v_count_leva  INT := 0;
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
  v_corpos_alt JSONB;
  v_versions TEXT[];
BEGIN
  SELECT org_id, corpo_mensagem, corpos_alternativos, cap_diario, usar_ramp,
         janela_inicio, janela_fim, tamanho_leva, intervalo_leva_min
    INTO v_org, v_corpo, v_corpos_alt, v_cap, v_ramp, v_jini, v_jfim,
         v_tam_leva, v_int_leva
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Campanha % não encontrada', p_campaign_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_cap      := GREATEST(COALESCE(v_cap, 500), 1);
  v_tam_leva := GREATEST(COALESCE(v_tam_leva, 10), 1);
  v_int_leva := GREATEST(COALESCE(v_int_leva, 30), 0);

  -- Versões da mensagem (principal + alternativas não-vazias). Uma é sorteada
  -- por destinatário, deixando o disparo menos repetitivo (anti-bloqueio).
  v_versions := ARRAY[v_corpo];
  IF v_corpos_alt IS NOT NULL AND jsonb_typeof(v_corpos_alt) = 'array' THEN
    SELECT v_versions || COALESCE(array_agg(value), ARRAY[]::text[])
      INTO v_versions
      FROM jsonb_array_elements_text(v_corpos_alt) AS value
     WHERE NULLIF(btrim(value), '') IS NOT NULL;
  END IF;

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
    -- 1. Espaçamento por LEVA: micro-gap dentro da leva; pausa de intervalo entre levas.
    --    ("manda v_tam_leva pessoas, espera v_int_leva min, repete")
    IF v_idx > 0 THEN
      IF v_count_leva >= v_tam_leva THEN
        v_clock := v_clock + make_interval(mins => v_int_leva);
        v_count_leva := 0;
      ELSE
        v_gap := 20 + floor(random() * 21)::int;        -- 20..40s dentro da leva
        v_clock := v_clock + make_interval(secs => v_gap);
      END IF;
    END IF;

    -- 2. Achar slot válido (janela 08–20h + cap diário de segurança com ramp)
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
        v_count_leva  := 0;   -- novo dia começa leva nova
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

    -- Sorteia uma das versões da mensagem para este destinatário
    v_body := v_versions[1 + floor(random() * array_length(v_versions, 1))::int];

    -- 3a. Variações {opção a|opção b|...} inline (compat): também sorteia por pessoa.
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

    v_count_day  := v_count_day + 1;
    v_count_leva := v_count_leva + 1;
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

-- 3. Enviar agora -------------------------------------------------------------
-- Antecipa execute_at de itens pending (seleção explícita p_fila_ids OU os
-- próximos p_proximos_n por prioridade). Escalona ~45s entre eles (o dispatcher
-- já manda 4/min, então mesmo "agora" sai espaçado). Garante campanha ativa
-- (pausada → agendado) senão o claim_batch não drena. Valida org.
-- Retorna quantos foram antecipados.
CREATE OR REPLACE FUNCTION public.disparo_enviar_agora(
  p_campaign_id UUID,
  p_fila_ids    UUID[] DEFAULT NULL,
  p_proximos_n  INT    DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org    UUID;
  v_status TEXT;
  v_n      INT := 0;
  v_i      INT := 0;
  rec      RECORD;
BEGIN
  SELECT org_id, status INTO v_org, v_status
    FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL OR v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR rec IN
    SELECT id FROM public.disparo_fila
     WHERE campaign_id = p_campaign_id
       AND status = 'pending'
       AND (p_fila_ids IS NULL OR id = ANY(p_fila_ids))
     ORDER BY priority DESC, execute_at ASC
     LIMIT CASE WHEN p_fila_ids IS NOT NULL THEN NULL
                ELSE GREATEST(COALESCE(p_proximos_n, 0), 0) END
  LOOP
    UPDATE public.disparo_fila
       SET execute_at = now() + make_interval(secs => v_i * 45),
           priority   = 2,
           claimed_at = NULL
     WHERE id = rec.id;
    v_i := v_i + 1;
    v_n := v_n + 1;
  END LOOP;

  IF v_n > 0 AND v_status = 'pausado' THEN
    UPDATE public.disparo_campanhas
       SET status = 'agendado', paused_at = NULL
     WHERE id = p_campaign_id;
  END IF;

  RETURN v_n;
END;
$$;

-- 4. Ajustar ritmo ------------------------------------------------------------
-- Atualiza colunas de ritmo + cap_diario (teto de segurança derivado) e reescala
-- os pendentes reusando disparo_calcular_agenda (que só toca status='pending').
CREATE OR REPLACE FUNCTION public.disparo_ajustar_ritmo(
  p_campaign_id        UUID,
  p_tamanho_leva       INT,
  p_intervalo_leva_min INT,
  p_cap_diario         INT,
  p_usar_ramp          BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM public.disparo_campanhas WHERE id = p_campaign_id;
  IF v_org IS NULL OR v_org <> requesting_org_id() THEN
    RAISE EXCEPTION 'Sem permissão para esta campanha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.disparo_campanhas
     SET tamanho_leva       = GREATEST(COALESCE(p_tamanho_leva, 10), 1),
         intervalo_leva_min = GREATEST(COALESCE(p_intervalo_leva_min, 30), 0),
         cap_diario         = GREATEST(COALESCE(p_cap_diario, cap_diario), 1),
         usar_ramp          = COALESCE(p_usar_ramp, usar_ramp)
   WHERE id = p_campaign_id;

  PERFORM public.disparo_calcular_agenda(p_campaign_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.disparo_enviar_agora(UUID, UUID[], INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.disparo_ajustar_ritmo(UUID, INT, INT, INT, BOOLEAN) TO authenticated;

COMMIT;
