-- =====================================================================
-- 20260512: v_meu_dia_concierge passa a expor nome COMPLETO do contato
-- principal (nome + sobrenome), tanto do card direto quanto do root card.
--
-- Antes: pessoa_principal_nome = pess.nome (só primeiro nome)
-- Depois: pessoa_principal_nome = TRIM(nome || ' ' || sobrenome)
--
-- Mesmo padrão usado em view_cards_acoes (20260512f), garantindo
-- consistência entre as views.
--
-- Base: 20260507a_view_meu_dia_root_card.sql (última versão da view).
-- Só duas linhas mudam — as colunas pessoa_principal_nome e
-- root_pessoa_principal_nome.
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
    TRIM(BOTH FROM (COALESCE(pess.nome, ''::text) || ' '::text) || COALESCE(pess.sobrenome, ''::text)) AS pessoa_principal_nome,
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
    END AS dias_pra_embarque,
    -- Card raiz: o card principal da viagem. Se a linha já é do principal,
    -- root = próprio card. Se é de um sub-card, root = parent_card_id.
    COALESCE(c.parent_card_id, c.id) AS root_card_id,
    cr.titulo AS root_card_titulo,
    cr.produto AS root_produto,
    cr.data_viagem_inicio AS root_data_viagem_inicio,
    cr.data_viagem_fim AS root_data_viagem_fim,
    cr.pipeline_stage_id AS root_pipeline_stage_id,
    cr.pessoa_principal_id AS root_pessoa_principal_id,
    TRIM(BOTH FROM (COALESCE(pess_root.nome, ''::text) || ' '::text) || COALESCE(pess_root.sobrenome, ''::text)) AS root_pessoa_principal_nome,
    cr.valor_estimado AS root_valor_estimado,
    cr.valor_final AS root_valor_final,
    cr.is_critical AS root_is_critical,
    (c.parent_card_id IS NOT NULL) AS is_from_sub_card
   FROM public.tarefas t
     JOIN public.atendimentos_concierge ac ON ac.tarefa_id = t.id
     JOIN public.cards c ON c.id = t.card_id
     LEFT JOIN public.contatos pess ON pess.id = c.pessoa_principal_id
     -- Root card: ignoramos pais soft-deletados — atendimentos órfãos exibem
     -- root_* como NULL e o frontend cai no fallback para campos do próprio card.
     LEFT JOIN public.cards cr ON cr.id = COALESCE(c.parent_card_id, c.id) AND cr.deleted_at IS NULL
     LEFT JOIN public.contatos pess_root ON pess_root.id = cr.pessoa_principal_id
  WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL;

GRANT SELECT ON public.v_meu_dia_concierge TO anon, authenticated, service_role;

COMMIT;
