DROP FUNCTION IF EXISTS public.agent_check_calendar(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS public.agent_check_calendar(UUID, DATE, DATE, UUID);

CREATE OR REPLACE FUNCTION public.agent_check_calendar(
  p_owner_id UUID,
  p_date_from DATE DEFAULT CURRENT_DATE,
  p_date_to DATE DEFAULT NULL,
  p_org_id UUID DEFAULT NULL
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

  -- Busy slots — reuniões já marcadas pra esse responsável.
  -- v3 (07/05/2026): filtro defensivo de org_id quando passado. Sem isso, se a
  -- mesma pessoa for membro de mais de uma org, ocupação cruza entre produtos
  -- (ex: Wedding Planner também recebendo task de TRIPS confunde a agenda
  -- exibida pra Estela). p_org_id=NULL mantém comportamento legacy.
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
    AND t.tipo IN ('reuniao', 'reuniao_video', 'reuniao_presencial', 'reuniao_telefone')
    AND t.status IN ('agendada', 'pendente')
    AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to
    AND (p_org_id IS NULL OR t.org_id = p_org_id);

  -- Slots disponíveis — gera 9h-17h30 em 30min em dias úteis, exclui já marcados.
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
      AND t.tipo IN ('reuniao', 'reuniao_video', 'reuniao_presencial', 'reuniao_telefone')
      AND t.status IN ('agendada', 'pendente')
      AND t.data_vencimento::DATE BETWEEN p_date_from AND v_date_to
      AND (p_org_id IS NULL OR t.org_id = p_org_id)
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
    'busy_slots', COALESCE(v_busy_slots, '[]'::jsonb),
    'available_slots', v_available_slots,
    'org_id_filter', p_org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_check_calendar(UUID, DATE, DATE, UUID) TO service_role;

COMMENT ON FUNCTION public.agent_check_calendar(UUID, DATE, DATE, UUID) IS
'v3 (2026-05-07): busca agenda de reunião do responsável. Retorna busy_slots e available_slots. Filtra tipo IN reuniao* (antes só "reuniao" puro perdia reuniao_video). p_org_id opcional filtra defensivamente por org pra evitar contaminação cross-produto quando responsável é membro de múltiplas orgs.';
