-- Gap 2 fix: RPC list_scheduled_jobs_with_status estava com timeout porque a
-- subquery escaneava todo cron.job_run_details (histórico inteiro). Troca por
-- LATERAL join com LIMIT 1 e filtro por jobid (usa o índice natural da tabela).

CREATE OR REPLACE FUNCTION list_scheduled_jobs_with_status()
RETURNS TABLE(
  job_name TEXT,
  label TEXT,
  description TEXT,
  category TEXT,
  is_enabled BOOLEAN,
  frequency_label TEXT,
  last_toggled_at TIMESTAMPTZ,
  last_toggled_by UUID,
  cron_registered BOOLEAN,
  last_run_started_at TIMESTAMPTZ,
  last_run_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    s.job_name,
    s.label,
    s.description,
    s.category,
    s.is_enabled,
    s.frequency_label,
    s.last_toggled_at,
    s.last_toggled_by,
    (j.jobid IS NOT NULL) AS cron_registered,
    r.start_time AS last_run_started_at,
    r.status    AS last_run_status
  FROM scheduled_job_kill_switch s
  LEFT JOIN cron.job j ON j.jobname = s.job_name
  LEFT JOIN LATERAL (
    SELECT rd.start_time, rd.status
    FROM cron.job_run_details rd
    WHERE rd.jobid = j.jobid
    ORDER BY rd.start_time DESC
    LIMIT 1
  ) r ON TRUE
  ORDER BY s.category, s.label;
$$;

GRANT EXECUTE ON FUNCTION list_scheduled_jobs_with_status() TO authenticated;
