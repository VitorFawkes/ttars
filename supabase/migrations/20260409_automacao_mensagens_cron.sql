-- ============================================================================
-- pg_cron jobs para automação de mensagens
-- ============================================================================

-- 1. Processor: a cada 1 minuto, processa fila de execuções
SELECT cron.schedule(
  'automacao-mensagem-processor',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/automacao-mensagem-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. Trigger temporal: 1x por dia às 9h UTC (6h São Paulo)
SELECT cron.schedule(
  'automacao-trigger-temporal',
  '0 9 * * *',  -- 9:00 UTC = 6:00 São Paulo
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/automacao-trigger-temporal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. RPC auxiliar para contar métricas (usada pelo processor)
CREATE OR REPLACE FUNCTION count_automacao_metrics(p_regra_id UUID)
RETURNS TABLE(
  total_disparados INT,
  total_enviados INT,
  total_entregues INT,
  total_lidos INT,
  total_respondidos INT,
  total_falhas INT,
  total_skipped INT
) AS $$
  SELECT
    COUNT(*)::INT AS total_disparados,
    COUNT(*) FILTER (WHERE status = 'enviado')::INT AS total_enviados,
    COUNT(*) FILTER (WHERE status = 'entregue')::INT AS total_entregues,
    COUNT(*) FILTER (WHERE status = 'lido')::INT AS total_lidos,
    COUNT(*) FILTER (WHERE status = 'respondido')::INT AS total_respondidos,
    COUNT(*) FILTER (WHERE status = 'falhou')::INT AS total_falhas,
    COUNT(*) FILTER (WHERE status = 'skipped')::INT AS total_skipped
  FROM automacao_execucoes
  WHERE regra_id = p_regra_id;
$$ LANGUAGE sql STABLE;

-- 4. RPC auxiliar: cards sem contato WhatsApp por X dias
CREATE OR REPLACE FUNCTION cards_sem_contato_whatsapp(
  p_produto TEXT,
  p_cutoff TIMESTAMPTZ,
  p_limit INT DEFAULT 200
)
RETURNS TABLE(card_id UUID, pessoa_principal_id UUID, org_id UUID) AS $$
  SELECT c.id AS card_id, c.pessoa_principal_id, c.org_id
  FROM cards c
  WHERE c.produto::TEXT = p_produto
    AND c.status_comercial = 'aberto'
    AND c.pessoa_principal_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM whatsapp_messages wm
      WHERE wm.card_id = c.id
        AND wm.created_at > p_cutoff
    )
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- 5. RPC auxiliar: contatos com aniversário hoje que têm cards ativos
CREATE OR REPLACE FUNCTION contatos_aniversario_hoje(
  p_month INT,
  p_day INT,
  p_produto TEXT,
  p_limit INT DEFAULT 200
)
RETURNS TABLE(contato_id UUID, card_id UUID, org_id UUID) AS $$
  SELECT DISTINCT ON (ct.id)
    ct.id AS contato_id,
    c.id AS card_id,
    c.org_id
  FROM contatos ct
  JOIN cards c ON c.pessoa_principal_id = ct.id
  WHERE EXTRACT(MONTH FROM ct.data_nascimento) = p_month
    AND EXTRACT(DAY FROM ct.data_nascimento) = p_day
    AND c.produto::TEXT = p_produto
    AND c.status_comercial IN ('aberto', 'ganho')
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
