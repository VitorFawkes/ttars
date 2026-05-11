-- Corrige RPCs do agente IA que referenciam colunas/tipos que não existem no schema atual.
-- Problemas descobertos auditando a Luna:
-- 1. agent_request_handoff: UPDATE cards ... RETURNING responsavel_id → não existe (é dono_atual_id).
-- 2. agent_request_handoff: INSERT activities (profile_id, conteudo, ...) → colunas não existem (é created_by, descricao).
-- 3. agent_check_calendar: generate_series(time, time, interval) → Postgres não tem; precisa timestamp.

-- ============================================================
-- 1. agent_request_handoff — alinha com schema real
-- ============================================================
CREATE OR REPLACE FUNCTION public.agent_request_handoff(
  p_card_id UUID,
  p_reason TEXT DEFAULT 'cliente_pede_humano',
  p_context_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card RECORD;
  v_contact RECORD;
  v_reason TEXT;
BEGIN
  v_reason := COALESCE(p_reason, 'cliente_pede_humano');
  IF v_reason NOT IN (
    'cliente_pede_humano',
    'agente_sem_resposta',
    'assunto_complexo',
    'informacao_sensivel',
    'loop_incompreensao',
    'outro'
  ) THEN
    v_reason := 'outro';
  END IF;

  UPDATE cards
  SET
    ai_responsavel = 'humano',
    updated_at = now()
  WHERE id = p_card_id
    AND ai_responsavel = 'ia'
  RETURNING id, titulo, dono_atual_id, sdr_owner_id, pessoa_principal_id, org_id
    INTO v_card;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'card_not_found_or_not_ia'
    );
  END IF;

  SELECT * INTO v_contact FROM contatos WHERE id = v_card.pessoa_principal_id;

  INSERT INTO activities (card_id, created_by, tipo, descricao, org_id, created_at)
  VALUES (
    p_card_id,
    COALESCE(v_card.dono_atual_id, v_card.sdr_owner_id),
    'handoff',
    format('🤖 Handoff para humano. Motivo: %s. Contexto: %s',
      v_reason, COALESCE(p_context_summary, 'N/A')),
    v_card.org_id,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'reason', v_reason,
    'contact_name', COALESCE(v_contact.nome, '') || ' ' || COALESCE(v_contact.sobrenome, '')
  );
END;
$$;

-- ============================================================
-- 2. agent_check_calendar — conserta generate_series de horários
-- ============================================================
CREATE OR REPLACE FUNCTION public.agent_check_calendar(
  p_owner_id UUID,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_to DATE;
  v_busy_slots JSONB;
  v_available_slots JSONB;
  v_profile_nome TEXT;
BEGIN
  v_date_to := COALESCE(p_date_to, p_date_from + INTERVAL '7 days');

  SELECT nome INTO v_profile_nome FROM profiles WHERE id = p_owner_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'date', t.data_vencimento::DATE,
      'time', to_char(t.data_vencimento, 'HH24:MI'),
      'title', t.titulo,
      'duration_min', 30
    )
    ORDER BY t.data_vencimento
  )
  INTO v_busy_slots
  FROM tarefas t
  WHERE t.responsavel_id = p_owner_id
    AND t.tipo = 'reuniao'
    AND t.status IN ('agendada', 'pendente')
    AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to;

  -- Slots disponíveis — usar timestamp em generate_series (time→time não existe)
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(p_date_from::timestamp, v_date_to::timestamp, '1 day') d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
  ),
  time_slots AS (
    SELECT s::time AS slot_time
    FROM generate_series(
      timestamp '2000-01-01 09:00',
      timestamp '2000-01-01 17:30',
      interval '30 minutes'
    ) s
  ),
  slots AS (
    SELECT d.day, ts.slot_time
    FROM days d CROSS JOIN time_slots ts
  ),
  busy AS (
    SELECT
      (t.data_vencimento)::date AS busy_day,
      (t.data_vencimento)::time AS busy_start,
      ((t.data_vencimento) + interval '30 minutes')::time AS busy_end
    FROM tarefas t
    WHERE t.responsavel_id = p_owner_id
      AND t.tipo = 'reuniao'
      AND t.status IN ('agendada', 'pendente')
      AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', to_char(s.day, 'YYYY-MM-DD'),
    'time', to_char(s.slot_time, 'HH24:MI'),
    'weekday', to_char(s.day, 'Dy')
  ) ORDER BY s.day, s.slot_time), '[]'::jsonb)
  INTO v_available_slots
  FROM slots s
  LEFT JOIN busy b
    ON s.day = b.busy_day
   AND s.slot_time >= b.busy_start
   AND s.slot_time < b.busy_end
  WHERE b.busy_day IS NULL
    AND (s.day > CURRENT_DATE OR (s.day = CURRENT_DATE AND s.slot_time > CURRENT_TIME));

  RETURN jsonb_build_object(
    'owner_name', COALESCE(v_profile_nome, 'Consultor'),
    'date_from', p_date_from,
    'date_to', v_date_to,
    'busy_slots', COALESCE(v_busy_slots, '[]'::jsonb),
    'available_slots', v_available_slots
  );
END;
$$;
