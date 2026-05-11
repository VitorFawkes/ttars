DROP VIEW IF EXISTS view_dashboard_funil;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

CREATE OR REPLACE VIEW view_cards_acoes AS
SELECT 
    c.id,
    c.titulo,
    c.produto,
    c.pipeline_id,
    c.pipeline_stage_id,
    c.pessoa_principal_id,
    c.valor_estimado,
    c.dono_atual_id,
    c.sdr_owner_id,
    c.vendas_owner_id,
    c.pos_owner_id,
    c.concierge_owner_id,
    c.status_comercial,
    c.produto_data,
    c.cliente_recorrente,
    c.prioridade,
    c.data_viagem_inicio,
    c.created_at,
    c.updated_at,
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,
    pe.nome AS pessoa_nome,
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, data_vencimento, prioridade, tipo 
        FROM tarefas 
        WHERE card_id = c.id AND tarefas.concluida = false 
        ORDER BY data_vencimento LIMIT 1
    ) t) AS proxima_tarefa,
    (SELECT count(*) FROM tarefas WHERE card_id = c.id AND tarefas.concluida = false) AS tarefas_pendentes,
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, concluida_em AS data, tipo 
        FROM tarefas 
        WHERE card_id = c.id AND tarefas.concluida = true 
        ORDER BY concluida_em DESC LIMIT 1
    ) t) AS ultima_interacao,
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento' AS status_taxa,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())
        ELSE NULL
    END AS dias_ate_viagem,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30 THEN 100
        ELSE 0
    END AS urgencia_viagem,
    EXTRACT(day FROM now() - c.updated_at) AS tempo_etapa_dias,
    CASE
        WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - c.updated_at) / 3600) > s.sla_hours THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    -- Appending new columns
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id;
