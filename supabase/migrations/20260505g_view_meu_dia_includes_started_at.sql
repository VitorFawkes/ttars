-- =====================================================================
-- 20260505g: estende v_meu_dia_concierge expondo tarefas.started_at.
--
-- Motivo: o Kanban /concierge ganhou uma nova coluna "Aguardando
-- atendimento" no início do funil. A diferença entre essa coluna e
-- "Em contato" é tarefas.started_at: NULL = aguardando, NOT NULL =
-- em atendimento. O frontend precisa ver esse campo na view.
--
-- Sem esse campo, todos os atendimentos abertos cairiam na primeira
-- coluna pra sempre.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_meu_dia_concierge;
CREATE VIEW public.v_meu_dia_concierge AS
 SELECT t.id AS tarefa_id,
    t.titulo,
    t.descricao,
    t.data_vencimento,
    t.prioridade,
    t.status AS tarefa_status,
    t.concluida,
    t.concluida_em,
    t.started_at,
    t.responsavel_id AS dono_id,
    t.card_id,
    t.created_by AS tarefa_criada_por,
    t.created_at AS tarefa_criada_em,
    c.titulo AS card_titulo,
    c.produto,
    c.data_viagem_inicio,
    c.data_viagem_fim,
    c.pipeline_stage_id,
    c.pessoa_principal_id,
    c.valor_estimado AS card_valor_estimado,
    c.valor_final AS card_valor_final,
    c.is_critical AS card_is_critical,
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
        CASE
            WHEN t.concluida THEN 'concluido'::text
            WHEN ac.outcome IS NOT NULL AND ac.outcome <> 'aceito'::text THEN 'fechado'::text
            WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento < now() AND t.concluida = false THEN 'vencido'::text
            WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento::date = CURRENT_DATE THEN 'hoje'::text
            WHEN t.data_vencimento IS NOT NULL AND t.data_vencimento::date <= (CURRENT_DATE + '7 days'::interval)::date THEN 'esta_semana'::text
            ELSE 'futuro'::text
        END AS status_apresentacao,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())::integer
            ELSE NULL::integer
        END AS dias_pra_embarque
   FROM public.tarefas t
     JOIN public.atendimentos_concierge ac ON ac.tarefa_id = t.id
     JOIN public.cards c ON c.id = t.card_id
  WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL;

GRANT SELECT ON public.v_meu_dia_concierge TO anon, authenticated, service_role;

COMMIT;
