-- =====================================================================
-- Módulo Concierge — Marco 1 (Fundação)
-- 20260427b: views v_meu_dia_concierge e v_atendimentos_lote
-- =====================================================================

-- View principal pra Meu Dia (cockpit do concierge)
DROP VIEW IF EXISTS v_meu_dia_concierge;
CREATE VIEW v_meu_dia_concierge AS
SELECT
  -- Tarefa
  t.id AS tarefa_id,
  t.titulo,
  t.descricao,
  t.data_vencimento,
  t.prioridade,
  t.status AS tarefa_status,
  t.concluida,
  t.concluida_em,
  t.responsavel_id AS dono_id,
  t.card_id,
  t.created_by AS tarefa_criada_por,
  t.created_at AS tarefa_criada_em,

  -- Card / Viagem
  c.titulo AS card_titulo,
  c.produto,
  c.data_viagem_inicio,
  c.data_viagem_fim,
  c.pipeline_stage_id,
  c.pessoa_principal_id,
  c.valor_estimado AS card_valor_estimado,
  c.valor_final AS card_valor_final,

  -- Atendimento (complemento)
  ac.id AS atendimento_id,
  ac.tipo_concierge,
  ac.categoria,
  ac.source,
  ac.cadence_step_id,
  ac.origem_descricao,
  ac.valor,
  ac.moeda,
  ac.cobrado_de,
  ac.outcome,
  ac.outcome_em,
  ac.outcome_por,
  ac.trip_item_id,
  ac.hospedagem_ref,
  ac.notificou_cliente_em,
  ac.payload,
  ac.created_at AS atendimento_criado_em,

  -- Cálculos úteis
  CASE
    WHEN t.concluida THEN 'concluido'
    WHEN ac.outcome IS NOT NULL AND ac.outcome <> 'aceito' THEN 'fechado'
    WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento < now() AND t.concluida = false
      THEN 'vencido'
    WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento::date = current_date
      THEN 'hoje'
    WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento::date <= (current_date + interval '7 days')::date
      THEN 'esta_semana'
    ELSE 'futuro'
  END AS status_apresentacao,

  CASE
    WHEN c.data_viagem_inicio IS NOT NULL THEN
      EXTRACT(DAY FROM (c.data_viagem_inicio - now()))::INT
    ELSE NULL
  END AS dias_pra_embarque

FROM tarefas t
INNER JOIN atendimentos_concierge ac ON ac.tarefa_id = t.id
INNER JOIN cards c ON c.id = t.card_id
WHERE t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND ac.org_id = requesting_org_id();

COMMENT ON VIEW v_meu_dia_concierge IS
  'View principal pra Meu Dia: junta tarefas + atendimentos_concierge + cards.
   Usada em /concierge (Meu Dia), filtrada no front por dono_id, status_apresentacao etc.';

-- View pra modo Em Lote: agrupa atendimentos pendentes por categoria + janela de embarque
DROP VIEW IF EXISTS v_atendimentos_lote;
CREATE VIEW v_atendimentos_lote AS
SELECT
  ac.categoria,
  ac.tipo_concierge,
  CASE
    WHEN c.data_viagem_inicio IS NULL THEN 'sem_data'
    WHEN c.data_viagem_inicio < now() THEN 'em_andamento'
    WHEN c.data_viagem_inicio < (now() + interval '2 days') THEN 'embarca_48h'
    WHEN c.data_viagem_inicio < (now() + interval '7 days') THEN 'embarca_semana'
    WHEN c.data_viagem_inicio < (now() + interval '15 days') THEN 'embarca_15d'
    WHEN c.data_viagem_inicio < (now() + interval '30 days') THEN 'embarca_30d'
    ELSE 'embarca_futuro'
  END AS janela_embarque,
  COUNT(*) AS total_pendentes,
  ARRAY_AGG(ac.id ORDER BY c.data_viagem_inicio NULLS LAST) AS atendimento_ids,
  ARRAY_AGG(ac.tarefa_id ORDER BY c.data_viagem_inicio NULLS LAST) AS tarefa_ids,
  ARRAY_AGG(ac.card_id ORDER BY c.data_viagem_inicio NULLS LAST) AS card_ids,
  MIN(c.data_viagem_inicio) AS primeira_data_embarque,
  MAX(c.data_viagem_inicio) AS ultima_data_embarque
FROM atendimentos_concierge ac
INNER JOIN tarefas t ON t.id = ac.tarefa_id
INNER JOIN cards c ON c.id = ac.card_id
WHERE ac.outcome IS NULL
  AND t.concluida = false
  AND t.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND ac.org_id = requesting_org_id()
GROUP BY ac.categoria, ac.tipo_concierge,
  CASE
    WHEN c.data_viagem_inicio IS NULL THEN 'sem_data'
    WHEN c.data_viagem_inicio < now() THEN 'em_andamento'
    WHEN c.data_viagem_inicio < (now() + interval '2 days') THEN 'embarca_48h'
    WHEN c.data_viagem_inicio < (now() + interval '7 days') THEN 'embarca_semana'
    WHEN c.data_viagem_inicio < (now() + interval '15 days') THEN 'embarca_15d'
    WHEN c.data_viagem_inicio < (now() + interval '30 days') THEN 'embarca_30d'
    ELSE 'embarca_futuro'
  END
ORDER BY MIN(c.data_viagem_inicio) NULLS LAST;

COMMENT ON VIEW v_atendimentos_lote IS
  'View para modo Em Lote: agrupa atendimentos pendentes por categoria + janela de embarque.
   Concierge clica num grupo → executa em massa via rpc_executar_em_lote.';

-- View para badges/contadores no kanban e header do card
DROP VIEW IF EXISTS v_card_concierge_stats;
CREATE VIEW v_card_concierge_stats AS
SELECT
  ac.card_id,
  COUNT(*) FILTER (WHERE t.concluida = false AND ac.outcome IS NULL) AS ativos,
  COUNT(*) FILTER (WHERE t.concluida = false AND ac.outcome IS NULL
                   AND t.data_vencimento IS NOT NULL AND t.data_vencimento < now()) AS vencidos,
  COUNT(*) FILTER (WHERE t.concluida = true OR ac.outcome IS NOT NULL) AS concluidos,
  COALESCE(SUM(ac.valor) FILTER (WHERE ac.outcome = 'aceito' AND ac.cobrado_de = 'cliente'), 0)
    AS valor_vendido_extra,

  -- Tipo prioritário (pra ícone no kanban): vencido > suporte > oferta > reserva > operacional
  (
    SELECT ac2.tipo_concierge FROM atendimentos_concierge ac2
    INNER JOIN tarefas t2 ON t2.id = ac2.tarefa_id
    WHERE ac2.card_id = ac.card_id
      AND t2.concluida = false AND ac2.outcome IS NULL
    ORDER BY
      CASE WHEN t2.data_vencimento < now() THEN 0 ELSE 1 END,
      CASE ac2.tipo_concierge
        WHEN 'suporte' THEN 1 WHEN 'oferta' THEN 2
        WHEN 'reserva' THEN 3 WHEN 'operacional' THEN 4
      END,
      t2.data_vencimento NULLS LAST
    LIMIT 1
  ) AS tipo_prioritario
FROM atendimentos_concierge ac
INNER JOIN tarefas t ON t.id = ac.tarefa_id
WHERE t.deleted_at IS NULL
  AND ac.org_id = requesting_org_id()
GROUP BY ac.card_id;

COMMENT ON VIEW v_card_concierge_stats IS
  'Stats agregados de concierge por card. Usado em badges do kanban + header do card.';
