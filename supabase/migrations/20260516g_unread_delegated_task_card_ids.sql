-- RPC: retorna ids de cards onde o usuário logado tem tarefa pendente
-- criada por OUTRA pessoa (ou pelo sistema, created_by NULL) e ainda
-- não abriu o card desde que a tarefa foi criada.
-- SECURITY INVOKER: respeita RLS (tarefas por-org, card_opens por-user).

CREATE OR REPLACE FUNCTION public.get_unread_delegated_task_card_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT t.card_id), '{}'::uuid[])
  FROM public.tarefas t
  LEFT JOIN public.card_opens co
    ON co.card_id = t.card_id AND co.user_id = auth.uid()
  WHERE t.responsavel_id = auth.uid()
    AND (t.created_by IS NULL OR t.created_by <> t.responsavel_id)
    AND t.concluida = false
    AND t.status = 'pendente'
    AND t.org_id = requesting_org_id()
    AND t.card_id IS NOT NULL
    AND (co.last_opened_at IS NULL OR co.last_opened_at < t.created_at)
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_delegated_task_card_ids() TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel_pendente
  ON public.tarefas(responsavel_id, card_id)
  WHERE concluida = false AND status = 'pendente';

COMMENT ON FUNCTION public.get_unread_delegated_task_card_ids() IS
  'Retorna card_ids onde o usuário tem tarefa pendente delegada (não-autocriada) e ainda não abriu o card desde a criação. created_by NULL conta como sistema/automação → considerado delegação.';
