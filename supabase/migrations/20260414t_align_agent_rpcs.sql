-- ============================================================================
-- Align agent_* RPCs with julia_* to improve parity
-- SAFE CHANGES ONLY: guards + profile enrichment + audit trail
-- ============================================================================

-- ============================================================================
-- 1. AGENT_CHECK_CALENDAR — Add available slots calculation + profile name
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_check_calendar(
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
  -- Default: proximos 7 dias (same as agent version)
  v_date_to := COALESCE(p_date_to, p_date_from + INTERVAL '7 days');

  -- Nome do profile para contexto (NEW)
  SELECT nome INTO v_profile_nome FROM profiles WHERE id = p_owner_id;

  -- Buscar tarefas tipo reuniao ja agendadas no periodo
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

  -- Slots disponíveis (NEW) — 30min, seg-sex, 9:00-17:30, excluindo ocupados
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(p_date_from::timestamp, v_date_to::timestamp, '1 day') d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5  -- Seg-Sex
  ),
  slots AS (
    SELECT day, s AS slot_time
    FROM days, generate_series('09:00'::time, '17:30'::time, '30 minutes') s
  ),
  busy AS (
    SELECT
      (t.data_vencimento)::date AS busy_day,
      (t.data_vencimento)::time AS busy_start,
      ((t.data_vencimento) + (30 || ' minutes')::interval)::time AS busy_end
    FROM tarefas t
    WHERE t.responsavel_id = p_owner_id
      AND t.tipo = 'reuniao'
      AND t.status IN ('agendada', 'pendente')
      AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', to_char(s.day, 'YYYY-MM-DD'),
    'weekday', to_char(s.day, 'TMDy'),
    'time', to_char(s.slot_time, 'HH24:MI')
  ) ORDER BY s.day, s.slot_time), '[]'::jsonb)
  INTO v_available_slots
  FROM slots s
  WHERE NOT EXISTS (
    SELECT 1 FROM busy b
    WHERE b.busy_day = s.day
      AND s.slot_time >= b.busy_start
      AND s.slot_time < b.busy_end
  )
  -- Apenas slots futuros
  AND (s.day > CURRENT_DATE OR (s.day = CURRENT_DATE AND s.slot_time > (NOW())::time))
  LIMIT 10;

  RETURN jsonb_build_object(
    'profile_nome', COALESCE(v_profile_nome, ''),
    'owner_id', p_owner_id,
    'date_from', p_date_from,
    'date_to', v_date_to,
    'booked_slots', COALESCE(v_busy_slots, '[]'::JSONB),
    'available_slots', COALESCE(v_available_slots, '[]'::JSONB),
    'working_hours', jsonb_build_object(
      'start', '09:00',
      'end', '17:30',
      'days', ARRAY['mon', 'tue', 'wed', 'thu', 'fri'],
      'slot_duration_min', 30,
      'timezone', 'America/Sao_Paulo'
    )
  );
END;
$$;

-- ============================================================================
-- 2. AGENT_REQUEST_HANDOFF — Add guard + contact enrichment + audit type
-- ============================================================================

CREATE OR REPLACE FUNCTION agent_request_handoff(
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
  -- Validar razão (enum)
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

  -- Atualizar card: marcar que humano assumiu
  -- NEW: Adicionar guard (só se estava em 'ia')
  UPDATE cards
  SET
    ai_responsavel = 'humano',
    updated_at = now()
  WHERE id = p_card_id
    AND ai_responsavel = 'ia'
  RETURNING id, titulo, responsavel_id, pessoa_principal_id INTO v_card;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'card_not_found_or_not_ia'
    );
  END IF;

  -- NEW: Buscar contato para contexto enriquecido
  SELECT * INTO v_contact FROM contatos WHERE id = v_card.pessoa_principal_id;

  -- Criar atividade de registro (NEW: tipo = 'handoff', não 'nota')
  INSERT INTO activities (card_id, profile_id, tipo, conteudo, created_at)
  VALUES (
    p_card_id,
    v_card.responsavel_id,
    'handoff',
    format('🤖 Handoff para humano. Motivo: %s. Contexto: %s',
      v_reason, COALESCE(p_context_summary, 'N/A')),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', p_card_id,
    'assigned_to', v_card.responsavel_id,
    'contact_name', COALESCE(v_contact.nome, '') || ' ' || COALESCE(v_contact.sobrenome, ''),
    'contact_phone', COALESCE(v_contact.telefone, ''),
    'reason', v_reason
  );
END;
$$;

-- ============================================================================
-- NOTE: agent_assign_tag left unchanged
-- Reason: Julia still uses different schema (card_tags vs tags table)
-- Will be deprecated when Julia becomes ai_agents record (Frente B)
-- ============================================================================
