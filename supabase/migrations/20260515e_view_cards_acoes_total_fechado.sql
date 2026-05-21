-- ============================================================================
-- MIGRATION: view_cards_acoes ganha total_fechado + total_receita_items
-- Date: 2026-05-15
--
-- Por quê: cards.valor_final é zerado pelo trigger antigo enforce_card_value_rules
-- enquanto o card não está ganho/perdido. Isso impede o Kanban de mostrar o
-- "Fechado" (soma dos produtos cadastrados) em cards abertos — exatamente o
-- caso de Proposta Enviada e Reservas e Fechamento, onde a info mais importa.
--
-- Fix: a view view_cards_acoes (que alimenta o Kanban via usePipelineCards)
-- ganha duas colunas calculadas a partir de card_financial_items não-arquivados:
--   - total_fechado: SUM(sale_value)
--   - total_receita_items: SUM(sale_value - supplier_cost)
--
-- Sem mexer em cards.valor_final, sem trigger novo. Só estender a view.
--
-- Caso real: card 7702f9e2-c1e9-4309-994a-94ac9b08e8dc (Leonardo Lima / Bahia)
-- está em status_comercial='aberto' com 1 produto ativo (sale_value=3127.78).
-- ANTES: valor_final=NULL, valor_display=valor_estimado=6000 → Kanban mostra
--        orçamento previsto, não o fechado real.
-- DEPOIS: total_fechado=3127.78 disponível na view → Kanban mostra fechado real.
-- ============================================================================

CREATE OR REPLACE VIEW public.view_cards_acoes AS
 SELECT c.id,
    c.org_id,
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
    TRIM(BOTH FROM ((COALESCE(pe.nome, ''::text) || ' '::text) || COALESCE(pe.sobrenome, ''::text))) AS pessoa_nome,
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
                   FROM tarefas
                  WHERE ((tarefas.card_id = c.id) AND (tarefas.deleted_at IS NULL) AND (COALESCE(tarefas.concluida, false) = false) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))
                  ORDER BY tarefas.data_vencimento, tarefas.created_at DESC, tarefas.id DESC
                 LIMIT 1) t) AS proxima_tarefa,
    ( SELECT count(*) AS count
           FROM tarefas
          WHERE ((tarefas.card_id = c.id) AND (tarefas.deleted_at IS NULL) AND (COALESCE(tarefas.concluida, false) = false) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))) AS tarefas_pendentes,
    ( SELECT count(*) AS count
           FROM tarefas
          WHERE ((tarefas.card_id = c.id) AND (tarefas.deleted_at IS NULL) AND (COALESCE(tarefas.concluida, false) = false) AND (tarefas.data_vencimento < CURRENT_DATE) AND ((tarefas.status IS NULL) OR (tarefas.status <> 'reagendada'::text)))) AS tarefas_atrasadas,
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT tarefas.id,
                    tarefas.titulo,
                    tarefas.concluida_em AS data,
                    tarefas.tipo
                   FROM tarefas
                  WHERE ((tarefas.card_id = c.id) AND (tarefas.deleted_at IS NULL) AND (tarefas.concluida = true))
                  ORDER BY tarefas.concluida_em DESC
                 LIMIT 1) t) AS ultima_interacao,
    EXTRACT(day FROM (now() - c.updated_at)) AS tempo_sem_contato,
    (c.produto_data ->> 'taxa_planejamento'::text) AS status_taxa,
        CASE
            WHEN (c.data_viagem_inicio IS NOT NULL) THEN EXTRACT(day FROM (c.data_viagem_inicio - now()))
            ELSE NULL::numeric
        END AS dias_ate_viagem,
        CASE
            WHEN ((c.data_viagem_inicio IS NOT NULL) AND (EXTRACT(day FROM (c.data_viagem_inicio - now())) < (30)::numeric)) THEN 100
            ELSE 0
        END AS urgencia_viagem,
    EXTRACT(day FROM (now() - COALESCE(c.stage_entered_at, c.updated_at))) AS tempo_etapa_dias,
        CASE
            WHEN ((s.sla_hours IS NOT NULL) AND ((EXTRACT(epoch FROM (now() - COALESCE(c.stage_entered_at, c.updated_at))) / (3600)::numeric) > (s.sla_hours)::numeric)) THEN 1
            ELSE 0
        END AS urgencia_tempo_etapa,
    (c.produto_data -> 'destinos'::text) AS destinos,
    (c.produto_data -> 'orcamento'::text) AS orcamento,
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
    c.archived_at,
    COALESCE(ac.anexos_count, (0)::bigint) AS anexos_count,
    pe.telefone_normalizado AS pessoa_telefone_normalizado,
    ARRAY( SELECT cta.tag_id
           FROM card_tag_assignments cta
          WHERE (cta.card_id = c.id)) AS tag_ids,
    c.receita,
    c.receita_source,
    COALESCE(c.valor_final, c.valor_estimado, (0)::numeric) AS valor_display,
    COALESCE(prd.prods_total, (0)::bigint) AS prods_total,
    COALESCE(prd.prods_ready, (0)::bigint) AS prods_ready,
    c.card_type,
    c.sub_card_status,
    c.sub_card_category,
    (COALESCE(sc_count.active_count, (0)::bigint))::integer AS active_sub_cards_count,
    parent_card.titulo AS parent_card_title,
    concierge_prof.nome AS concierge_nome,
    pos_prof.nome AS pos_owner_nome,
    pp.slug AS phase_slug,
    c.skip_pos_venda,
    c.sdr_qualification_score_latest,
    -- ▼▼▼ NOVAS COLUNAS ▼▼▼
    COALESCE(prd.total_fechado, (0)::numeric) AS total_fechado,
    COALESCE(prd.total_receita_items, (0)::numeric) AS total_receita_items
   FROM (((((((((((((cards c
     LEFT JOIN pipeline_stages s ON ((c.pipeline_stage_id = s.id)))
     LEFT JOIN pipeline_phases pp ON ((s.phase_id = pp.id)))
     LEFT JOIN pipelines p ON ((c.pipeline_id = p.id)))
     LEFT JOIN contatos pe ON ((c.pessoa_principal_id = pe.id)))
     LEFT JOIN profiles pr ON ((c.dono_atual_id = pr.id)))
     LEFT JOIN profiles sdr ON ((c.sdr_owner_id = sdr.id)))
     LEFT JOIN profiles vendas ON ((c.vendas_owner_id = vendas.id)))
     LEFT JOIN profiles pos_prof ON ((c.pos_owner_id = pos_prof.id)))
     LEFT JOIN profiles concierge_prof ON ((c.concierge_owner_id = concierge_prof.id)))
     LEFT JOIN ( SELECT arquivos.card_id,
            count(*) AS anexos_count
           FROM arquivos
          GROUP BY arquivos.card_id) ac ON ((ac.card_id = c.id)))
     LEFT JOIN ( SELECT card_financial_items.card_id,
            count(*) AS prods_total,
            count(*) FILTER (WHERE (card_financial_items.is_ready = true)) AS prods_ready,
            SUM(card_financial_items.sale_value) AS total_fechado,
            SUM(card_financial_items.sale_value - card_financial_items.supplier_cost) AS total_receita_items
           FROM card_financial_items
          WHERE (card_financial_items.archived_at IS NULL)
          GROUP BY card_financial_items.card_id) prd ON ((prd.card_id = c.id)))
     LEFT JOIN ( SELECT cards.parent_card_id,
            count(*) AS active_count
           FROM cards
          WHERE ((cards.card_type = 'sub_card'::text) AND (cards.sub_card_status = 'active'::text) AND (cards.deleted_at IS NULL))
          GROUP BY cards.parent_card_id) sc_count ON ((sc_count.parent_card_id = c.id)))
     LEFT JOIN cards parent_card ON (((c.parent_card_id = parent_card.id) AND (c.card_type = 'sub_card'::text))))
  WHERE (c.deleted_at IS NULL);
