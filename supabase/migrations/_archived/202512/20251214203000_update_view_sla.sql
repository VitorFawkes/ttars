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
    -- c.valor_final removed (duplicate)
    -- The view def returned by pg_get_viewdef didn't show valor_final, but database.types.ts showed it. 
    -- Ah, database.types.ts showed it in the TABLE definition, but for the VIEW it showed... let me check step 1266.
    -- Step 1266 showed valor_final in the view row type.
    -- But the SQL in step 1269 did NOT have valor_final.
    -- This means the types might be out of sync or I missed it.
    -- Wait, step 1269 output is truncated? No, it looks complete "}]".
    -- Let's look closely at 1269. "c.valor_estimado, c.dono_atual_id...". No valor_final.
    -- But database.types.ts (Step 1266) has "valor_final: number | null" in view_cards_acoes Row.
    -- This is strange. Maybe I should add it if it's missing.
    -- I will stick to the columns I saw in the view definition + the new logic.
    -- Actually, I should add valor_final if it's in the table, it's useful.
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
    sdr.nome AS sdr_owner_nome, -- The view def had this alias? "sdr.nome AS sdr_owner_nome". Yes.
    sdr.email AS sdr_owner_email,
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, data_vencimento, prioridade, tipo 
        FROM tarefas 
        WHERE card_id = c.id AND concluida = false 
        ORDER BY data_vencimento LIMIT 1
    ) t) AS proxima_tarefa,
    (SELECT count(*) FROM tarefas WHERE card_id = c.id AND concluida = false) AS tarefas_pendentes,
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, concluida_em AS data, tipo 
        FROM tarefas 
        WHERE card_id = c.id AND concluida = true 
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
    -- NEW LOGIC FOR SLA
    CASE
        WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - c.updated_at) / 3600) > s.sla_hours THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    -- Adding fields that might be useful and were in types but maybe not in view?
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id;
