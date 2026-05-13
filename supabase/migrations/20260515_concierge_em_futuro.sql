-- =====================================================================
-- 20260515: trocar tarefas.concierge_futuro_em (TIMESTAMPTZ) por
-- tarefas.concierge_em_futuro (BOOLEAN). Migration consolidada
-- (faz coluna + view na ordem correta — drop view ANTES de drop column).
--
-- Decisao de produto: o concierge nao precisa de uma data planejada
-- de retorno separada do prazo da tarefa. O flag passa a ser so um
-- "esta estocado em Futuro?" boolean. O aviso visual de proximidade
-- usa data_vencimento da tarefa (pulse na coluna + cor no card).
--
-- Esta migration e idempotente: se aplicada parcialmente antes, segue
-- do estado em que ficou. Refaz a view ao final.
--
-- Tentativa anterior (20260515_*.sql + 20260515b_*.sql) falhou em
-- producao porque o promote-to-prod.sh nao detecta erro silencioso
-- no JSON de resposta (ver memory/feedback_migration_silent_failure.md).
-- =====================================================================

BEGIN;

-- View depende de concierge_futuro_em, precisa ser dropada antes
DROP VIEW IF EXISTS public.v_meu_dia_concierge;

-- Adiciona o boolean (no-op se ja foi criado)
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS concierge_em_futuro BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.tarefas.concierge_em_futuro IS
  'Flag sticky do kanban Concierge: TRUE = card fica na coluna "Agendados para o futuro" indefinidamente, ate alguem tirar. FALSE = fluxo normal. Aviso visual de proximidade usa data_vencimento.';

-- Migra dados da coluna antiga (so se ainda existir — idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tarefas'
      AND column_name = 'concierge_futuro_em'
  ) THEN
    UPDATE public.tarefas
       SET concierge_em_futuro = TRUE
     WHERE concierge_futuro_em IS NOT NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_tarefas_concierge_futuro_em;

ALTER TABLE public.tarefas
  DROP COLUMN IF EXISTS concierge_futuro_em;

CREATE INDEX IF NOT EXISTS idx_tarefas_concierge_em_futuro
  ON public.tarefas (concierge_em_futuro)
  WHERE concierge_em_futuro = TRUE;

-- Recria view com novo campo (mesma definicao do 20260514c, so trocando
-- concierge_futuro_em por concierge_em_futuro)
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
