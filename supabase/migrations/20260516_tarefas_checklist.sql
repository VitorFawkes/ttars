-- =====================================================================
-- 20260516: tarefas.checklist (JSONB)
--
-- Checklist interno por tarefa do Concierge — array de itens leves
-- (texto + checkbox). Caso real: tarefa "Compra de ingressos JUL2026"
-- com 7 itens (cada ingresso e' uma linha), em vez de criar 7 tarefas
-- separadas porque cada um abre venda em data diferente.
--
-- Shape de cada item:
--   { "id": "uuid", "texto": "string livre", "feito": bool, "ordem": int }
--
-- Sem campos extras (data por item, responsavel por item) — o texto
-- livre cobre. Default '[]' garante array vazio em tarefas existentes.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_meu_dia_concierge;

ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tarefas.checklist IS
  'Checklist interno da tarefa (Concierge): array de itens [{id, texto, feito, ordem}]. Texto livre + checkbox. Quando 100% feito, a UI sugere concluir a tarefa (sem auto-fechar).';

-- Recria view com novo campo (mesma definicao da 20260515c, so adiciona t.checklist)
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
    t.concierge_em_futuro,
    t.concierge_aviso_dias,
    t.checklist,
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
     LEFT JOIN public.cards cr ON cr.id = COALESCE(c.parent_card_id, c.id) AND cr.deleted_at IS NULL
     LEFT JOIN public.contatos pess_root ON pess_root.id = cr.pessoa_principal_id
  WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL;

GRANT SELECT ON public.v_meu_dia_concierge TO anon, authenticated, service_role;

COMMIT;
