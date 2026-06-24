-- Fase 4 (Planejamento Weddings) — passo 3 de 3: a cobrança 🔁 DISPARA SOZINHA.
--
-- Decisão D-P2 (Diana/Vitor): tarefa que depende do casal/terceiro e venceu o
-- prazo gera uma cobrança automática ("hotel não respondeu em 2 dias → recobrar
-- hotel"). Responsabilidade nossa, modelo follow de vendas.
--
-- COMO (sem inventar infra): clona o padrão canônico já vivo em produção
-- 'push-overdue-tasks' (check_overdue_tasks_push, pg_cron + função SQL pura).
-- A função LÊ wedding_checklist (tarefa gera_cobranca=true, prazo vencido, não
-- feita) e ESCREVE uma tarefa de recobrança na tabela NATIVA 'tarefas' (não na
-- espinha do checklist — a migração wedding_checklist→tarefas é a Fase 5).
-- Responsável = planejadora (pos_owner_id) ou, na falta, o dono atual do card
-- (dono_atual_id). Com responsável, a recobrança aparece em Meu Dia / Agenda /
-- CardTasks; sem nenhum (card órfão), fica visível no próprio card.
--
-- DEDUP (a cada 30 min): não cria nova recobrança se já existe uma tarefa ATIVA
-- (não concluída, não deletada) carimbada com metadata.wedding_checklist_id = id.
-- Quando a planejadora conclui a recobrança e a tarefa-mãe segue vencida, a
-- próxima passada cria outra → cadência de follow, exatamente o pedido.
--
-- Isolamento: filtra produto WEDDING e carimba org_id do card (cron roda sem JWT
-- → requesting_org_id() seria NULL; ver feedback_org_id_trigger_inserts).
-- Governança: registrado em scheduled_job_kill_switch (a gestora pausa pela UI).

BEGIN;

-- índice pro dedup (lookup por metadata.wedding_checklist_id)
CREATE INDEX IF NOT EXISTS idx_tarefas_ww_cobranca_checklist
  ON public.tarefas ((metadata->>'wedding_checklist_id'));

CREATE OR REPLACE FUNCTION public.ww_gerar_cobrancas_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_created INT := 0;
BEGIN
  -- Kill switch (a gestora pausa pela UI sem SQL)
  IF NOT public.scheduled_job_is_enabled('ww-cobranca-tarefas-vencidas') THEN
    RETURN 0;
  END IF;

  -- Blindagem (padrão canônico WW 20260619e): marca a origem como integração pra
  -- o trigger de outbound de tarefa pular o evento de saída ao AC. Inócuo hoje
  -- (sem sync de tarefas WEDDING↔AC), mas evita push espúrio se for ligado.
  PERFORM set_config('app.update_source', 'integration', true);

  INSERT INTO public.tarefas (
    card_id, titulo, descricao, tipo, prioridade,
    data_vencimento, responsavel_id, created_by, status, concluida, org_id, metadata
  )
  SELECT
    wc.card_id,
    '🔁 Recobrar: ' || wc.titulo,
    'Cobrança automática — o prazo de “' || wc.titulo || '” venceu em '
      || to_char(wc.prazo, 'DD/MM/YYYY') || '. Faça o follow-up com o casal/fornecedor.',
    'contato',
    'alta',
    now(),
    COALESCE(c.pos_owner_id, c.dono_atual_id),  -- planejadora; senão dono do card; senão órfã (só no card)
    NULL,                    -- created_by NULL = sistema
    'pendente',
    false,
    c.org_id,
    jsonb_build_object(
      'kind', 'ww_cobranca',
      'wedding_checklist_id', wc.id,
      'stage_id', wc.stage_id,
      'marco', wc.marco,
      'prazo_original', wc.prazo
    )
  FROM public.wedding_checklist wc
  JOIN public.cards c        ON c.id = wc.card_id
  JOIN public.pipelines p    ON p.id = c.pipeline_id
  WHERE p.produto::TEXT = 'WEDDING'
    AND wc.gera_cobranca = true
    AND wc.feito = false
    AND wc.prazo IS NOT NULL
    AND wc.prazo < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.tarefas t
       WHERE t.deleted_at IS NULL
         AND t.concluida = false
         AND t.metadata->>'wedding_checklist_id' = wc.id::text
    );

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END
$fn$;

COMMENT ON FUNCTION public.ww_gerar_cobrancas_vencidas() IS
  'Fase 4 Weddings: cria tarefa de recobrança (tabela nativa tarefas, tipo=contato) para cada wedding_checklist gera_cobranca=true vencida e não feita, sem duplicar (dedup por metadata.wedding_checklist_id). Chamada pelo cron ww-cobranca-tarefas-vencidas.';

-- Governança: registra o job (a gestora pausa pela UI; default habilitado)
INSERT INTO public.scheduled_job_kill_switch (job_name, label, description, category, frequency_label)
VALUES (
  'ww-cobranca-tarefas-vencidas',
  'Cobrança automática (Planejamento Weddings)',
  'Quando uma tarefa do casamento marcada como 🔁 cobrança vence o prazo e não foi feita, cria sozinha uma tarefa de recobrança para a planejadora.',
  'cadence',
  'a cada 30 min (dias úteis, 9h–18h SP)'
)
ON CONFLICT (job_name) DO NOTHING;

-- Cron pg_cron — 9h–18h BRT (12–21h UTC), seg–sex, igual ao push-overdue-tasks.
DO $$
BEGIN
  PERFORM cron.unschedule('ww-cobranca-tarefas-vencidas')
     FROM cron.job WHERE jobname = 'ww-cobranca-tarefas-vencidas';
  PERFORM cron.schedule(
    'ww-cobranca-tarefas-vencidas',
    '*/30 12-21 * * 1-5',
    $cmd$
    SELECT CASE WHEN public.scheduled_job_is_enabled('ww-cobranca-tarefas-vencidas')
      THEN public.ww_gerar_cobrancas_vencidas()::TEXT
      ELSE 'paused' END;
    $cmd$
  );
END $$;

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_fn INT; v_job INT; v_sw INT;
BEGIN
  SELECT count(*) INTO v_fn FROM pg_proc WHERE proname = 'ww_gerar_cobrancas_vencidas';
  IF v_fn = 0 THEN RAISE EXCEPTION 'cobranca: função não criada'; END IF;

  SELECT count(*) INTO v_sw FROM public.scheduled_job_kill_switch
   WHERE job_name = 'ww-cobranca-tarefas-vencidas';
  IF v_sw = 0 THEN RAISE EXCEPTION 'cobranca: kill switch não registrado'; END IF;

  SELECT count(*) INTO v_job FROM cron.job WHERE jobname = 'ww-cobranca-tarefas-vencidas';
  IF v_job = 0 THEN RAISE EXCEPTION 'cobranca: cron não agendado'; END IF;

  RAISE NOTICE 'cobrança automática Weddings: OK (função + switch + cron)';
END $$;
