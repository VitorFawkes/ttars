-- Gap 2 polish: adicionar tags de impacto real em cada processo agendado
-- para o admin entender o que pode acontecer com o cliente quando o processo roda.

ALTER TABLE scheduled_job_kill_switch
  ADD COLUMN IF NOT EXISTS impact_tags TEXT[] DEFAULT '{}'::TEXT[];

COMMENT ON COLUMN scheduled_job_kill_switch.impact_tags IS
  'Efeitos externos/visíveis: sends_message, creates_cards, moves_cards, syncs_contacts, creates_tasks';

-- Atualiza descrições e tags dos 8 processos seedados
UPDATE scheduled_job_kill_switch SET
  description = 'Lê a fila de automações ativas e dispara mensagens WhatsApp nos clientes. É o motor por trás das regras que você cria em Automações.',
  impact_tags = ARRAY['sends_message']
WHERE job_name = 'automacao-mensagem-processor';

UPDATE scheduled_job_kill_switch SET
  description = 'Uma vez por dia, verifica regras de tempo (aniversário do cliente, X dias parado em uma etapa, etc) e dispara as mensagens configuradas.',
  impact_tags = ARRAY['sends_message']
WHERE job_name = 'automacao-trigger-temporal';

UPDATE scheduled_job_kill_switch SET
  description = 'Motor que executa os passos de cada cadência em andamento. Pode criar tarefas pros vendedores, mandar mensagens WhatsApp pelos agentes IA e mover cards entre etapas.',
  impact_tags = ARRAY['sends_message', 'creates_tasks', 'moves_cards']
WHERE job_name = 'process-cadence-engine';

UPDATE scheduled_job_kill_switch SET
  description = 'Move cards da pós-venda Trips entre etapas conforme as datas de viagem (ex: "viagem começa amanhã" → etapa X). Não envia mensagem direta, mas a mudança de etapa pode disparar automações que enviam.',
  impact_tags = ARRAY['moves_cards']
WHERE job_name = 'roteamento-pos-venda-trips';

UPDATE scheduled_job_kill_switch SET
  description = 'Empurra para o Monde as mudanças de contatos feitas no CRM (nome, telefone, e-mail). Não envia nada pro cliente.',
  impact_tags = ARRAY['syncs_contacts']
WHERE job_name = 'monde-people-dispatch';

UPDATE scheduled_job_kill_switch SET
  description = 'Busca contatos novos/atualizados no Monde e traz pro CRM. Não envia nada pro cliente.',
  impact_tags = ARRAY['syncs_contacts']
WHERE job_name = 'monde-people-import';

UPDATE scheduled_job_kill_switch SET
  description = 'Cria cards ou sub-cards em datas programadas (ex: retornar 6 meses depois da viagem). Os cards novos podem disparar automações que enviam mensagem, dependendo das regras configuradas.',
  impact_tags = ARRAY['creates_cards']
WHERE job_name = 'process-future-opportunities';

UPDATE scheduled_job_kill_switch SET
  description = 'Retenta criar cards de oportunidades futuras que falharam no run principal do dia.',
  impact_tags = ARRAY['creates_cards']
WHERE job_name = 'process-future-opportunities-retry';

-- Atualizar RPC para incluir impact_tags (drop + recreate porque return type mudou)
DROP FUNCTION IF EXISTS list_scheduled_jobs_with_status();
CREATE FUNCTION list_scheduled_jobs_with_status()
RETURNS TABLE(
  job_name TEXT,
  label TEXT,
  description TEXT,
  category TEXT,
  is_enabled BOOLEAN,
  frequency_label TEXT,
  impact_tags TEXT[],
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
    s.impact_tags,
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
