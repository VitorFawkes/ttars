-- Analytics v2 — Fase 1 (Business hours)
-- Plano: Bloco 6.
--
-- Adiciona organizations.business_hours (JSONB) e a funcao utilitaria
-- public.fn_business_minutes_between(a, b, org_id) RETURNS INT que calcula
-- a diferenca em minutos considerando horario comercial (lunes a viernes,
-- janela configurada por org). Usada em: analytics_sla_summary, FRT, handoff
-- speed, dropped balls.
--
-- Default (quando business_hours IS NULL ou chave faltando):
--   start=09:00, end=18:00, timezone=America/Sao_Paulo, work_days=[1,2,3,4,5]
--
-- Se org desativar business_hours (set para 'null'::jsonb ou
-- {"disabled": true}), a funcao cai em wall-clock (EXTRACT(EPOCH).../60).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Coluna
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_hours JSONB;

COMMENT ON COLUMN public.organizations.business_hours IS
  'Analytics v2: janela de horario comercial. {"start":"09:00","end":"18:00","timezone":"America/Sao_Paulo","work_days":[1,2,3,4,5]}. NULL = usa default (9h-18h BRT seg-sex). {"disabled":true} = ignora business hours e usa wall-clock.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Funcao fn_business_minutes_between
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_business_minutes_between(
  p_a TIMESTAMPTZ,
  p_b TIMESTAMPTZ,
  p_org_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start        TIME := '09:00';
  v_end          TIME := '18:00';
  v_tz           TEXT := 'America/Sao_Paulo';
  v_work_days    INT[] := ARRAY[1, 2, 3, 4, 5]; -- seg-sex (ISO dow)
  v_config       JSONB;
  v_disabled     BOOLEAN := FALSE;
  v_minutes      INT := 0;
  v_cursor       TIMESTAMPTZ;
  v_day_start    TIMESTAMPTZ;
  v_day_end      TIMESTAMPTZ;
  v_slice_start  TIMESTAMPTZ;
  v_slice_end    TIMESTAMPTZ;
  v_dow          INT;
BEGIN
  IF p_a IS NULL OR p_b IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_a >= p_b THEN
    RETURN 0;
  END IF;

  -- Resolver config da org
  IF p_org_id IS NOT NULL THEN
    SELECT business_hours INTO v_config FROM public.organizations WHERE id = p_org_id;
    IF v_config IS NOT NULL THEN
      v_disabled := COALESCE((v_config->>'disabled')::boolean, FALSE);
      IF NOT v_disabled THEN
        v_start := COALESCE((v_config->>'start')::time, v_start);
        v_end   := COALESCE((v_config->>'end')::time, v_end);
        v_tz    := COALESCE(v_config->>'timezone', v_tz);
        IF jsonb_typeof(v_config->'work_days') = 'array' THEN
          SELECT array_agg((e)::int)
            INTO v_work_days
            FROM jsonb_array_elements_text(v_config->'work_days') e;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Fallback wall-clock se desligado
  IF v_disabled THEN
    RETURN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (p_b - p_a)) / 60))::int;
  END IF;

  -- Varrer dia a dia somando os slices que caem na janela de trabalho
  v_cursor := p_a;
  WHILE v_cursor < p_b LOOP
    -- Data em zone da org (para saber o dow e montar janela)
    v_dow := EXTRACT(ISODOW FROM (v_cursor AT TIME ZONE v_tz))::int;

    IF v_dow = ANY(v_work_days) THEN
      v_day_start := ((date_trunc('day', v_cursor AT TIME ZONE v_tz) + v_start) AT TIME ZONE v_tz);
      v_day_end   := ((date_trunc('day', v_cursor AT TIME ZONE v_tz) + v_end)   AT TIME ZONE v_tz);

      v_slice_start := GREATEST(v_cursor, v_day_start);
      v_slice_end   := LEAST(p_b, v_day_end);

      IF v_slice_end > v_slice_start THEN
        v_minutes := v_minutes + FLOOR(EXTRACT(EPOCH FROM (v_slice_end - v_slice_start)) / 60)::int;
      END IF;
    END IF;

    -- Avancar para o comeco do proximo dia no tz da org
    v_cursor := ((date_trunc('day', v_cursor AT TIME ZONE v_tz) + INTERVAL '1 day') AT TIME ZONE v_tz);
  END LOOP;

  RETURN v_minutes;
END;
$$;

COMMENT ON FUNCTION public.fn_business_minutes_between(TIMESTAMPTZ, TIMESTAMPTZ, UUID) IS
  'Analytics v2: diferenca em minutos entre p_a e p_b respeitando horario comercial da org (9h-18h BRT seg-sex por padrao). Usado em SLA, FRT, handoff speed.';

-- Permissoes padrao (SELECT-like)
GRANT EXECUTE ON FUNCTION public.fn_business_minutes_between(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, anon, service_role;

COMMIT;
