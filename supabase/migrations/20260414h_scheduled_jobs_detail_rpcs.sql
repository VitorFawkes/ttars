-- Gap 2: RPCs de detalhe por processo agendado (últimas execuções + alvos)

-- ============================================================================
-- 1. Últimas execuções de um processo (lê cron.job_run_details)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_scheduled_job_recent_runs(
  p_job_name TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE(
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT,
  return_message TEXT,
  duration_ms BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    r.start_time,
    r.end_time,
    r.status,
    r.return_message,
    EXTRACT(EPOCH FROM (r.end_time - r.start_time))::BIGINT * 1000 AS duration_ms
  FROM cron.job j
  JOIN cron.job_run_details r ON r.jobid = j.jobid
  WHERE j.jobname = p_job_name
  ORDER BY r.start_time DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;

GRANT EXECUTE ON FUNCTION get_scheduled_job_recent_runs(TEXT, INT) TO authenticated;

-- ============================================================================
-- 2. Alvos (regras/items) que esse processo executa
-- ============================================================================
CREATE OR REPLACE FUNCTION get_scheduled_job_targets(p_job_name TEXT)
RETURNS TABLE(
  target_kind TEXT,
  target_id TEXT,
  target_label TEXT,
  target_sublabel TEXT,
  is_active BOOLEAN,
  status_label TEXT,
  link_path TEXT,
  last_activity_at TIMESTAMPTZ,
  extras JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- === automacao-mensagem-processor: regras de evento ativas ===
  IF p_job_name = 'automacao-mensagem-processor' THEN
    RETURN QUERY
      SELECT
        'automacao_regra'::TEXT,
        r.id::TEXT,
        r.nome::TEXT,
        COALESCE(r.trigger_type::TEXT, 'evento')::TEXT,
        r.ativa,
        CASE WHEN r.ativa THEN 'Ativa' ELSE 'Pausada' END,
        ('/settings/automations/trigger/' || r.id::TEXT)::TEXT,
        r.updated_at,
        jsonb_build_object('trigger_type', r.trigger_type)
      FROM automacao_regras r
      WHERE r.trigger_type NOT IN (
        'dias_no_stage','dias_sem_contato','sem_resposta_horas',
        'dias_antes_viagem','dias_apos_viagem','aniversario_contato'
      )
      ORDER BY r.ativa DESC, r.nome;
    RETURN;
  END IF;

  -- === automacao-trigger-temporal: regras temporais ===
  IF p_job_name = 'automacao-trigger-temporal' THEN
    RETURN QUERY
      SELECT
        'automacao_regra'::TEXT,
        r.id::TEXT,
        r.nome::TEXT,
        r.trigger_type::TEXT,
        r.ativa,
        CASE WHEN r.ativa THEN 'Ativa' ELSE 'Pausada' END,
        ('/settings/automations/trigger/' || r.id::TEXT)::TEXT,
        r.updated_at,
        jsonb_build_object('trigger_type', r.trigger_type)
      FROM automacao_regras r
      WHERE r.trigger_type IN (
        'dias_no_stage','dias_sem_contato','sem_resposta_horas',
        'dias_antes_viagem','dias_apos_viagem','aniversario_contato'
      )
      ORDER BY r.ativa DESC, r.nome;
    RETURN;
  END IF;

  -- === process-cadence-engine: templates de cadência ===
  IF p_job_name = 'process-cadence-engine' THEN
    RETURN QUERY
      SELECT
        'cadence_template'::TEXT,
        t.id::TEXT,
        t.name::TEXT,
        (COALESCE(active_cnt.cnt, 0)::TEXT || ' cadências em andamento')::TEXT,
        t.is_active,
        CASE WHEN t.is_active THEN 'Ativa' ELSE 'Pausada' END,
        ('/settings/automations/' || t.id::TEXT)::TEXT,
        t.updated_at,
        jsonb_build_object(
          'active_instances', COALESCE(active_cnt.cnt, 0),
          'execution_mode', t.execution_mode
        )
      FROM cadence_templates t
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::INT AS cnt
        FROM cadence_instances ci
        WHERE ci.template_id = t.id
          AND ci.status IN ('active','waiting_task')
      ) active_cnt ON TRUE
      ORDER BY t.is_active DESC, active_cnt.cnt DESC NULLS LAST, t.name;
    RETURN;
  END IF;

  -- === roteamento-pos-venda-trips: regras de roteamento ativas ===
  IF p_job_name = 'roteamento-pos-venda-trips' THEN
    RETURN QUERY
      SELECT
        'roteamento'::TEXT,
        et.id::TEXT,
        et.name::TEXT,
        'Roteamento diário'::TEXT,
        et.is_active,
        CASE WHEN et.is_active THEN 'Ativo' ELSE 'Pausado' END,
        ('/settings/automations/roteamento/' || et.id::TEXT)::TEXT,
        et.updated_at,
        jsonb_build_object('event_type', et.event_type)
      FROM cadence_event_triggers et
      WHERE et.event_type = 'cron_roteamento'
      ORDER BY et.is_active DESC, et.name;
    RETURN;
  END IF;

  -- === monde-people-dispatch: fila pendente ===
  IF p_job_name = 'monde-people-dispatch' THEN
    RETURN QUERY
      SELECT
        'monde_queue'::TEXT,
        q.id::TEXT,
        COALESCE(c.nome, 'Contato ' || q.contato_id::TEXT)::TEXT,
        q.event_type::TEXT,
        (q.status = 'pending'),
        q.status::TEXT,
        ('/contacts/' || q.contato_id::TEXT)::TEXT,
        q.created_at,
        jsonb_build_object('event_type', q.event_type)
      FROM monde_people_queue q
      LEFT JOIN contatos c ON c.id = q.contato_id
      WHERE q.status IN ('pending','processing','failed')
      ORDER BY q.created_at DESC
      LIMIT 50;
    RETURN;
  END IF;

  -- === monde-people-import: últimas importações ===
  IF p_job_name = 'monde-people-import' THEN
    RETURN QUERY
      SELECT
        'monde_import'::TEXT,
        l.id::TEXT,
        COALESCE(l.file_name, 'Import ' || l.id::TEXT)::TEXT,
        (COALESCE(l.products_imported, 0)::TEXT || ' produtos, '
         || COALESCE(l.matched_cards, 0)::TEXT || ' cards vinculados')::TEXT,
        (l.status IN ('success','pending','processing')),
        l.status::TEXT,
        ('/integrations/monde')::TEXT,
        l.created_at,
        jsonb_build_object('products_imported', l.products_imported)
      FROM monde_import_logs l
      ORDER BY l.created_at DESC
      LIMIT 20;
    RETURN;
  END IF;

  -- === future-opportunities + retry: oportunidades pendentes ===
  IF p_job_name IN ('process-future-opportunities','process-future-opportunities-retry') THEN
    RETURN QUERY
      SELECT
        'future_opportunity'::TEXT,
        fo.id::TEXT,
        COALESCE(fo.titulo, 'Oportunidade futura')::TEXT,
        ('Agendada para ' || TO_CHAR(fo.scheduled_date, 'DD/MM/YYYY'))::TEXT,
        (fo.status = 'pending'),
        fo.status::TEXT,
        ('/cards/' || fo.source_card_id::TEXT)::TEXT,
        fo.created_at,
        jsonb_build_object(
          'source_type', fo.source_type,
          'scheduled_date', fo.scheduled_date
        )
      FROM future_opportunities fo
      WHERE fo.status IN ('pending','failed')
      ORDER BY fo.scheduled_date ASC NULLS LAST
      LIMIT 50;
    RETURN;
  END IF;

  -- job desconhecido: retorna vazio
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION get_scheduled_job_targets(TEXT) TO authenticated;
