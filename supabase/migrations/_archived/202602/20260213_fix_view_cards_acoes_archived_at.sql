-- Fix view_cards_acoes to include archived_at column
-- Required by frontend filter: archived_at=is.null
CREATE OR REPLACE VIEW public.view_cards_acoes AS
SELECT c.id,
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
    c.data_fechamento,
    c.briefing_inicial,
    c.marketing_data,
    c.parent_card_id,
    c.is_group_parent,
    c.ganho_sdr,
    c.ganho_sdr_at,
    c.ganho_planner,
    c.ganho_planner_at,
    c.ganho_pos,
    c.ganho_pos_at,
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,
    pe.nome AS pessoa_nome,
    pe.telefone AS pessoa_telefone,
    pe.email AS pessoa_email,
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT tarefas.id,
                    tarefas.titulo,
                    tarefas.data_vencimento,
                    tarefas.prioridade,
                    tarefas.tipo
                   FROM public.tarefas
                  WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)
                  ORDER BY tarefas.data_vencimento, tarefas.created_at DESC, tarefas.id DESC
                 LIMIT 1) t) AS proxima_tarefa,
    ( SELECT count(*) AS count
           FROM public.tarefas
          WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)) AS tarefas_pendentes,
    ( SELECT count(*) AS count
           FROM public.tarefas
          WHERE tarefas.card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND tarefas.data_vencimento < CURRENT_DATE AND (tarefas.status IS NULL OR tarefas.status <> 'reagendada'::text)) AS tarefas_atrasadas,
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT tarefas.id,
                    tarefas.titulo,
                    tarefas.concluida_em AS data,
                    tarefas.tipo
                   FROM public.tarefas
                  WHERE tarefas.card_id = c.id AND tarefas.concluida = true
                  ORDER BY tarefas.concluida_em DESC
                 LIMIT 1) t) AS ultima_interacao,
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento'::text AS status_taxa,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())
            ELSE NULL::numeric
        END AS dias_ate_viagem,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30::numeric THEN 100
            ELSE 0
        END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
        CASE
            WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600::numeric) > s.sla_hours::numeric THEN 1
            ELSE 0
        END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos'::text AS destinos,
    c.produto_data -> 'orcamento'::text AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome,
    c.archived_at
   FROM public.cards c
     LEFT JOIN public.pipeline_stages s ON c.pipeline_stage_id = s.id
     LEFT JOIN public.pipelines p ON c.pipeline_id = p.id
     LEFT JOIN public.contatos pe ON c.pessoa_principal_id = pe.id
     LEFT JOIN public.profiles pr ON c.dono_atual_id = pr.id
     LEFT JOIN public.profiles sdr ON c.sdr_owner_id = sdr.id
     LEFT JOIN public.profiles vendas ON c.vendas_owner_id = vendas.id
  WHERE c.deleted_at IS NULL;
