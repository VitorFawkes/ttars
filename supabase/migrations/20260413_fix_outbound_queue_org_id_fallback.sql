-- Fix: integration_outbound_queue.org_id fallback quando trigger insere sem JWT
--
-- Problema:
--   Em 2026-04-13, UPDATE em cards via backfill (contexto sem JWT) disparou
--   trg_card_outbound_sync → log_outbound_card_event (SECURITY DEFINER) → INSERT
--   em integration_outbound_queue. A INSERT não passa org_id, então o default
--   `requesting_org_id()` foi avaliado. Como não há JWT, retornou NULL → violação
--   NOT NULL (erro 23502).
--
-- Root cause:
--   1. Três trigger functions inserem em integration_outbound_queue sem passar
--      NEW.org_id: log_outbound_card_event, log_outbound_tarefa_event (e
--      handle_outbound_webhook, que só faz net.http_post mas não insere).
--   2. DEFAULT da coluna é `requesting_org_id()` — retorna NULL sem JWT (ex.
--      psql como postgres, service_role direto, pg_cron, backfills).
--   3. Nenhuma das trigger functions pode ser facilmente modificada sem riscar
--      regredir a lógica de roteamento (são funções grandes com muitos INSERTs).
--
-- Fix:
--   Criar trigger BEFORE INSERT em integration_outbound_queue que resolve
--   org_id a partir do card.org_id (card_id já é obrigatório para todos os
--   eventos gerados). Isso é consistente com o padrão `auto_set_org_id_from_card`
--   já aplicado em tarefas/reunioes/mensagens/etc (migration 20260402_h3_013).
--
-- Decisão: NÃO fazer fallback para Welcome Group (como h3_013 faz). Após o
-- Org Split (Fase 5), TRIPS e WEDDING são orgs separadas — um card WEDDING que
-- caísse em Welcome Group como fallback causaria leak entre orgs. Se card_id é
-- NULL E requesting_org_id() é NULL, é melhor falhar alto (erro claro) do que
-- cross-contaminar.

CREATE OR REPLACE FUNCTION public.auto_set_outbound_queue_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Preservar org_id se o caller passou explicitamente
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- 1ª tentativa: JWT (contexto de usuário autenticado)
    NEW.org_id := requesting_org_id();

    -- 2ª tentativa: derivar do card (SECURITY DEFINER, bypass RLS).
    -- Funciona para contextos sem JWT: pg_cron, psql service_role, backfills.
    IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id
        FROM public.cards
        WHERE id = NEW.card_id;
    END IF;

    -- 3ª tentativa: via tarefa → card (log_outbound_tarefa_event passa tarefa_id
    -- mas também card_id, então normalmente já resolvido acima; este é backup).
    IF NEW.org_id IS NULL AND NEW.tarefa_id IS NOT NULL THEN
        SELECT c.org_id INTO NEW.org_id
        FROM public.tarefas t
        JOIN public.cards c ON c.id = t.card_id
        WHERE t.id = NEW.tarefa_id;
    END IF;

    -- Se ainda NULL, deixa a NOT NULL constraint abortar com erro claro.
    -- NÃO hardcodar Welcome Group: pós Org Split, cross-contamina orgs.

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_set_outbound_queue_org_id_trigger
    ON public.integration_outbound_queue;

CREATE TRIGGER auto_set_outbound_queue_org_id_trigger
    BEFORE INSERT ON public.integration_outbound_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_set_outbound_queue_org_id();

COMMENT ON FUNCTION public.auto_set_outbound_queue_org_id() IS
    'Preenche org_id em integration_outbound_queue via cascade JWT→card→tarefa. '
    'Necessário porque log_outbound_card_event/log_outbound_tarefa_event (SECURITY '
    'DEFINER) não passam NEW.org_id, e o default requesting_org_id() retorna NULL '
    'em contextos sem JWT (pg_cron, backfills, service_role direto).';
